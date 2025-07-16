/// Validates that fragment definitions do not form cycles.
///
/// This rule ensures that fragments do not reference themselves, either directly
/// or through a chain of other fragments. Cycles in fragment definitions would
/// cause infinite recursion during query execution.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragment-spreads-must-not-form-cycles
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Span;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct NoFragmentCycles<'a> {
    fragments: Vec<(&'a str, Vec<&'a str>, Span)>,
    current_fragment: Option<&'a str>,
    current_fragment_span: Option<Span>,
    current_spreads: Vec<&'a str>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for NoFragmentCycles<'a> {
    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        self.current_fragment = Some(fragment.name.as_str());
        self.current_fragment_span = Some(fragment.span);
        self.current_spreads = Vec::new();
        Control::Next
    }

    fn leave_fragment(&mut self, _ctx: &mut ValidationContext<'a>, _fragment: &FragmentDefinition<'a>) -> Control {
        if let Some(fragment_name) = self.current_fragment
            && let Some(fragment_span) = &self.current_fragment_span
        {
            self.fragments
                .push((fragment_name, self.current_spreads.clone(), *fragment_span));
        }
        self.current_fragment = None;
        self.current_fragment_span = None;
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        if self.current_fragment.is_some() {
            self.current_spreads.push(fragment_spread.fragment_name.as_str());
        }
        Control::Next
    }

    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, _operation: &OperationDefinition<'a>) -> Control {
        Control::Skip
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a>, _document: &Document<'a>) -> Control {
        for (fragment_name, _, fragment_span) in &self.fragments {
            let mut visited = Vec::new();
            let mut rec_stack = Vec::new();

            if has_cycle(fragment_name, &self.fragments, &mut visited, &mut rec_stack) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: "Fragment definitions must not form cycles.".to_string(),
                    },
                    location: Some(ctx.location_from_span(*fragment_span)),
                });
                break;
            }
        }
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for NoFragmentCycles<'a> {}

fn has_cycle<'a>(
    fragment_name: &'a str,
    fragments: &[(&'a str, Vec<&'a str>, Span)],
    visited: &mut Vec<&'a str>,
    rec_stack: &mut Vec<&'a str>,
) -> bool {
    if rec_stack.contains(&fragment_name) {
        return true;
    }
    if visited.contains(&fragment_name) {
        return false;
    }

    visited.push(fragment_name);
    rec_stack.push(fragment_name);

    if let Some((_, spreads, _)) = fragments.iter().find(|(name, _, _)| *name == fragment_name) {
        for spread in spreads {
            if has_cycle(spread, fragments, visited, rec_stack) {
                return true;
            }
        }
    }

    rec_stack.retain(|&n| n != fragment_name);
    false
}

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
        let mut rule = NoFragmentCycles::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = def {
                rule.enter_fragment(&mut ctx, frag);
                for selection in frag.selection_set.selections.iter() {
                    if let Selection::FragmentSpread(spread) = selection {
                        rule.enter_fragment_spread(&mut ctx, spread);
                    }
                }
                rule.leave_fragment(&mut ctx, frag);
            }
        }
        rule.leave_document(&mut ctx, doc);

        ctx.errors().len()
    }

    #[test]
    fn test_no_fragment_cycles_valid() {
        assert_eq!(validate(r#"fragment A on User { id } fragment B on User { ...A }"#), 0);
    }

    #[test]
    fn test_no_fragment_cycles_direct_cycle() {
        assert!(validate(r#"fragment A on User { id ...A }"#) > 0);
    }

    #[test]
    fn test_no_fragment_cycles_indirect_cycle() {
        assert!(validate(r#"fragment A on User { ...B } fragment B on User { ...C } fragment C on User { ...A }"#) > 0);
    }

    #[test]
    fn test_no_fragment_cycles_no_cycles() {
        assert_eq!(
            validate(r#"fragment A on User { id ...B } fragment B on User { name }"#),
            0
        );
    }

    #[test]
    fn test_no_fragment_cycles_complex_chain() {
        assert_eq!(
            validate(
                r#"fragment A on User { ...B } fragment B on User { ...C } fragment C on User { ...D } fragment D on User { id }"#
            ),
            0
        );
    }

    #[test]
    fn test_no_fragment_cycles_two_way_cycle() {
        assert!(validate(r#"fragment A on User { ...B } fragment B on User { ...A }"#) > 0);
    }

    #[test]
    fn test_no_fragment_cycles_self_reference_with_fields() {
        assert!(validate(r#"fragment A on User { id name ...A email }"#) > 0);
    }
}
