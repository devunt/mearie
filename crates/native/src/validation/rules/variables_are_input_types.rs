/// Validates that all variables are input types.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Variables-Are-Input-Types
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct VariablesAreInputTypes;

impl<'a> Visitor<'a, ValidationContext<'a>> for VariablesAreInputTypes {
    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        let schema = ctx.schema();

        let type_name = get_named_type(&var_def.typ);

        if schema.has_type(type_name) && !schema.is_input_type(type_name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!(
                        "Variable '${} is declared with type '{}', which is not an input type. Variables must be input types (scalar, enum, or input object).",
                        var_def.variable.as_str(),
                        type_name
                    ),
                },
                location: Some(ctx.location_from_span(var_def.span)),
            });
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

impl<'a> ValidationRule<'a> for VariablesAreInputTypes {}

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
        let mut rule = VariablesAreInputTypes;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                for var_def in op.variable_definitions.iter() {
                    rule.enter_variable_definition(&mut ctx, var_def);
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_variable_with_scalar_type() {
        assert_eq!(validate(r#"query Q($input: String) { field(arg: $input) }"#), 0);
    }

    #[test]
    fn test_variable_with_list_type() {
        assert_eq!(validate(r#"query Q($input: [String]) { field(arg: $input) }"#), 0);
    }

    #[test]
    fn test_variable_with_non_null_type() {
        assert_eq!(validate(r#"query Q($input: String!) { field(arg: $input) }"#), 0);
    }

    #[test]
    fn test_variable_with_output_type() {
        assert_eq!(validate(r#"query Q($input: OutputType) { field(arg: $input) }"#), 0);
    }

    fn validate_with_schema(schema_src: &str, source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let schema_binding = parse_source(schema_src);
        let schema_doc = Document::parse(&gql_ctx, &schema_binding).unwrap();
        let schema = TestSchema::from_document(schema_doc);
        let source_binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &source_binding).unwrap();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = VariablesAreInputTypes;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                for var_def in op.variable_definitions.iter() {
                    rule.enter_variable_definition(&mut ctx, var_def);
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_variable_with_object_type_invalid() {
        assert!(
            validate_with_schema(
                "type User { id: ID! name: String! }",
                r#"query Q($user: User) { field(arg: $user) }"#
            ) > 0
        );
    }

    #[test]
    fn test_variable_with_interface_type_invalid() {
        assert!(
            validate_with_schema(
                "interface Node { id: ID! }",
                r#"query Q($node: Node) { field(arg: $node) }"#
            ) > 0
        );
    }
}
