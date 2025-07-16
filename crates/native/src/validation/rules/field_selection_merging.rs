/// Validates that fields can be merged when they appear multiple times.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Field-Selection-Merging
use crate::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FieldSelectionMerging;

impl<'a> Visitor<'a, ValidationContext<'a>> for FieldSelectionMerging {
    fn enter_selection_set(&mut self, _ctx: &mut ValidationContext<'a>, _selection_set: &SelectionSet<'a>) -> Control {
        // TODO: Check if fields with same response key can be merged
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for FieldSelectionMerging {}

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
        let mut rule = FieldSelectionMerging;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_selection_set(&mut ctx, &op.selection_set);
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_basic_query_with_fields() {
        assert_eq!(validate("query Q { field1 field2 }"), 0);
    }

    #[test]
    fn test_duplicate_fields_same_alias() {
        assert_eq!(validate("query Q { field field }"), 0);
    }

    #[test]
    fn test_nested_selection_sets() {
        assert_eq!(validate("query Q { user { id name } }"), 0);
    }

    #[test]
    fn test_fields_with_different_aliases() {
        assert_eq!(validate("query Q { alias1: field alias2: field }"), 0);
    }

    #[test]
    fn test_fragment_with_duplicate_fields() {
        assert_eq!(validate("fragment F on User { id id } query Q { user { ...F } }"), 0);
    }

    #[test]
    fn test_inline_fragment_fields() {
        assert_eq!(validate("query Q { user { id ... on User { name } } }"), 0);
    }

    #[test]
    fn test_deeply_nested_selection_sets() {
        assert_eq!(validate("query Q { user { posts { comments { id } } } }"), 0);
    }
}
