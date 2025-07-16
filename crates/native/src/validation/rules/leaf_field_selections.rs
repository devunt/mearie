/// Validates that leaf fields have no selection sets and non-leaf fields do.
///
/// Scalar and enum fields must not have selection sets.
/// Object, interface, and union fields must have selection sets.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Leaf-Field-Selections
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct LeafFieldSelections<'a> {
    type_stack: Vec<Option<&'a str>>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for LeafFieldSelections<'a> {
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

        let field_type = match schema.get_field_type(parent_type, field_name) {
            Some(t) => t,
            None => {
                self.type_stack.push(None);
                return Control::Next;
            }
        };

        let named_type = get_named_type(field_type);

        let is_leaf = schema.is_scalar(named_type) || schema.is_enum_type(named_type);

        if is_leaf && !field.selection_set.selections.is_empty() {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!(
                        "Field '{}' must not have a selection set, since type '{}' is a leaf type (scalar or enum)",
                        field_name, named_type
                    ),
                },
                location: Some(ctx.location_from_span(field.span)),
            });
        } else if !is_leaf && field.selection_set.selections.is_empty() {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!(
                        "Field '{}' must have a selection set, since type '{}' is not a leaf type",
                        field_name, named_type
                    ),
                },
                location: Some(ctx.location_from_span(field.span)),
            });
        }

        self.type_stack.push(Some(named_type));
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

impl<'a> ValidationRule<'a> for LeafFieldSelections<'a> {}

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

    fn validate(schema_src: &str, source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let schema_binding = parse_source(schema_src);
        let schema_doc = Document::parse(&gql_ctx, &schema_binding).unwrap();
        let schema = TestSchema::from_document(schema_doc);
        let source_binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &source_binding).unwrap();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = LeafFieldSelections::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                for selection in op.selection_set.selections.iter() {
                    if let Selection::Field(field) = selection {
                        rule.enter_field(&mut ctx, field);
                        for nested_selection in field.selection_set.selections.iter() {
                            if let Selection::Field(nested_field) = nested_selection {
                                rule.enter_field(&mut ctx, nested_field);
                            }
                        }
                    }
                }
                rule.leave_operation(&mut ctx, op);
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_leaf_field_with_selection_set() {
        assert!(
            validate(
                "type Query { scalarField: String }",
                "query Test { scalarField { subfield } }"
            ) > 0
        );
    }

    #[test]
    fn test_object_field_without_selection_set() {
        assert!(
            validate(
                "type Query { objectField: User } type User { id: ID! }",
                "query Test { objectField }"
            ) > 0
        );
    }

    #[test]
    fn test_valid_scalar_field() {
        assert_eq!(validate("type Query { name: String }", "query Test { name }"), 0);
    }

    #[test]
    fn test_valid_object_field_with_selection() {
        assert_eq!(
            validate(
                "type Query { user: User } type User { id: ID! }",
                "query Test { user { id } }"
            ),
            0
        );
    }

    #[test]
    fn test_enum_field_with_selection_set() {
        assert!(
            validate(
                "type Query { status: Status } enum Status { ACTIVE INACTIVE }",
                "query Test { status { value } }"
            ) > 0
        );
    }

    #[test]
    fn test_nested_object_without_selection() {
        assert!(
            validate(
                "type Query { user: User } type User { profile: Profile } type Profile { name: String }",
                "query Test { user { profile } }"
            ) > 0
        );
    }

    #[test]
    fn test_list_type_field_without_selection() {
        assert!(
            validate(
                "type Query { users: [User] } type User { id: ID! }",
                "query Test { users }"
            ) > 0
        );
    }
}
