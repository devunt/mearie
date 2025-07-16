/// Validates that all required arguments are provided.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Required-Arguments
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct RequiredArguments<'a> {
    type_stack: Vec<Option<&'a str>>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for RequiredArguments<'a> {
    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        let root_type_name = match operation.operation_type {
            OperationType::Query => Some("Query"),
            OperationType::Mutation => Some("Mutation"),
            OperationType::Subscription => Some("Subscription"),
        };
        self.type_stack.push(root_type_name);
        Control::Next
    }

    fn leave_operation(&mut self, _ctx: &mut ValidationContext<'a>, _operation: &OperationDefinition<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a>, field: &Field<'a>) -> Control {
        let schema = ctx.schema();

        let parent_type = match self.type_stack.last() {
            Some(Some(type_name)) => *type_name,
            _ => {
                self.type_stack.push(None);
                return Control::Next;
            }
        };

        let field_name = field.name.as_str();

        if field_name.starts_with("__") {
            self.type_stack.push(None);
            return Control::Next;
        }

        if let Some(field_def) = schema.get_field_definition(parent_type, field_name) {
            for arg_def in field_def.arguments.iter() {
                let is_required = matches!(arg_def.typ, Type::NonNull(_)) && arg_def.default_value.is_none();

                if is_required {
                    let arg_name = arg_def.name.as_str();
                    let arg_provided = field.arguments.iter().any(|arg| arg.name.as_str() == arg_name);

                    if !arg_provided {
                        ctx.add_error(MearieError {
                            kind: ErrorKind::ValidationError {
                                message: format!(
                                    "Required argument '{}' on field '{}.{}' is not provided",
                                    arg_name, parent_type, field_name
                                ),
                            },
                            location: Some(ctx.location_from_span(field.span)),
                        });
                    }
                }
            }

            let named_type = get_named_type(&field_def.typ);
            self.type_stack.push(Some(named_type));
        } else {
            self.type_stack.push(None);
        }

        Control::Next
    }

    fn leave_field(&mut self, _ctx: &mut ValidationContext<'a>, _field: &Field<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        self.type_stack.push(Some(fragment.type_condition.as_str()));
        Control::Next
    }

    fn leave_fragment(&mut self, _ctx: &mut ValidationContext<'a>, _fragment: &FragmentDefinition<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        if let Some(type_condition) = &inline_fragment.type_condition {
            self.type_stack.push(Some(type_condition.as_str()));
        }
        Control::Next
    }

    fn leave_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        if inline_fragment.type_condition.is_some() {
            self.type_stack.pop();
        }
        Control::Next
    }

    fn enter_directive(&mut self, _ctx: &mut ValidationContext<'a>, _directive: &Directive<'a>) -> Control {
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

impl<'a> ValidationRule<'a> for RequiredArguments<'a> {}

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
        let mut rule = RequiredArguments::default();

        doc.visit(&mut ctx, &mut rule);

        ctx.errors().len()
    }

    #[test]
    fn test_field_without_arguments() {
        let schema = r#"
            type Query { field: String }
        "#;
        let query = r#"query Q { field }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_field_with_optional_arguments() {
        let schema = r#"
            type Query { field(arg: String): String }
        "#;
        let query = r#"query Q { field(arg: "value") }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_field_with_required_argument_provided() {
        let schema = r#"
            type Query { field(arg: String!): String }
        "#;
        let query = r#"query Q { field(arg: "value") }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_field_with_required_argument_missing() {
        let schema = r#"
            type Query { field(arg: String!): String }
        "#;
        let query = r#"query Q { field }"#;
        assert_eq!(validate(schema, query), 1);
    }

    #[test]
    fn test_field_with_multiple_required_arguments_all_provided() {
        let schema = r#"
            type Query { field(arg1: String! arg2: Int!): String }
        "#;
        let query = r#"query Q { field(arg1: "value", arg2: 42) }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_field_with_multiple_required_arguments_one_missing() {
        let schema = r#"
            type Query { field(arg1: String! arg2: Int!): String }
        "#;
        let query = r#"query Q { field(arg1: "value") }"#;
        assert_eq!(validate(schema, query), 1);
    }

    #[test]
    fn test_required_argument_with_default_value() {
        let schema = r#"
            type Query { field(arg: String! = "default"): String }
        "#;
        let query = r#"query Q { field }"#;
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_nested_field_with_required_argument_missing() {
        let schema = r#"
            type Query { user: User }
            type User { profile(detailed: Boolean!): Profile }
            type Profile { name: String }
        "#;
        let query = r#"query Q { user { profile { name } } }"#;
        assert_eq!(validate(schema, query), 1);
    }
}
