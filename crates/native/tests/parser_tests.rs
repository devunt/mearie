use insta::assert_debug_snapshot;
use mearie_native::arena::Arena;
use mearie_native::graphql::parser::Parser;
use mearie_native::source::Source;

macro_rules! parse {
    ($code:expr) => {{
        let arena = Box::leak(Box::new(Arena::new()));
        let source = Box::leak(Box::new(Source::ephemeral($code)));
        Parser::new(arena).with_source(source).parse().unwrap()
    }};
}

// =============================================================================
// QUERIES
// =============================================================================

#[test]
fn test_simple_query() {
    assert_debug_snapshot!(parse!("query { user { id name } }"));
}

#[test]
fn test_query_with_variables() {
    assert_debug_snapshot!(parse!("query GetUser($id: ID!) { user(id: $id) { id name email } }"));
}

#[test]
fn test_query_with_default_values() {
    assert_debug_snapshot!(parse!(
        "query GetUsers($limit: Int = 10, $offset: Int = 0) { users(limit: $limit, offset: $offset) { id } }"
    ));
}

#[test]
fn test_query_with_variables_and_defaults() {
    assert_debug_snapshot!(parse!(
        r#"query GetUsers(
            $limit: Int = 10
            $offset: Int = 0
            $sortBy: String = "name"
            $ascending: Boolean = true
        ) {
            users(limit: $limit, offset: $offset, sortBy: $sortBy, ascending: $ascending) {
                id
                name
            }
        }"#
    ));
}

#[test]
fn test_query_with_directives() {
    assert_debug_snapshot!(parse!(
        "query GetUser($withEmail: Boolean!) { user { id name email @include(if: $withEmail) } }"
    ));
}

#[test]
fn test_query_with_skip_and_include() {
    assert_debug_snapshot!(parse!(
        r#"query GetUser($withEmail: Boolean!, $withoutPosts: Boolean!) {
            user {
                id
                name
                email @include(if: $withEmail)
                posts @skip(if: $withoutPosts) { id }
            }
        }"#
    ));
}

#[test]
fn test_query_with_field_directives() {
    assert_debug_snapshot!(parse!("query { user @skip(if: true) { id } }"));
}

#[test]
fn test_query_with_aliases() {
    assert_debug_snapshot!(parse!("query { userId: user { userName: name } }"));
}

#[test]
fn test_nested_selection_sets() {
    assert_debug_snapshot!(parse!("query { user { posts { comments { author { name } } } } }"));
}

#[test]
fn test_complex_nested_query() {
    assert_debug_snapshot!(parse!(
        "query { user { posts { comments { author { posts { id } } } } } }"
    ));
}

#[test]
fn test_query_with_list_arguments() {
    assert_debug_snapshot!(parse!(
        r#"query { users(ids: [1, 2, 3], tags: ["admin", "user"]) { id } }"#
    ));
}

#[test]
fn test_query_with_object_arguments() {
    assert_debug_snapshot!(parse!(
        r#"query { createUser(input: { name: "John", age: 30, tags: ["admin"] }) { id } }"#
    ));
}

#[test]
fn test_query_with_complex_nesting() {
    assert_debug_snapshot!(parse!(
        r#"query ComplexQuery($userId: ID!, $includeComments: Boolean = false) {
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
        }"#
    ));
}

#[test]
fn test_multiple_operations() {
    assert_debug_snapshot!(parse!(
        r#"query GetUser { user { id } }
        query GetPosts { posts { id } }
        mutation CreatePost { createPost { id } }"#
    ));
}

// =============================================================================
// MUTATIONS
// =============================================================================

#[test]
fn test_simple_mutation() {
    assert_debug_snapshot!(parse!(r#"mutation CreateUser { createUser(name: "John") { id } }"#));
}

#[test]
fn test_mutation_with_input() {
    assert_debug_snapshot!(parse!(
        "mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }"
    ));
}

#[test]
fn test_mutation_with_complex_input() {
    assert_debug_snapshot!(parse!(
        r#"mutation CreatePost($input: PostInput!) {
            createPost(input: $input) {
                id
                title
                author { id name }
            }
        }"#
    ));
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

#[test]
fn test_subscription() {
    assert_debug_snapshot!(parse!("subscription { messageAdded { id content author { name } } }"));
}

// =============================================================================
// FRAGMENTS
// =============================================================================

#[test]
fn test_named_fragment() {
    assert_debug_snapshot!(parse!("fragment UserFields on User { id name email }"));
}

#[test]
fn test_query_with_fragment() {
    assert_debug_snapshot!(parse!(
        "query { user { ...UserFields } } fragment UserFields on User { id name email }"
    ));
}

#[test]
fn test_query_with_fragment_spread() {
    assert_debug_snapshot!(parse!(
        r#"query { user { ...UserFields } }
        fragment UserFields on User { id name }"#
    ));
}

#[test]
fn test_inline_fragment() {
    assert_debug_snapshot!(parse!("query { search { ... on User { name } } }"));
}

#[test]
fn test_nested_fragments() {
    assert_debug_snapshot!(parse!(
        r#"query { user { ...UserWithPosts } }
        fragment UserWithPosts on User { ...UserBasic posts { id } }
        fragment UserBasic on User { id name }"#
    ));
}

#[test]
fn test_nested_fragment_spreads() {
    assert_debug_snapshot!(parse!(
        r#"query { user { ...UserWithPosts } }
        fragment UserWithPosts on User { id ...UserBasic }
        fragment UserBasic on User { name email }"#
    ));
}

#[test]
fn test_fragment_with_nested_spreads() {
    assert_debug_snapshot!(parse!(
        r#"query { user { ...UserComplete } }
        fragment UserComplete on User { ...UserBasic ...UserProfile }
        fragment UserBasic on User { id name }
        fragment UserProfile on User { email avatar }"#
    ));
}

#[test]
fn test_query_with_inline_and_named_fragments() {
    assert_debug_snapshot!(parse!(
        r#"query {
            search {
                ...ResultFields
                ... on User { email }
                ... on Post { content }
            }
        }
        fragment ResultFields on SearchResult { id }"#
    ));
}

#[test]
fn test_query_with_fragments_and_variables() {
    assert_debug_snapshot!(parse!(
        r#"query GetUser($id: ID!, $withPosts: Boolean!) {
            user(id: $id) {
                ...UserFields
                posts @include(if: $withPosts) { ...PostFields }
            }
        }
        fragment UserFields on User { id name email }
        fragment PostFields on Post { id title content }"#
    ));
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

// Object Types

#[test]
fn test_object_type() {
    assert_debug_snapshot!(parse!("type User { id: ID! name: String! email: String }"));
}

#[test]
fn test_complete_schema() {
    assert_debug_snapshot!(parse!(
        "type Query { user(id: ID!): User users: [User!]! } type User { id: ID! name: String! email: String! }"
    ));
}

#[test]
fn test_type_with_implements() {
    assert_debug_snapshot!(parse!("type User implements Node { id: ID! }"));
}

#[test]
fn test_type_with_multiple_interfaces() {
    assert_debug_snapshot!(parse!("type User implements Node & Timestamped { id: ID! }"));
}

#[test]
fn test_type_implementing_multiple_interfaces() {
    assert_debug_snapshot!(parse!(
        r#"interface Node { id: ID! }
        interface Timestamped { createdAt: String! updatedAt: String! }
        type User implements Node & Timestamped {
            id: ID!
            createdAt: String!
            updatedAt: String!
            name: String!
        }"#
    ));
}

#[test]
fn test_type_with_description() {
    assert_debug_snapshot!(parse!(r#""A user in the system" type User { id: ID! }"#));
}

#[test]
fn test_type_with_field_descriptions() {
    assert_debug_snapshot!(parse!(
        r#""A user in the system"
        type User {
            "The user's unique identifier"
            id: ID!
            "The user's full name"
            name: String!
        }"#
    ));
}

#[test]
fn test_field_with_description() {
    assert_debug_snapshot!(parse!(r#"type User { "User ID" id: ID! }"#));
}

#[test]
fn test_field_with_arguments() {
    assert_debug_snapshot!(parse!("type Query { users(first: Int, offset: Int): [User] }"));
}

#[test]
fn test_field_with_multiple_arguments() {
    assert_debug_snapshot!(parse!(
        r#"type Query {
            users(
                first: Int
                after: String
                orderBy: OrderBy
                filter: UserFilter
            ): [User!]!
        }
        type User { id: ID! }"#
    ));
}

// Interfaces

#[test]
fn test_interface_definition() {
    assert_debug_snapshot!(parse!("interface Node { id: ID! createdAt: String }"));
}

#[test]
fn test_interface_with_fields() {
    assert_debug_snapshot!(parse!("interface Node { id: ID! createdAt: String! }"));
}

#[test]
fn test_schema_with_interface() {
    assert_debug_snapshot!(parse!(
        "interface Node { id: ID! } type User implements Node { id: ID! name: String! }"
    ));
}

#[test]
fn test_interface_with_multiple_implementations() {
    assert_debug_snapshot!(parse!(
        r#"interface Node { id: ID! }
        type User implements Node { id: ID! name: String! }
        type Post implements Node { id: ID! title: String! }
        type Comment implements Node { id: ID! content: String! }"#
    ));
}

// Unions

#[test]
fn test_union_definition() {
    assert_debug_snapshot!(parse!("union SearchResult = User | Post | Comment"));
}

#[test]
fn test_schema_with_union() {
    assert_debug_snapshot!(parse!(
        "union SearchResult = User | Post type User { id: ID! } type Post { id: ID! }"
    ));
}

#[test]
fn test_union_with_four_types() {
    assert_debug_snapshot!(parse!("union SearchResult = User | Post | Comment | Tag"));
}

// Enums

#[test]
fn test_enum_definition() {
    assert_debug_snapshot!(parse!("enum Status { ACTIVE INACTIVE PENDING }"));
}

#[test]
fn test_enum_with_description() {
    assert_debug_snapshot!(parse!(r#""User status" enum Status { ACTIVE INACTIVE }"#));
}

#[test]
fn test_enum_with_value_descriptions() {
    assert_debug_snapshot!(parse!(
        r#""User account status"
        enum Status {
            "Account is active"
            ACTIVE
            "Account is inactive"
            INACTIVE
        }"#
    ));
}

#[test]
fn test_schema_with_enum() {
    assert_debug_snapshot!(parse!(
        "enum Status { ACTIVE INACTIVE PENDING } type User { status: Status! }"
    ));
}

// Input Types

#[test]
fn test_input_definition() {
    assert_debug_snapshot!(parse!("input UserInput { name: String! email: String! age: Int }"));
}

#[test]
fn test_input_with_default_values() {
    assert_debug_snapshot!(parse!("input UserInput { name: String! age: Int = 18 }"));
}

#[test]
fn test_input_with_nested_types() {
    assert_debug_snapshot!(parse!(
        r#"input AddressInput { street: String! city: String! }
        input UserInput { name: String! address: AddressInput! }"#
    ));
}

#[test]
fn test_schema_with_input_type() {
    assert_debug_snapshot!(parse!(
        r#"input UserInput { name: String! email: String! age: Int }
        type Mutation { createUser(input: UserInput!): User }
        type User { id: ID! }"#
    ));
}

// Scalars

#[test]
fn test_scalar_definition() {
    assert_debug_snapshot!(parse!("scalar DateTime"));
}

#[test]
fn test_schema_with_custom_scalars() {
    assert_debug_snapshot!(parse!(
        "scalar DateTime scalar JSON type User { createdAt: DateTime! metadata: JSON }"
    ));
}

#[test]
fn test_all_scalar_types() {
    assert_debug_snapshot!(parse!(
        r#"type Example {
            id: ID!
            name: String!
            age: Int!
            price: Float!
            active: Boolean!
        }"#
    ));
}

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

#[test]
fn test_schema_definition() {
    assert_debug_snapshot!(parse!("schema { query: Query mutation: Mutation }"));
}

#[test]
fn test_schema_with_all_operations() {
    assert_debug_snapshot!(parse!(
        "schema { query: Query mutation: Mutation subscription: Subscription }"
    ));
}

#[test]
fn test_complete_schema_definition() {
    assert_debug_snapshot!(parse!(
        r#"schema {
            query: Query
            mutation: Mutation
            subscription: Subscription
        }
        type Query { user: User }
        type Mutation { createUser: User }
        type Subscription { userAdded: User }
        type User { id: ID! }"#
    ));
}

#[test]
fn test_large_schema() {
    assert_debug_snapshot!(parse!(
        r#"type Query {
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
        interface Node { id: ID! }
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
        input UserInput { name: String! email: String! }"#
    ));
}

// =============================================================================
// DIRECTIVES
// =============================================================================

#[test]
fn test_directive_definition() {
    assert_debug_snapshot!(parse!("directive @auth(requires: Role!) on FIELD_DEFINITION"));
}

#[test]
fn test_schema_with_directive_definition() {
    assert_debug_snapshot!(parse!(
        "directive @auth(requires: Role!) on FIELD_DEFINITION | OBJECT enum Role { ADMIN USER }"
    ));
}

#[test]
fn test_repeatable_directive() {
    assert_debug_snapshot!(parse!(
        "directive @tag(name: String!) repeatable on FIELD_DEFINITION type User { id: ID! @tag(name: \"public\") @tag(name: \"searchable\") }"
    ));
}

#[test]
fn test_repeatable_directive_definition() {
    assert_debug_snapshot!(parse!("directive @tag(name: String!) repeatable on FIELD"));
}

// =============================================================================
// TYPE MODIFIERS
// =============================================================================

#[test]
fn test_list_type() {
    assert_debug_snapshot!(parse!("type User { tags: [String] }"));
}

#[test]
fn test_non_null_type() {
    assert_debug_snapshot!(parse!("type User { id: ID! name: String! }"));
}

#[test]
fn test_non_null_list() {
    assert_debug_snapshot!(parse!("type User { tags: [String!]! }"));
}

#[test]
fn test_list_and_non_null_combinations() {
    assert_debug_snapshot!(parse!(
        r#"type Example {
            nullableList: [String]
            nonNullList: [String]!
            listOfNonNulls: [String!]
            nonNullListOfNonNulls: [String!]!
        }"#
    ));
}

// =============================================================================
// SCHEMA EXTENSIONS
// =============================================================================

#[test]
fn test_extend_type() {
    assert_debug_snapshot!(parse!("extend type User { avatar: String }"));
}

#[test]
fn test_extend_type_with_base() {
    assert_debug_snapshot!(parse!("type User { id: ID! } extend type User { email: String! }"));
}

#[test]
fn test_extend_interface() {
    assert_debug_snapshot!(parse!("extend interface Node { createdAt: String }"));
}

#[test]
fn test_extend_interface_with_base() {
    assert_debug_snapshot!(parse!(
        "interface Node { id: ID! } extend interface Node { createdAt: String! }"
    ));
}

#[test]
fn test_extend_union() {
    assert_debug_snapshot!(parse!(
        "union SearchResult = User | Post extend union SearchResult = Comment"
    ));
}

#[test]
fn test_extend_enum() {
    assert_debug_snapshot!(parse!("enum Status { ACTIVE INACTIVE } extend enum Status { PENDING }"));
}

#[test]
fn test_extend_input() {
    assert_debug_snapshot!(parse!(
        "input UserInput { name: String! } extend input UserInput { email: String! }"
    ));
}
