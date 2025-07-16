/// Validates that all required input object fields are provided.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Input-Object-Required-Fields
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Location;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashSet;

#[derive(Default)]
pub struct InputObjectRequiredFields;

fn validate_value<'a>(ctx: &mut ValidationContext<'a>, value: &Value<'a>, expected_type: &Type<'a>) {
    let schema = ctx.schema();

    let type_name = get_named_type(expected_type);

    match value {
        Value::Object(fields) => {
            if let Some(input_obj_def) = schema.get_input_object_definition(type_name) {
                let provided_fields: FxHashSet<&str> = fields.iter().map(|f| f.name.as_str()).collect();

                for field_def in input_obj_def.fields.iter() {
                    let field_name = field_def.name.as_str();
                    let is_required = matches!(field_def.typ, Type::NonNull(_)) && field_def.default_value.is_none();

                    if is_required && !provided_fields.contains(field_name) {
                        ctx.add_error(MearieError {
                            kind: ErrorKind::ValidationError {
                                message: format!(
                                    "Required field '{}' on input object type '{}' is not provided",
                                    field_name, type_name
                                ),
                            },
                            location: Some(Location::empty()),
                        });
                    }
                }

                for field in fields {
                    if let Some(field_def) = input_obj_def
                        .fields
                        .iter()
                        .find(|f| f.name.as_str() == field.name.as_str())
                    {
                        validate_value(ctx, &field.value, &field_def.typ);
                    }
                }
            }
        }
        Value::List(values) => {
            if let Type::List(inner_type) = expected_type {
                for val in values {
                    validate_value(ctx, val, inner_type);
                }
            } else if let Type::NonNull(NonNullType::List(inner_type)) = expected_type {
                for val in values {
                    validate_value(ctx, val, inner_type);
                }
            }
        }
        _ => {}
    }
}

impl<'a> Visitor<'a, ValidationContext<'a>> for InputObjectRequiredFields {
    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        if let Some(default_value) = &var_def.default_value {
            validate_value(ctx, default_value, &var_def.typ);
        }
        Control::Next
    }
}

fn get_named_type<'a>(typ: &'a Type<'a>) -> &'a str {
    match typ {
        Type::Named(named) => named.name,
        Type::List(inner) => get_named_type(inner),
        Type::NonNull(non_null) => match non_null {
            NonNullType::Named(named) => named.name,
            NonNullType::List(inner) => get_named_type(inner),
        },
    }
}

impl<'a> ValidationRule<'a> for InputObjectRequiredFields {}

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
    use crate::validation::visitor::VisitNode;

    fn validate(schema_source: &str, query_source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();

        let schema_binding = parse_source(schema_source);
        let schema_doc = Document::parse(&gql_ctx, &schema_binding).unwrap();
        let schema = TestSchema::from_document(schema_doc);

        let query_binding = parse_source(query_source);
        let doc = Document::parse(&gql_ctx, &query_binding).unwrap();
        let query_source = parse_source(query_source);
        let mut ctx = ValidationContext::new(&schema, &query_source);
        let mut rule = InputObjectRequiredFields;

        doc.visit(&mut ctx, &mut rule);

        ctx.errors().len()
    }

    #[test]
    fn test_variable_without_default_value() {
        let schema = r#"
            type Query { field(arg: UserInput): String }
            input UserInput { name: String! }
        "#;
        let query = r#"query Q($input: UserInput) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_input_object_with_all_required_fields() {
        let schema = r#"
            type Query { field(arg: UserInput): String }
            input UserInput { name: String! email: String! }
        "#;
        let query =
            r#"query Q($input: UserInput = { name: "John", email: "john@example.com" }) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_input_object_missing_required_field() {
        let schema = r#"
            type Query { field(arg: UserInput): String }
            input UserInput { name: String! email: String! }
        "#;
        let query = r#"query Q($input: UserInput = { name: "John" }) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 1);
    }

    #[test]
    fn test_input_object_with_optional_fields_only() {
        let schema = r#"
            type Query { field(arg: UserInput): String }
            input UserInput { name: String email: String }
        "#;
        let query = r#"query Q($input: UserInput = { name: "John" }) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_nested_input_object_missing_required_field() {
        let schema = r#"
            type Query { field(arg: UserInput): String }
            input UserInput { name: String! address: AddressInput }
            input AddressInput { city: String! country: String! }
        "#;
        let query =
            r#"query Q($input: UserInput = { name: "John", address: { city: "Seoul" } }) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 1);
    }

    #[test]
    fn test_list_of_input_objects_missing_required_field() {
        let schema = r#"
            type Query { field(arg: [UserInput]): String }
            input UserInput { name: String! email: String! }
        "#;
        let query = r#"query Q($input: [UserInput] = [{ name: "John" }]) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 1);
    }

    #[test]
    fn test_required_field_with_default_value() {
        let schema = r#"
            type Query { field(arg: UserInput): String }
            input UserInput { name: String! email: String = "default@example.com" }
        "#;
        let query = r#"query Q($input: UserInput = { name: "John" }) { field(arg: $input) }"#;
        assert_eq!(validate(schema, query), 0);
    }
}
