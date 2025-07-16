/// Validates that all arguments are defined on the field or directive.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Argument-Names
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct ArgumentNames<'a> {
    type_stack: Vec<Option<&'a str>>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for ArgumentNames<'a> {
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
            for arg in &field.arguments {
                let arg_name = arg.name.as_str();

                let arg_exists = field_def
                    .arguments
                    .iter()
                    .any(|def_arg| def_arg.name.as_str() == arg_name);

                if !arg_exists {
                    ctx.add_error(MearieError {
                        kind: ErrorKind::ValidationError {
                            message: format!(
                                "Unknown argument '{}' on field '{}.{}'",
                                arg_name, parent_type, field_name
                            ),
                        },
                        location: Some(ctx.location_from_span(arg.span)),
                    });
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

impl<'a> ValidationRule<'a> for ArgumentNames<'a> {}

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
        let mut rule = ArgumentNames::default();

        for def in doc.definitions.iter() {
            match def {
                Definition::Executable(ExecutableDefinition::Fragment(frag)) => {
                    rule.enter_fragment(&mut ctx, frag);
                    rule.leave_fragment(&mut ctx, frag);
                }
                Definition::Executable(ExecutableDefinition::Operation(op)) => {
                    rule.enter_operation(&mut ctx, op);
                    for selection in op.selection_set.selections.iter() {
                        if let Selection::Field(field) = selection {
                            rule.enter_field(&mut ctx, field);
                            rule.leave_field(&mut ctx, field);
                        }
                    }
                    rule.leave_operation(&mut ctx, op);
                }
                _ => {}
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_valid_field_arguments() {
        assert_eq!(validate(r#"query Q { field(arg1: "value1", arg2: "value2") }"#), 0);
    }

    #[test]
    fn test_introspection_fields_ignored() {
        assert_eq!(validate(r#"query Q { __typename __schema { types { name } } }"#), 0);
    }

    #[test]
    fn test_fragment_with_type_condition() {
        assert_eq!(
            validate(r#"fragment UserFields on User { id name } query Q { user { ...UserFields } }"#),
            0
        );
    }

    #[test]
    fn test_field_without_arguments() {
        assert_eq!(validate(r#"query Q { field }"#), 0);
    }

    #[test]
    fn test_single_valid_argument() {
        assert_eq!(validate(r#"query Q { field(arg1: "value") }"#), 0);
    }

    #[test]
    fn test_nested_fields_with_arguments() {
        assert_eq!(
            validate(r#"query Q { field(arg1: "value") { nestedField(arg2: 123) } }"#),
            0
        );
    }

    #[test]
    fn test_inline_fragment_with_arguments() {
        assert_eq!(validate(r#"query Q { ... on User { field(arg1: "value") } }"#), 0);
    }
}
