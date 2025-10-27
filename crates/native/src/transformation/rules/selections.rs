use crate::arena::Arena;
use crate::error::location::Span;
use crate::graphql::ast::*;
use crate::transformation::context::TransformContext;
use crate::transformation::transformer::Transformer;

/// Adds __typename and entity key fields to selection sets.
///
/// Always applies:
/// - Adds `__typename` to all composite type selections (except root types)
/// - Adds entity key field (`id`, `_id`, or `uuid`) where applicable
#[derive(Default)]
pub struct SelectionRules;

impl SelectionRules {
    pub fn new() -> Self {
        Self
    }

    fn determine_key_field(&self, ctx: &TransformContext<'_>, type_name: &str) -> Option<&'static str> {
        const KEY_FIELD_NAMES: [&str; 3] = ["id", "_id", "uuid"];

        let fields = ctx.schema().get_object_fields(type_name)?;

        for &key_name in &KEY_FIELD_NAMES {
            if let Some(&field_def) = fields.get(key_name) {
                let is_nullable = field_def.typ.is_nullable();
                let is_list = field_def.typ.is_list();
                let innermost_type = field_def.typ.innermost_type().as_str();
                let is_scalar = ctx.schema().is_scalar(innermost_type);

                if !is_nullable && !is_list && is_scalar {
                    return Some(key_name);
                }
            }
        }

        None
    }

    fn should_skip_type(&self, ctx: &TransformContext<'_>, type_name: &str) -> bool {
        // Check by name (for schemas without explicit schema declaration)
        type_name == "Query" || type_name == "Mutation" || type_name == "Subscription"
            // Also check schema-declared root types
            || Some(type_name) == ctx.schema().query_type()
            || Some(type_name) == ctx.schema().mutation_type()
            || Some(type_name) == ctx.schema().subscription_type()
    }

    fn has_field(&self, selections: &[Selection<'_>], field_name: &str) -> bool {
        selections
            .iter()
            .any(|sel| matches!(sel, Selection::Field(field) if field.name.as_str() == field_name))
    }

    fn create_field<'a>(&self, arena: &'a Arena, field_name: &str) -> Selection<'a> {
        Selection::Field(Field {
            span: Span::empty(),
            alias: None,
            name: FieldName::new(Name::new(arena.intern(field_name))),
            arguments: bumpalo::vec![in arena.allocator();],
            directives: bumpalo::vec![in arena.allocator();],
            selection_set: SelectionSet {
                selections: bumpalo::vec![in arena.allocator();],
            },
        })
    }
}

impl<'a> Transformer<'a> for SelectionRules {
    fn transform_selection_set(
        &mut self,
        ctx: &mut TransformContext<'a>,
        sel_set: &SelectionSet<'a>,
        parent_type: &str,
    ) -> Option<SelectionSet<'a>> {
        let arena = ctx.arena();
        let mut selections = bumpalo::vec![in arena.allocator();];

        if !self.should_skip_type(ctx, parent_type)
            && !self.has_field(&sel_set.selections, "__typename")
            && ctx.schema().has_type(parent_type)
        {
            selections.push(self.create_field(arena, "__typename"));
        }

        if !self.should_skip_type(ctx, parent_type)
            && ctx.schema().is_object(parent_type)
            && let Some(key_field) = self.determine_key_field(ctx, parent_type)
            && !self.has_field(&sel_set.selections, key_field)
        {
            selections.push(self.create_field(arena, key_field));
        }

        for sel in &sel_set.selections {
            if let Some(transformed) = self.transform_selection(ctx, sel, parent_type) {
                selections.push(transformed);
            }
        }

        Some(SelectionSet { selections })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transform_test;

    #[test]
    fn test_add_typename_to_object() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String }
        "#;
        let query = r#"query { user { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        assert!(
            user_field
                .selection_set
                .fields()
                .any(|f| f.name.as_str() == "__typename")
        );
    }

    #[test]
    fn test_skip_typename_on_root_query() {
        let schema = r#"type Query { hello: String }"#;
        let query = r#"query { hello }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        assert!(!op.selection_set.fields().any(|f| f.name.as_str() == "__typename"));
    }

    #[test]
    fn test_skip_typename_on_root_mutation() {
        let schema = r#"
            type Query { hello: String }
            type Mutation { createUser(name: String!): User }
            type User { id: ID! name: String }
        "#;
        let query = r#"mutation { createUser(name: "test") { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        assert!(!op.selection_set.fields().any(|f| f.name.as_str() == "__typename"));

        let create_user_field = op.selection_set.fields().next().unwrap();
        assert!(
            create_user_field
                .selection_set
                .fields()
                .any(|f| f.name.as_str() == "__typename")
        );
    }

    #[test]
    fn test_no_duplicate_typename() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String }
        "#;
        let query = r#"query { user { __typename name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        let typename_count = user_field
            .selection_set
            .fields()
            .filter(|f| f.name.as_str() == "__typename")
            .count();
        assert_eq!(typename_count, 1);
    }

    #[test]
    fn test_add_id_field() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String }
        "#;
        let query = r#"query { user { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        assert!(user_field.selection_set.fields().any(|f| f.name.as_str() == "id"));
    }

    #[test]
    fn test_prefer_underscore_id() {
        let schema = r#"
            type Query { user: User }
            type User { _id: ID! uuid: ID! name: String }
        "#;
        let query = r#"query { user { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        assert!(user_field.selection_set.fields().any(|f| f.name.as_str() == "_id"));
        assert!(!user_field.selection_set.fields().any(|f| f.name.as_str() == "uuid"));
    }

    #[test]
    fn test_use_uuid_as_fallback() {
        let schema = r#"
            type Query { user: User }
            type User { uuid: ID! name: String }
        "#;
        let query = r#"query { user { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        assert!(user_field.selection_set.fields().any(|f| f.name.as_str() == "uuid"));
    }

    #[test]
    fn test_skip_nullable_id() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID name: String }
        "#;
        let query = r#"query { user { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        assert!(!user_field.selection_set.fields().any(|f| f.name.as_str() == "id"));
    }

    #[test]
    fn test_skip_list_id() {
        let schema = r#"
            type Query { user: User }
            type User { id: [ID!]! name: String }
        "#;
        let query = r#"query { user { name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        assert!(!user_field.selection_set.fields().any(|f| f.name.as_str() == "id"));
    }

    #[test]
    fn test_no_duplicate_id() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String }
        "#;
        let query = r#"query { user { id name } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        let id_count = user_field
            .selection_set
            .fields()
            .filter(|f| f.name.as_str() == "id")
            .count();
        assert_eq!(id_count, 1);
    }

    #[test]
    fn test_nested_transformations() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! posts: [Post!]! }
            type Post { id: ID! title: String }
        "#;
        let query = r#"query { user { posts { title } } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();

        assert!(
            user_field
                .selection_set
                .fields()
                .any(|f| f.name.as_str() == "__typename")
        );
        assert!(user_field.selection_set.fields().any(|f| f.name.as_str() == "id"));

        let posts_field = user_field
            .selection_set
            .fields()
            .find(|f| f.name.as_str() == "posts")
            .unwrap();
        assert!(
            posts_field
                .selection_set
                .fields()
                .any(|f| f.name.as_str() == "__typename")
        );
        assert!(posts_field.selection_set.fields().any(|f| f.name.as_str() == "id"));
    }

    #[test]
    fn test_inline_fragments() {
        let schema = r#"
            type Query { node: Node }
            interface Node { id: ID! }
            type User implements Node { id: ID! name: String }
        "#;
        let query = r#"query { node { ... on User { name } } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let node_field = op.selection_set.fields().next().unwrap();

        let inline_fragment = node_field
            .selection_set
            .selections
            .iter()
            .find_map(|sel| match sel {
                Selection::InlineFragment(inline) => Some(inline),
                _ => None,
            })
            .expect("Expected inline fragment");

        assert!(
            inline_fragment
                .selection_set
                .fields()
                .any(|f| f.name.as_str() == "__typename")
        );
        assert!(inline_fragment.selection_set.fields().any(|f| f.name.as_str() == "id"));
    }

    #[test]
    fn test_fragment_definitions() {
        let schema = r#"
            type Query { user: User }
            type User { id: ID! name: String email: String }
        "#;
        let query = r#"
            query { user { ...UserFields } }
            fragment UserFields on User { name email }
        "#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let fragment = transformed.fragments().next().unwrap();
        assert!(fragment.selection_set.fields().any(|f| f.name.as_str() == "__typename"));
        assert!(fragment.selection_set.fields().any(|f| f.name.as_str() == "id"));
    }

    #[test]
    fn test_no_selection_set_on_scalars() {
        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                name: String!
                age: Int
                active: Boolean
            }
        "#;
        let query = r#"query { user { name age active } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();

        for field in user_field.selection_set.fields() {
            let field_name = field.name.as_str();
            if field_name == "name" || field_name == "age" || field_name == "active" {
                assert!(
                    field.selection_set.selections.is_empty(),
                    "Scalar field '{}' should not have a selection set, but has {} selections",
                    field_name,
                    field.selection_set.selections.len()
                );
            }
        }
    }

    #[test]
    fn test_no_selection_set_on_enums() {
        let schema = r#"
            type Query { user: User }
            enum Role { ADMIN USER GUEST }
            type User {
                id: ID!
                name: String!
                role: Role!
            }
        "#;
        let query = r#"query { user { name role } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();

        let role_field = user_field
            .selection_set
            .fields()
            .find(|f| f.name.as_str() == "role")
            .expect("Expected role field");

        assert!(
            role_field.selection_set.selections.is_empty(),
            "Enum field 'role' should not have a selection set, but has {} selections",
            role_field.selection_set.selections.len()
        );
    }
}
