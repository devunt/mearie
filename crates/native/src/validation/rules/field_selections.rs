/// Validates that field selections are valid for the parent type.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Field-Selections
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FieldSelections<'a> {
    type_stack: Vec<Option<&'a str>>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for FieldSelections<'a> {
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

        match schema.get_field_type(parent_type, field_name) {
            Some(field_type) => {
                let named_type = get_named_type(field_type);
                self.type_stack.push(Some(named_type));
            }
            None => {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!("Field '{}' is not defined on type '{}'", field_name, parent_type),
                    },
                    location: Some(ctx.location_from_span(field.span)),
                });
                self.type_stack.push(None);
            }
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

impl<'a> ValidationRule<'a> for FieldSelections<'a> {}

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
        let mut rule = FieldSelections::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                if let Some(Selection::Field(field)) = op.selection_set.selections.first() {
                    rule.enter_field(&mut ctx, field);
                }
                rule.leave_operation(&mut ctx, op);
            }
        }

        ctx.errors().len()
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
        let mut rule = FieldSelections::default();

        for def in doc.definitions.iter() {
            match def {
                Definition::Executable(ExecutableDefinition::Operation(op)) => {
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
                Definition::Executable(ExecutableDefinition::Fragment(frag)) => {
                    rule.enter_fragment(&mut ctx, frag);
                    for selection in frag.selection_set.selections.iter() {
                        if let Selection::Field(field) = selection {
                            rule.enter_field(&mut ctx, field);
                            rule.leave_field(&mut ctx, field);
                        }
                    }
                    rule.leave_fragment(&mut ctx, frag);
                }
                _ => {}
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_valid_field_selection() {
        assert_eq!(
            validate_with_schema("type Query { field: String }", "query Q { field }"),
            0
        );
    }

    #[test]
    fn test_introspection_typename_field() {
        assert_eq!(validate("query Q { __typename }"), 0);
    }

    #[test]
    fn test_fragment_with_fields() {
        assert_eq!(
            validate_with_schema(
                "type User { id: ID! name: String! }",
                "fragment UserFields on User { id name }"
            ),
            0
        );
    }

    #[test]
    fn test_invalid_field_selection() {
        assert!(
            validate_with_schema(
                "type Query { user: User } type User { id: ID! name: String! }",
                "query Q { user { invalidField } }"
            ) > 0
        );
    }

    fn validate_deeply_nested(schema_src: &str, source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let schema_binding = parse_source(schema_src);
        let schema_doc = Document::parse(&gql_ctx, &schema_binding).unwrap();
        let schema = TestSchema::from_document(schema_doc);
        let source_binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &source_binding).unwrap();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = FieldSelections::default();

        fn visit_selections<'a>(
            rule: &mut FieldSelections<'a>,
            ctx: &mut ValidationContext<'a>,
            selections: &'a [Selection<'a>],
        ) {
            for selection in selections {
                if let Selection::Field(field) = selection {
                    rule.enter_field(ctx, field);
                    visit_selections(rule, ctx, &field.selection_set.selections);
                    rule.leave_field(ctx, field);
                }
            }
        }

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                visit_selections(&mut rule, &mut ctx, &op.selection_set.selections);
                rule.leave_operation(&mut ctx, op);
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_invalid_nested_field() {
        assert!(
            validate_deeply_nested(
                "type Query { user: User } type User { id: ID! profile: Profile } type Profile { name: String! }",
                "query Q { user { profile { invalidNested } } }"
            ) > 0
        );
    }

    #[test]
    fn test_invalid_field_on_root_type() {
        assert!(
            validate_with_schema(
                "type Query { user: User } type User { id: ID! }",
                "query Q { invalidRootField }"
            ) > 0
        );
    }
}
