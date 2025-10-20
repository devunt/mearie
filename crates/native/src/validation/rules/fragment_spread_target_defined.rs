/// Validates that fragment spreads reference defined fragments.
///
/// This rule ensures that all fragment spreads in a document refer to fragments
/// that are actually defined. A fragment spread that references a non-existent
/// fragment will cause a validation error.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragment-spread-target-defined
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Span;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FragmentSpreadTargetDefined<'a> {
    fragment_names: Vec<&'a str>,
    fragment_spreads: Vec<(&'a str, Span)>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for FragmentSpreadTargetDefined<'a> {
    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        self.fragment_names.push(fragment.name.as_str());
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.fragment_spreads
            .push((fragment_spread.fragment_name.as_str(), fragment_spread.span));
        Control::Skip
    }

    fn enter_variable_definition(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        _var_def: &VariableDefinition<'a>,
    ) -> Control {
        Control::Skip
    }

    fn enter_argument(&mut self, _ctx: &mut ValidationContext<'a>, _argument: &Argument<'a>) -> Control {
        Control::Skip
    }

    fn enter_directive(&mut self, _ctx: &mut ValidationContext<'a>, _directive: &Directive<'a>) -> Control {
        Control::Skip
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a>, _document: &Document<'a>) -> Control {
        for (spread_name, spread_span) in &self.fragment_spreads {
            if !self.fragment_names.contains(spread_name) && ctx.schema().get_fragment(spread_name).is_none() {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: "Only known fragments may occur in fragment spreads.".to_string(),
                    },
                    location: Some(ctx.location_from_span(*spread_span)),
                });
            }
        }
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for FragmentSpreadTargetDefined<'a> {}

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
        let mut rule = FragmentSpreadTargetDefined::default();

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
    fn test_known_fragment_names_valid() {
        assert_eq!(
            validate("fragment UserFields on User { id } query Q { user { ...UserFields } }"),
            0
        );
    }

    #[test]
    fn test_known_fragment_names_unknown() {
        assert!(validate("query Q { user { ...UnknownFragment } }") > 0);
    }

    #[test]
    fn test_known_fragment_names_multiple_spreads() {
        assert!(validate("fragment A on User { id } query Q { user { ...A ...B } }") > 0);
    }

    #[test]
    fn test_known_fragment_names_multiple_undefined() {
        assert!(validate("query { user { ...Frag1 ...Frag2 } }") > 0);
    }

    #[test]
    fn test_known_fragment_names_nested_spreads() {
        assert_eq!(
            validate("fragment A on User { id } fragment B on User { ...A } query Q { user { ...B } }"),
            0
        );
    }

    #[test]
    fn test_known_fragment_names_multiple_valid_spreads() {
        assert_eq!(
            validate("fragment A on User { id } fragment B on Post { title } query Q { user { ...A } post { ...B } }"),
            0
        );
    }

    #[test]
    fn test_known_fragment_names_mixed_valid_invalid() {
        assert!(validate("fragment A on User { id } query Q { user { ...A ...Unknown } }") > 0);
    }
}
