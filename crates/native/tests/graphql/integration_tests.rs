use assertables::*;
use mearie_native::ast::Document;
use mearie_native::parser::{GraphQLContext, ParseNode};
use mearie_native::span::Source;

#[test]
fn test_parse_and_validate_simple_query() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { user { id name } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_and_validate_query_with_variables() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query GetUser($id: ID!) { user(id: $id) { id name email } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_and_validate_mutation() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }"#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_and_validate_fragment() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query { user { ...UserFields } }
        fragment UserFields on User { id name email }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_and_validate_inline_fragment() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { search { ... on User { name } } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_complete_schema() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        type Query {
            user(id: ID!): User
            users: [User!]!
        }

        type User {
            id: ID!
            name: String!
            email: String!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_with_interface() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        interface Node {
            id: ID!
        }

        type User implements Node {
            id: ID!
            name: String!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_with_union() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        union SearchResult = User | Post

        type User { id: ID! }
        type Post { id: ID! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_with_enum() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        enum Status {
            ACTIVE
            INACTIVE
            PENDING
        }

        type User {
            status: Status!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_with_input_type() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        input UserInput {
            name: String!
            email: String!
            age: Int
        }

        type Mutation {
            createUser(input: UserInput!): User
        }

        type User { id: ID! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_directives() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUser($withEmail: Boolean!) {
            user {
                id
                name
                email @include(if: $withEmail)
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_aliases() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { userId: user { userName: name } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_nested_fragments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query { user { ...UserWithPosts } }
        fragment UserWithPosts on User { ...UserBasic posts { id } }
        fragment UserBasic on User { id name }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_default_values() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"query GetUsers($limit: Int = 10, $offset: Int = 0) { users(limit: $limit, offset: $offset) { id } }"#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_subscription() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "subscription { messageAdded { id content author { name } } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_with_custom_scalars() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        scalar DateTime
        scalar JSON

        type User {
            createdAt: DateTime!
            metadata: JSON
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_with_directive_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        directive @auth(requires: Role!) on FIELD_DEFINITION | OBJECT

        enum Role { ADMIN USER }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_extend_type() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        type User { id: ID! }
        extend type User { email: String! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_multiple_operations() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUser { user { id } }
        query GetPosts { posts { id } }
        mutation CreatePost { createPost { id } }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
    let doc = result.unwrap();
    assert_eq!(doc.definitions.len(), 3);
}

#[test]
fn test_parse_complex_nested_query() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query {
            user {
                posts {
                    comments {
                        author {
                            posts {
                                id
                            }
                        }
                    }
                }
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_list_arguments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "query { users(ids: [1, 2, 3], tags: [\"admin\", \"user\"]) { id } }",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_object_arguments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"query { createUser(input: { name: "John", age: 30, tags: ["admin"] }) { id } }"#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_interface_with_multiple_implementations() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        interface Node { id: ID! }
        type User implements Node { id: ID! name: String! }
        type Post implements Node { id: ID! title: String! }
        type Comment implements Node { id: ID! content: String! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_union_with_multiple_types() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: "union SearchResult = User | Post | Comment | Tag",
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_schema_definition() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        schema {
            query: Query
            mutation: Mutation
            subscription: Subscription
        }

        type Query { user: User }
        type Mutation { createUser: User }
        type Subscription { userAdded: User }
        type User { id: ID! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_field_with_multiple_arguments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        type Query {
            users(
                first: Int
                after: String
                orderBy: OrderBy
                filter: UserFilter
            ): [User!]!
        }

        type User { id: ID! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_type_with_description() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        "A user in the system"
        type User {
            "The user's unique identifier"
            id: ID!
            "The user's full name"
            name: String!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_enum_with_description() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        "User account status"
        enum Status {
            "Account is active"
            ACTIVE
            "Account is inactive"
            INACTIVE
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_variables_and_defaults() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUsers(
            $limit: Int = 10
            $offset: Int = 0
            $sortBy: String = "name"
            $ascending: Boolean = true
        ) {
            users(limit: $limit, offset: $offset, sortBy: $sortBy, ascending: $ascending) {
                id
                name
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_mutation_with_complex_input() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        mutation CreatePost($input: PostInput!) {
            createPost(input: $input) {
                id
                title
                author {
                    id
                    name
                }
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_fragment_with_nested_spreads() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query { user { ...UserComplete } }
        fragment UserComplete on User { ...UserBasic ...UserProfile }
        fragment UserBasic on User { id name }
        fragment UserProfile on User { email avatar }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_inline_and_named_fragments() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query {
            search {
                ...ResultFields
                ... on User { email }
                ... on Post { content }
            }
        }
        fragment ResultFields on SearchResult { id }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_type_implementing_multiple_interfaces() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        interface Node { id: ID! }
        interface Timestamped { createdAt: String! updatedAt: String! }
        type User implements Node & Timestamped {
            id: ID!
            createdAt: String!
            updatedAt: String!
            name: String!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_repeatable_directive() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        directive @tag(name: String!) repeatable on FIELD_DEFINITION

        type User {
            id: ID! @tag(name: "public") @tag(name: "searchable")
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_input_with_nested_types() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        input AddressInput {
            street: String!
            city: String!
        }

        input UserInput {
            name: String!
            address: AddressInput!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_skip_and_include() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUser($withEmail: Boolean!, $withoutPosts: Boolean!) {
            user {
                id
                name
                email @include(if: $withEmail)
                posts @skip(if: $withoutPosts) { id }
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_large_schema() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        type Query {
            user(id: ID!): User
            users(first: Int, after: String): UserConnection!
            post(id: ID!): Post
            posts(first: Int, after: String): PostConnection!
        }

        type Mutation {
            createUser(input: UserInput!): User!
            updateUser(id: ID!, input: UserInput!): User!
            deleteUser(id: ID!): Boolean!
        }

        type Subscription {
            userAdded: User!
            userUpdated: User!
            userDeleted: ID!
        }

        type User implements Node {
            id: ID!
            name: String!
            email: String!
            posts(first: Int): PostConnection!
        }

        type Post implements Node {
            id: ID!
            title: String!
            content: String!
            author: User!
        }

        interface Node {
            id: ID!
        }

        type UserConnection {
            edges: [UserEdge!]!
            pageInfo: PageInfo!
        }

        type UserEdge {
            node: User!
            cursor: String!
        }

        type PostConnection {
            edges: [PostEdge!]!
            pageInfo: PageInfo!
        }

        type PostEdge {
            node: Post!
            cursor: String!
        }

        type PageInfo {
            hasNextPage: Boolean!
            hasPreviousPage: Boolean!
            startCursor: String
            endCursor: String
        }

        input UserInput {
            name: String!
            email: String!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_complex_nesting() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query ComplexQuery($userId: ID!, $includeComments: Boolean = false) {
            user(id: $userId) {
                id
                name
                posts(first: 10) {
                    edges {
                        node {
                            id
                            title
                            comments(first: 5) @include(if: $includeComments) {
                                edges {
                                    node {
                                        id
                                        content
                                        author {
                                            id
                                            name
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_extend_interface() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        interface Node { id: ID! }
        extend interface Node { createdAt: String! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_extend_union() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        union SearchResult = User | Post
        extend union SearchResult = Comment
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_extend_enum() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        enum Status { ACTIVE INACTIVE }
        extend enum Status { PENDING }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_extend_input() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        input UserInput { name: String! }
        extend input UserInput { email: String! }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_query_with_fragments_and_variables() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        query GetUser($id: ID!, $withPosts: Boolean!) {
            user(id: $id) {
                ...UserFields
                posts @include(if: $withPosts) {
                    ...PostFields
                }
            }
        }

        fragment UserFields on User {
            id
            name
            email
        }

        fragment PostFields on Post {
            id
            title
            content
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_all_scalar_types() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        type Example {
            id: ID!
            name: String!
            age: Int!
            price: Float!
            active: Boolean!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}

#[test]
fn test_parse_list_and_non_null_combinations() {
    let ctx = GraphQLContext::new();
    let source = Source {
        code: r#"
        type Example {
            nullableList: [String]
            nonNullList: [String]!
            listOfNonNulls: [String!]
            nonNullListOfNonNulls: [String!]!
        }
    "#,
        file_path: "test.graphql",
        start_line: 0,
    };
    let result = Document::parse(&ctx, &source);
    assert_ok!(&result);
}
