pub mod builder;
pub mod config;

pub use builder::PipelineBuilder;
pub use config::PipelineConfig;

use crate::arena::Arena;
use crate::codegen::{CodegenContext, Generator};
use crate::error::MearieError;
use crate::graphql::parser::Parser;
use crate::schema::{DocumentIndex, SchemaBuilder};
use crate::source::{Source, SourceBuf};
use crate::transformation::transform_document;
use crate::validation::{ValidationContext, Validator, visitor::VisitNode};

pub struct Pipeline<'a> {
    arena: &'a Arena,
    schemas: Vec<Source<'a>>,
    documents: Vec<Source<'a>>,
    config: PipelineConfig,
}

/// Output from the pipeline processing.
///
/// The pipeline always performs full processing (parsing, validation, and
/// code generation). The output contains generated code files and any errors
/// encountered during processing.
pub struct PipelineOutput {
    /// Generated source files (types.d.ts, graphql.d.ts, graphql.js)
    pub sources: Vec<SourceBuf>,
    /// Errors encountered during parsing, validation, or code generation
    pub errors: Vec<MearieError>,
}

impl<'a> Pipeline<'a> {
    pub fn builder(arena: &'a Arena) -> PipelineBuilder<'a> {
        PipelineBuilder::new(arena)
    }

    pub(crate) fn new(
        arena: &'a Arena,
        schemas: Vec<Source<'a>>,
        documents: Vec<Source<'a>>,
        config: PipelineConfig,
    ) -> Self {
        Self {
            arena,
            schemas,
            documents,
            config,
        }
    }

    /// Process the pipeline: parse, validate, transform, and generate code.
    ///
    /// The pipeline performs the following steps:
    /// 1. Parse all schema documents
    /// 2. Build SchemaIndex
    /// 3. Parse all executable documents
    /// 4. Build DocumentIndex
    /// 5. Validate all documents
    /// 6. Transform documents (add __typename and id fields)
    /// 7. Generate TypeScript code
    ///
    /// # Returns
    ///
    /// Returns `PipelineOutput` containing generated source files and any errors
    /// encountered during processing.
    pub fn process(self) -> PipelineOutput {
        let mut errors = Vec::new();

        let mut schema_builder = SchemaBuilder::new();

        let built_in_source = Source::ephemeral(crate::schema::BUILTIN_SCHEMA);
        if let Err(e) = Parser::new(self.arena)
            .with_source(&built_in_source)
            .parse()
            .and_then(|doc| schema_builder.add_document(doc))
        {
            errors.push(e);
        }

        for source in &self.schemas {
            let document = Parser::new(self.arena).with_source(source).parse();
            if let Err(e) = document.and_then(|doc| schema_builder.add_document(doc)) {
                errors.push(e);
            }
        }

        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();
        for source in &self.documents {
            let document = Parser::new(self.arena).with_source(source).parse();
            if let Err(e) = document.and_then(|doc| document_index.add_document(doc)) {
                errors.push(e);
            }
        }

        for document in document_index.documents() {
            let mut validator = Validator::default();
            let mut ctx = ValidationContext::new(&schema_index, &document_index, document);
            document.visit(&mut ctx, &mut validator);
            errors.extend(ctx.errors().iter().cloned());
        }

        for document in document_index.documents().collect::<Vec<_>>() {
            let transformed = transform_document(self.arena, document, &schema_index);
            document_index.set_transformed_document(document, transformed);
        }

        let ctx = CodegenContext::new(self.config);
        let generator = Generator::new(&ctx, &schema_index, &document_index);
        let sources = generator.generate().unwrap_or_else(|e| {
            errors.push(e);
            Vec::new()
        });

        PipelineOutput { sources, errors }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fragment_variable_definitions_stripped_from_body() {
        let arena = Arena::new();

        let schema_code = r#"
            type Query { user: User }
            type User { profilePic(size: Int): String }
        "#;

        let fragment_code = r#"
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        let operation_code = r#"
            query GetUser {
                user {
                    ...Avatar(size: 100)
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema_code))
            .with_document(Source::ephemeral(fragment_code))
            .with_document(Source::ephemeral(operation_code))
            .build()
            .process();

        assert!(output.errors.is_empty(), "Expected no errors, got: {:?}", output.errors);

        let runtime_file = output.sources.iter().find(|s| s.file_path == "graphql.js").unwrap();

        for line in runtime_file.code.lines() {
            if line.trim_start().starts_with("body:") {
                assert!(
                    !line.contains("$size: Int!"),
                    "Fragment body should not contain variable definitions, but got:\n{}",
                    line
                );
                assert!(
                    !line.contains("(size: 100)"),
                    "Fragment spread should not contain arguments in body, but got:\n{}",
                    line
                );
            }
        }
    }

    #[test]
    fn test_fragment_args_in_runtime_selections() {
        let arena = Arena::new();

        let schema_code = r#"
            type Query { user: User }
            type User { profilePic(size: Int): String }
        "#;

        let fragment_code = r#"
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        let operation_code = r#"
            query GetUser {
                user {
                    ...Avatar(size: 100)
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema_code))
            .with_document(Source::ephemeral(fragment_code))
            .with_document(Source::ephemeral(operation_code))
            .build()
            .process();

        assert!(output.errors.is_empty(), "Expected no errors, got: {:?}", output.errors);

        let runtime_file = output.sources.iter().find(|s| s.file_path == "graphql.js").unwrap();

        assert!(
            runtime_file.code.contains("FragmentSpread"),
            "Runtime should contain FragmentSpread selections"
        );
    }

    #[test]
    fn test_fragment_vars_type_generated() {
        let arena = Arena::new();

        let schema_code = r#"
            type Query { user: User }
            type User { profilePic(size: Int): String }
        "#;

        let fragment_code = r#"
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        let operation_code = r#"
            query GetUser {
                user {
                    ...Avatar(size: 100)
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema_code))
            .with_document(Source::ephemeral(fragment_code))
            .with_document(Source::ephemeral(operation_code))
            .build()
            .process();

        assert!(output.errors.is_empty(), "Expected no errors, got: {:?}", output.errors);

        let types_file = output.sources.iter().find(|s| s.file_path == "types.d.ts").unwrap();
        assert!(
            types_file.code.contains("Avatar$vars"),
            "Types should contain Avatar$vars type, but got:\n{}",
            types_file.code
        );
    }

    #[test]
    fn test_required_directive_stripped_from_fragment_in_operation_body() {
        let arena = Arena::new();

        let schema_code = r#"
            type Query { user: User }
            type User { name: String, email: String }
        "#;

        let fragment_code = r#"
            fragment UserFields on User {
                name @required
                email
            }
        "#;

        let operation_code = r#"
            query GetUser {
                user {
                    ...UserFields
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema_code))
            .with_document(Source::ephemeral(fragment_code))
            .with_document(Source::ephemeral(operation_code))
            .build()
            .process();

        assert!(output.errors.is_empty(), "Expected no errors, got: {:?}", output.errors);

        let runtime_file = output.sources.iter().find(|s| s.file_path == "graphql.js").unwrap();

        for line in runtime_file.code.lines() {
            if line.trim_start().starts_with("body:") {
                assert!(
                    !line.contains("@required"),
                    "Artifact body should not contain @required directive, but got:\n{}",
                    line
                );
            }
        }
    }

    macro_rules! assert_pipeline_snapshots {
        ($name:expr, $output:expr) => {{
            let types = $output.sources.iter().find(|s| s.file_path == "types.d.ts").unwrap();
            let module = $output.sources.iter().find(|s| s.file_path == "graphql.d.ts").unwrap();
            let runtime = $output.sources.iter().find(|s| s.file_path == "graphql.js").unwrap();
            insta::assert_snapshot!(concat!($name, "_types"), &types.code);
            insta::assert_snapshot!(concat!($name, "_module"), &module.code);
            insta::assert_snapshot!(concat!($name, "_runtime"), &runtime.code);
        }};
    }

    #[test]
    fn snapshot_simple_query() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                user(id: ID!): User
                post(id: ID!): Post
            }
            type User {
                id: ID!
                name: String!
                email: String
            }
            type Post {
                id: ID!
                title: String!
                body: String
            }
        "#;

        let document = r#"
            query GetUser($userId: ID!) {
                user(id: $userId) {
                    id
                    name
                    email
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("simple_query", output);
    }

    #[test]
    fn snapshot_mutation_with_input() {
        let arena = Arena::new();

        let schema = r#"
            type Query { _unused: Boolean }
            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
            input CreateUserInput {
                name: String!
                email: String!
                age: Int
            }
            type User {
                id: ID!
                name: String!
                email: String!
            }
        "#;

        let document = r#"
            mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                    email
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("mutation_with_input", output);
    }

    #[test]
    fn snapshot_subscription() {
        let arena = Arena::new();

        let schema = r#"
            type Query { _unused: Boolean }
            type Subscription {
                messageAdded(channelId: ID!): Message!
            }
            type Message {
                id: ID!
                text: String!
                sender: String!
            }
        "#;

        let document = r#"
            subscription OnMessageAdded($channelId: ID!) {
                messageAdded(channelId: $channelId) {
                    id
                    text
                    sender
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("subscription", output);
    }

    #[test]
    fn snapshot_multiple_operations() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                user(id: ID!): User
                users: [User!]!
            }
            type Mutation {
                deleteUser(id: ID!): Boolean!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let doc_a = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }
        "#;

        let doc_b = r#"
            query ListUsers {
                users {
                    id
                    name
                }
            }
        "#;

        let doc_c = r#"
            mutation DeleteUser($id: ID!) {
                deleteUser(id: $id)
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(doc_a))
            .with_document(Source::ephemeral(doc_b))
            .with_document(Source::ephemeral(doc_c))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("multiple_operations", output);
    }

    #[test]
    fn snapshot_list_variables() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                usersByIds(ids: [ID!]!): [User!]!
                search(tags: [String]): [SearchResult]
            }
            type User {
                id: ID!
                name: String!
            }
            type SearchResult {
                id: ID!
                title: String!
            }
        "#;

        let document = r#"
            query FindUsers($ids: [ID!]!, $tags: [String]) {
                usersByIds(ids: $ids) {
                    id
                    name
                }
                search(tags: $tags) {
                    id
                    title
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("list_variables", output);
    }

    #[test]
    fn snapshot_field_arguments() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                user: User
            }
            type User {
                id: ID!
                avatar(size: Int!, format: String): String
            }
        "#;

        let document = r#"
            query GetUserAvatar($fmt: String) {
                user {
                    id
                    avatar(size: 200, format: $fmt)
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("field_arguments", output);
    }

    #[test]
    fn snapshot_nested_input_objects() {
        let arena = Arena::new();

        let schema = r#"
            type Query { _unused: Boolean }
            type Mutation {
                createOrder(input: CreateOrderInput!): Order!
            }
            input CreateOrderInput {
                item: OrderItemInput!
                shipping: ShippingInput!
            }
            input OrderItemInput {
                productId: ID!
                quantity: Int!
            }
            input ShippingInput {
                address: AddressInput!
            }
            input AddressInput {
                street: String!
                city: String!
            }
            type Order {
                id: ID!
                status: String!
            }
        "#;

        let document = r#"
            mutation CreateOrder($input: CreateOrderInput!) {
                createOrder(input: $input) {
                    id
                    status
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("nested_input_objects", output);
    }

    #[test]
    fn snapshot_fragment_basic() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                name: String!
                email: String
            }
        "#;

        let fragment = r#"
            fragment UserInfo on User {
                name
                email
            }
        "#;

        let document = r#"
            query GetUser {
                user {
                    id
                    ...UserInfo
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(fragment))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("fragment_basic", output);
    }

    #[test]
    fn snapshot_fragment_with_args() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                profilePic(size: Int): String
            }
        "#;

        let fragment = r#"
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        let document = r#"
            query GetUser {
                user {
                    id
                    ...Avatar(size: 100)
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(fragment))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("fragment_with_args", output);
    }

    #[test]
    fn snapshot_multiple_fragments() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                name: String!
                email: String
                age: Int
            }
        "#;

        let fragment_a = r#"
            fragment UserName on User {
                name
            }
        "#;

        let fragment_b = r#"
            fragment UserContact on User {
                email
                age
            }
        "#;

        let document = r#"
            query GetUser {
                user {
                    id
                    ...UserName
                    ...UserContact
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(fragment_a))
            .with_document(Source::ephemeral(fragment_b))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("multiple_fragments", output);
    }

    #[test]
    fn snapshot_union_inline_fragments() {
        let arena = Arena::new();

        let schema = r#"
            type Query { search: [SearchResult!]! }
            union SearchResult = User | Post
            type User {
                id: ID!
                name: String!
            }
            type Post {
                id: ID!
                title: String!
            }
        "#;

        let document = r#"
            query Search {
                search {
                    ... on User {
                        id
                        name
                    }
                    ... on Post {
                        id
                        title
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("union_inline_fragments", output);
    }

    #[test]
    fn snapshot_union_partial_coverage() {
        let arena = Arena::new();

        let schema = r#"
            type Query { result: Result! }
            union Result = Success | Error
            type Success {
                id: ID!
                value: String!
            }
            type Error {
                id: ID!
                message: String!
            }
        "#;

        let document = r#"
            query GetResult {
                result {
                    ... on Success {
                        id
                        value
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("union_partial_coverage", output);
    }

    #[test]
    fn snapshot_union_with_fragment_refs() {
        let arena = Arena::new();

        let schema = r#"
            type Query { feed: [FeedItem!]! }
            union FeedItem = Article | Comment
            type Article {
                id: ID!
                headline: String!
            }
            type Comment {
                id: ID!
                body: String!
            }
        "#;

        let fragment = r#"
            fragment ArticlePreview on Article {
                headline
            }
        "#;

        let document = r#"
            query GetFeed {
                feed {
                    ... on Article {
                        id
                        ...ArticlePreview
                    }
                    ... on Comment {
                        id
                        body
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(fragment))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("union_with_fragment_refs", output);
    }

    #[test]
    fn snapshot_interface_inline_fragments() {
        let arena = Arena::new();

        let schema = r#"
            type Query { node(id: ID!): Node }
            interface Node {
                id: ID!
            }
            type User implements Node {
                id: ID!
                name: String!
            }
            type Post implements Node {
                id: ID!
                title: String!
            }
        "#;

        let document = r#"
            query GetNode($id: ID!) {
                node(id: $id) {
                    id
                    ... on User {
                        name
                    }
                    ... on Post {
                        title
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("interface_inline_fragments", output);
    }

    #[test]
    fn snapshot_enum_types() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                usersByRole(role: Role!): [User!]!
            }
            enum Role {
                ADMIN
                USER
                MODERATOR
            }
            type User {
                id: ID!
                name: String!
                role: Role!
            }
        "#;

        let document = r#"
            query GetUsersByRole($role: Role!) {
                usersByRole(role: $role) {
                    id
                    name
                    role
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("enum_types", output);
    }

    #[test]
    fn snapshot_custom_scalar_mapping() {
        let arena = Arena::new();

        let schema = r#"
            scalar DateTime
            scalar JSON
            type Query {
                event: Event
            }
            type Event {
                id: ID!
                name: String!
                startAt: DateTime!
                metadata: JSON
            }
        "#;

        let document = r#"
            query GetEvent {
                event {
                    id
                    name
                    startAt
                    metadata
                }
            }
        "#;

        let mut scalar_map = rustc_hash::FxHashMap::default();
        scalar_map.insert("DateTime".to_string(), "string".to_string());
        scalar_map.insert("JSON".to_string(), "Record<string, unknown>".to_string());

        let config = PipelineConfig::new().with_scalar_map(scalar_map);

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .with_config(config)
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("custom_scalar_mapping", output);
    }

    #[test]
    fn snapshot_list_nullable_combinations() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                a: [String!]!
                b: [String]
                c: [String!]
                d: [String]!
            }
        "#;

        let document = r#"
            query ListCombinations {
                a
                b
                c
                d
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("list_nullable_combinations", output);
    }

    #[test]
    fn snapshot_required_directive() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                nickname: String
                bio: String
            }
        "#;

        let document = r#"
            query GetUser {
                user {
                    id
                    nickname @required
                    bio
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("required_directive", output);
    }

    #[test]
    fn snapshot_required_cascade() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User! }
            type User {
                id: ID!
                profile: Profile!
            }
            type Profile {
                id: ID!
                avatar: String
            }
        "#;

        let document = r#"
            query GetUserAvatar {
                user {
                    id
                    profile {
                        id
                        avatar @required(action: CASCADE)
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("required_cascade", output);
    }

    #[test]
    fn snapshot_required_cascade_stops() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User! }
            type User {
                id: ID!
                settings: Settings
            }
            type Settings {
                id: ID!
                theme: Theme!
            }
            type Theme {
                id: ID!
                primaryColor: String
            }
        "#;

        let document = r#"
            query GetTheme {
                user {
                    id
                    settings {
                        id
                        theme {
                            id
                            primaryColor @required(action: CASCADE)
                        }
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("required_cascade_stops", output);
    }

    #[test]
    fn snapshot_custom_directives() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                name: String!
                email: String
                phone: String
            }
        "#;

        let document = r#"
            query GetUser($showEmail: Boolean!, $hidePhone: Boolean!) {
                user {
                    id
                    name
                    email @include(if: $showEmail)
                    phone @skip(if: $hidePhone)
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("custom_directives", output);
    }

    #[test]
    fn snapshot_field_alias() {
        let arena = Arena::new();

        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
                email: String
            }
        "#;

        let document = r#"
            query GetTwoUsers($first: ID!, $second: ID!) {
                firstUser: user(id: $first) {
                    id
                    displayName: name
                    email
                }
                secondUser: user(id: $second) {
                    id
                    displayName: name
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("field_alias", output);
    }

    #[test]
    fn snapshot_deeply_nested() {
        let arena = Arena::new();

        let schema = r#"
            type Query { user: User }
            type User {
                id: ID!
                name: String!
                profile: Profile
            }
            type Profile {
                id: ID!
                bio: String
                address: Address
            }
            type Address {
                id: ID!
                street: String!
                city: String!
                country: String!
            }
        "#;

        let document = r#"
            query GetUserAddress {
                user {
                    id
                    name
                    profile {
                        id
                        bio
                        address {
                            id
                            street
                            city
                            country
                        }
                    }
                }
            }
        "#;

        let output = Pipeline::builder(&arena)
            .with_schema(Source::ephemeral(schema))
            .with_document(Source::ephemeral(document))
            .build()
            .process();

        assert!(output.errors.is_empty(), "errors: {:?}", output.errors);
        assert_pipeline_snapshots!("deeply_nested", output);
    }
}
