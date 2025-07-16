/// Validates that input object field names are unique.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Input-Object-Field-Uniqueness
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Location;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashSet;

#[derive(Default)]
pub struct InputObjectFieldUniqueness;

impl<'a> Visitor<'a, ValidationContext<'a>> for InputObjectFieldUniqueness {
    fn enter_argument(&mut self, ctx: &mut ValidationContext<'a>, argument: &Argument<'a>) -> Control {
        if let Value::Object(fields) = &argument.value {
            check_field_uniqueness(ctx, fields);
        }
        Control::Next
    }
}

fn check_field_uniqueness<'a>(ctx: &mut ValidationContext<'a>, fields: &[ObjectField]) {
    let mut seen_fields = FxHashSet::default();

    for field in fields {
        let field_name = field.name.as_str();

        if !seen_fields.insert(field_name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!("Duplicate input object field '{}'", field_name),
                },
                location: Some(Location::empty()),
            });
        }

        // Recursively check nested objects
        if let Value::Object(nested_fields) = &field.value {
            check_field_uniqueness(ctx, nested_fields);
        } else if let Value::List(values) = &field.value {
            for value in values {
                if let Value::Object(nested_fields) = value {
                    check_field_uniqueness(ctx, nested_fields);
                }
            }
        }
    }
}

impl<'a> ValidationRule<'a> for InputObjectFieldUniqueness {}

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
    use crate::validation::rule::ValidateNode;
    use crate::validation::test_schema::TestSchema;

    fn validate(source: &str) -> Result<(), MearieError> {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        doc.validate::<InputObjectFieldUniqueness>(&schema)
    }

    #[test]
    fn test_input_object_field_uniqueness_valid() {
        let result = validate("query Test($input: Input!) { field(arg: { a: 1, b: 2, c: 3 }) }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_input_object_field_uniqueness_duplicate() {
        let result = validate("query Test { field(arg: { a: 1, a: 2 }) }");
        assert!(result.is_err());
    }

    #[test]
    fn test_input_object_field_uniqueness_nested() {
        let result = validate("query Test { field(arg: { a: 1, nested: { x: 1, x: 2 } }) }");
        assert!(result.is_err());
    }

    #[test]
    fn test_input_object_field_uniqueness_list_valid() {
        let result = validate("query Test { field(arg: { items: [{ a: 1, b: 2 }, { a: 3, b: 4 }] }) }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_input_object_field_uniqueness_list_duplicate() {
        let result = validate("query Test { field(arg: { items: [{ a: 1, a: 2 }] }) }");
        assert!(result.is_err());
    }

    #[test]
    fn test_input_object_field_uniqueness_nested_list_duplicate() {
        let result = validate("query Test { field(arg: { outer: [{ inner: { x: 1, x: 2 } }] }) }");
        assert!(result.is_err());
    }
}
