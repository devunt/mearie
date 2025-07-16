use insta::assert_debug_snapshot;
use mearie_native::ast::Document;
use mearie_native::parser::{GraphQLContext, ParseNode};
use mearie_native::span::Source;

#[test]
fn test_snapshot_simple_query() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { user { id name } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_variables() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query GetUser($id: ID!) { user(id: $id) { id name } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_mutation() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "mutation CreateUser { createUser(name: \"John\") { id } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_fragment() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "fragment UserFields on User { id name email }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_inline_fragment() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { search { ... on User { name } } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_type_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type User { id: ID! name: String! email: String }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_interface_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "interface Node { id: ID! createdAt: String }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_union_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "union SearchResult = User | Post | Comment",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_enum_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "enum Status { ACTIVE INACTIVE PENDING }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_input_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "input UserInput { name: String! email: String! age: Int }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_scalar_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "scalar DateTime",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_directive_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "directive @auth(requires: Role!) on FIELD_DEFINITION",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_schema_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "schema { query: Query mutation: Mutation }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_extend_type() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "extend type User { avatar: String }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_directives() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { user @skip(if: true) { id } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_aliases() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { userId: user { userName: name } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_nested_selection_sets() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { user { posts { comments { author { name } } } } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_default_values() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query($limit: Int = 10) { users(first: $limit) { id } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_subscription() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "subscription { messageAdded { id content } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_type_with_implements() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type User implements Node { id: ID! }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_type_with_multiple_interfaces() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type User implements Node & Timestamped { id: ID! }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_field_with_arguments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type Query { users(first: Int, offset: Int): [User] }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_list_type() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type User { tags: [String] }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_non_null_type() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type User { id: ID! name: String! }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_non_null_list() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "type User { tags: [String!]! }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_type_with_description() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#""A user in the system" type User { id: ID! }"#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_field_with_description() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"type User { "User ID" id: ID! }"#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_enum_with_description() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#""User status" enum Status { ACTIVE INACTIVE }"#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_input_with_default_values() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "input UserInput { name: String! age: Int = 18 }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_repeatable_directive() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "directive @tag(name: String!) repeatable on FIELD",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_multiple_operations() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUser { user { id } }
        query GetPosts { posts { id } }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_fragment_spread() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query { user { ...UserFields } }
        fragment UserFields on User { id name }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_nested_fragments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query { user { ...UserWithPosts } }
        fragment UserWithPosts on User { id ...UserBasic }
        fragment UserBasic on User { name email }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_complex_query() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUserData($id: ID!, $includeEmail: Boolean = false) {
            user(id: $id) {
                id
                name
                email @include(if: $includeEmail)
                posts(first: 10) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_list_argument() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { users(ids: [1, 2, 3]) { id } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_query_with_object_argument() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { createUser(input: { name: \"John\", age: 30 }) { id } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_extend_interface() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "extend interface Node { createdAt: String }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_schema_with_all_operations() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "schema { query: Query mutation: Mutation subscription: Subscription }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_interface_with_fields() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "interface Node { id: ID! createdAt: String! }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}

#[test]
fn test_snapshot_union_with_multiple_types() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "union SearchResult = User | Post | Comment",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source).unwrap();
    assert_debug_snapshot!(result);
}
