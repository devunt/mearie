/// Validates that all defined fragments are used in the document.
///
/// This rule ensures that every fragment defined in a document is actually used
/// at least once in a query, mutation, subscription, or another fragment. Unused
/// fragments are considered dead code and should be removed.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragments-Must-Be-Used
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Span;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FragmentsMustBeUsed<'a> {
    fragment_names: Vec<(&'a str, Span)>,
    used_fragments: Vec<&'a str>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for FragmentsMustBeUsed<'a> {
    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        self.fragment_names.push((fragment.name.as_str(), fragment.span));
        Control::Skip
    }

    fn enter_fragment_spread(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.used_fragments.push(fragment_spread.fragment_name.as_str());
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        _inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        Control::Next
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a>, _document: &Document<'a>) -> Control {
        for (fragment_name, fragment_span) in &self.fragment_names {
            if !self.used_fragments.contains(fragment_name) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: "All defined fragments must be used at least once.".to_string(),
                    },
                    location: Some(ctx.location_from_span(*fragment_span)),
                });
            }
        }
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for FragmentsMustBeUsed<'a> {}

#[cfg(test)]
mod tests {
    use crate::span::Source;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }
    use super::*;
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::validation::test_schema::TestSchema;

    fn validate(source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = FragmentsMustBeUsed::default();

        for def in doc.definitions.iter() {
            match def {
                Definition::Executable(ExecutableDefinition::Fragment(frag)) => {
                    rule.enter_fragment(&mut ctx, frag);
                }
                Definition::Executable(ExecutableDefinition::Operation(op)) => {
                    if let Some(Selection::Field(field)) = op.selection_set.selections.first() {
                        for sel in field.selection_set.selections.iter() {
                            if let Selection::FragmentSpread(spread) = sel {
                                rule.enter_fragment_spread(&mut ctx, spread);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        rule.leave_document(&mut ctx, doc);

        ctx.errors().len()
    }

    #[test]
    fn test_no_unused_fragments_valid() {
        assert_eq!(
            validate("fragment UserFields on User { id } query Q { user { ...UserFields } }"),
            0
        );
    }

    #[test]
    fn test_no_unused_fragments_unused() {
        assert!(validate("fragment UnusedFragment on User { id } query Q { user { id } }") > 0);
    }

    #[test]
    fn test_no_unused_fragments_partial_usage() {
        assert!(
            validate(
                "fragment UsedFragment on User { id } fragment UnusedFragment on Post { title } query Q { user { ...UsedFragment } }"
            ) > 0
        );
    }

    #[test]
    fn test_no_unused_fragments_all_used() {
        assert_eq!(
            validate(
                "query { user { ...UserFields ...UserEmail } } fragment UserFields on User { id name } fragment UserEmail on User { email }"
            ),
            0
        );
    }

    #[test]
    fn test_no_unused_fragments_multiple_unused() {
        assert!(
            validate(
                "fragment A on User { id } fragment B on Post { title } fragment C on Comment { text } query Q { user { id } }"
            ) > 0
        );
    }

    #[test]
    fn test_no_unused_fragments_nested_usage() {
        assert!(validate("fragment A on User { id } fragment B on User { ...A name } query Q { user { ...B } }") > 0);
    }

    #[test]
    fn test_no_unused_fragments_no_fragments() {
        assert_eq!(validate("query Q { user { id name } }"), 0);
    }
}
