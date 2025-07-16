/// Validates that literal values are of the correct type.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Values-of-Correct-Type
use crate::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct ValuesOfCorrectType;

impl<'a> Visitor<'a, ValidationContext<'a>> for ValuesOfCorrectType {
    fn enter_argument(&mut self, _ctx: &mut ValidationContext<'a>, _argument: &Argument<'a>) -> Control {
        // TODO: Check if argument value matches expected type
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for ValuesOfCorrectType {}

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
        let mut rule = ValuesOfCorrectType;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def
                && let Some(Selection::Field(field)) = op.selection_set.selections.first()
            {
                for arg in field.arguments.iter() {
                    rule.enter_argument(&mut ctx, arg);
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_field_with_string_argument() {
        assert_eq!(validate(r#"query Q { field(arg: "value") }"#), 0);
    }

    #[test]
    fn test_field_with_int_argument() {
        assert_eq!(validate(r#"query Q { field(arg: 42) }"#), 0);
    }

    #[test]
    fn test_field_with_boolean_argument() {
        assert_eq!(validate(r#"query Q { field(arg: true) }"#), 0);
    }

    #[test]
    fn test_field_with_variable_argument() {
        assert_eq!(validate(r#"query Q($var: String) { field(arg: $var) }"#), 0);
    }

    #[test]
    fn test_field_with_float_argument() {
        assert_eq!(validate(r#"query Q { field(arg: 3.14) }"#), 0);
    }

    #[test]
    fn test_field_with_list_argument() {
        assert_eq!(validate(r#"query Q { field(arg: [1, 2, 3]) }"#), 0);
    }

    #[test]
    fn test_field_with_object_argument() {
        assert_eq!(validate(r#"query Q { field(arg: {key: "value", count: 42}) }"#), 0);
    }
}
