/// Validates that fragment spreads are possible given the parent type.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragment-spread-is-possible
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashSet;

#[derive(Default)]
pub struct FragmentSpreadIsPossible<'a> {
    type_stack: Vec<Option<&'a str>>,
}

impl<'a> FragmentSpreadIsPossible<'a> {
    fn check_type_compatibility(
        &self,
        ctx: &mut ValidationContext<'a>,
        fragment_type: &str,
        parent_type: &str,
    ) -> bool {
        let schema = ctx.schema();

        if fragment_type == parent_type {
            return true;
        }

        let fragment_possible_types: FxHashSet<&str> = schema.get_possible_types(fragment_type).into_iter().collect();
        let parent_possible_types: FxHashSet<&str> = schema.get_possible_types(parent_type).into_iter().collect();

        if fragment_possible_types.is_empty() && parent_possible_types.is_empty() {
            return false;
        }

        if fragment_possible_types.is_empty() {
            return parent_possible_types.contains(fragment_type);
        }

        if parent_possible_types.is_empty() {
            return fragment_possible_types.contains(parent_type);
        }

        fragment_possible_types
            .intersection(&parent_possible_types)
            .next()
            .is_some()
    }
}

impl<'a> Visitor<'a, ValidationContext<'a>> for FragmentSpreadIsPossible<'a> {
    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        let operation_type = match operation.operation_type {
            OperationType::Query => Some("Query"),
            OperationType::Mutation => Some("Mutation"),
            OperationType::Subscription => Some("Subscription"),
        };
        self.type_stack.push(operation_type);
        Control::Next
    }

    fn leave_operation(&mut self, _ctx: &mut ValidationContext<'a>, _operation: &OperationDefinition<'a>) -> Control {
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
        if let Some(type_condition) = inline_fragment.type_condition {
            self.type_stack.push(Some(type_condition.as_str()));
        } else if let Some(&parent_type) = self.type_stack.last() {
            self.type_stack.push(parent_type);
        } else {
            self.type_stack.push(None);
        }
        Control::Next
    }

    fn leave_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        _inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a>, field: &Field<'a>) -> Control {
        let schema = ctx.schema();

        if let Some(Some(parent_type)) = self.type_stack.last() {
            if let Some(field_type) = schema.get_field_type(parent_type, field.name.as_str()) {
                let named_type = get_named_type(field_type);
                self.type_stack.push(Some(named_type));
            } else {
                self.type_stack.push(None);
            }
        } else {
            self.type_stack.push(None);
        }

        Control::Next
    }

    fn leave_field(&mut self, _ctx: &mut ValidationContext<'a>, _field: &Field<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        let schema = ctx.schema();

        let fragment_name = fragment_spread.fragment_name.as_str();

        let fragment_type = schema
            .get_fragment(fragment_name)
            .map(|fragment| fragment.type_condition.as_str());

        if fragment_type.is_none() {
            return Control::Next;
        }

        if let Some(Some(parent_type)) = self.type_stack.last() {
            let fragment_type = fragment_type.unwrap();
            if !self.check_type_compatibility(ctx, fragment_type, parent_type) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!(
                            "Fragment '{}' cannot be spread on type '{}'. Fragment is defined on '{}'.",
                            fragment_name, parent_type, fragment_type
                        ),
                    },
                    location: Some(Location::empty()),
                });
            }
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

impl<'a> ValidationRule<'a> for FragmentSpreadIsPossible<'a> {}

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
        let mut schema = TestSchema::from_document(schema_doc);

        let query_binding = parse_source(query_source);
        let doc = Document::parse(&gql_ctx, &query_binding).unwrap();
        schema.load_schema(doc);

        let query_source = parse_source(query_source);
        let mut ctx = ValidationContext::new(&schema, &query_source);
        let mut rule = FragmentSpreadIsPossible::default();

        doc.visit(&mut ctx, &mut rule);

        ctx.errors().len()
    }

    #[test]
    fn test_fragment_on_same_type() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String }
        "#;
        let query = "fragment UserFields on User { id } query Q { user { ...UserFields } }";
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_fragment_on_interface_implementation() {
        let schema = r#"
            type Query { node: Node }
            interface Node { id: ID! }
            type User implements Node { id: ID! name: String }
        "#;
        let query = "fragment NodeFields on Node { id } query Q { node { ...NodeFields } }";
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_fragment_on_incompatible_type() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String }
            type Post { id: ID! title: String }
        "#;
        let query = "fragment PostFields on Post { id } query Q { user { ...PostFields } }";
        assert_eq!(validate(schema, query), 1);
    }

    #[test]
    fn test_fragment_on_union_member() {
        let schema = r#"
            type Query { search: SearchResult }
            union SearchResult = User | Post
            type User { id: ID! name: String }
            type Post { id: ID! title: String }
        "#;
        let query = "fragment UserFields on User { id } query Q { search { ...UserFields } }";
        assert_eq!(validate(schema, query), 0);
    }

    #[test]
    fn test_fragment_on_non_overlapping_union() {
        let schema = r#"
            type Query { search: SearchResult }
            union SearchResult = Post | Comment
            type User { id: ID! name: String }
            type Post { id: ID! title: String }
            type Comment { id: ID! text: String }
        "#;
        let query = "fragment UserFields on User { id } query Q { search { ...UserFields } }";
        assert_eq!(validate(schema, query), 1);
    }
}
