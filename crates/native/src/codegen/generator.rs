use super::{
    CodegenContext,
    generators::{ModuleGenerator, RuntimeGenerator, TypesGenerator},
};
use crate::error::Result;
use crate::schema::{DocumentIndex, SchemaIndex};
use crate::source::SourceBuf;

#[cfg(test)]
use crate::pipeline::PipelineConfig;

/// Code generation builder for GraphQL operations.
///
/// `Builder` orchestrates TypeScript code generation from GraphQL schema and executable documents.
/// It generates three output files:
/// - `types.d.ts` - Type definitions for operations, fragments, and input objects
/// - `graphql.d.ts` - Module augmentation with enum types and public fragment types
/// - `graphql.js` - Runtime document nodes and the `graphql()` function
///
/// # Architecture
///
/// Uses three specialized generators:
/// - [`TypesGenerator`] - Generates scalar types, input objects, enums, operations, and fragments
/// - [`ModuleGenerator`] - Generates module augmentation with type aliases and function overloads
/// - [`RuntimeGenerator`] - Generates runtime document nodes
///
/// # Example
///
/// ```
/// use mearie_native::codegen::{CodegenContext, Generator};
/// use mearie_native::schema::{SchemaBuilder, DocumentIndex};
/// use mearie_native::arena::Arena;
///
/// let arena = Arena::new();
/// let ctx = CodegenContext::new();
/// let schema = SchemaBuilder::new().build();
/// let document = DocumentIndex::new();
///
/// let builder = Generator::new(&ctx, &schema, &document);
/// let sources = builder.generate().unwrap();
/// ```
pub struct Generator<'a, 'b> {
    ctx: &'a CodegenContext,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> Generator<'a, 'b> {
    /// Creates a new code generation builder.
    ///
    /// # Parameters
    ///
    /// - `ctx` - Codegen context containing AST builder
    /// - `schema` - Schema index with type definitions
    /// - `document` - Document index with operations and fragments
    pub fn new(ctx: &'a CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self { ctx, schema, document }
    }

    /// Generates TypeScript code from GraphQL schema and operations.
    ///
    /// # Returns
    ///
    /// Returns three source files in order:
    /// 1. `types.d.ts` - Type definitions
    /// 2. `graphql.d.ts` - Module augmentation
    /// 3. `graphql.js` - Runtime code
    ///
    /// # Errors
    ///
    /// Returns an error if code generation fails due to:
    /// - Invalid operation structure
    /// - Missing schema types referenced by operations
    /// - Invalid fragment spreads
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::codegen::{CodegenContext, Generator};
    /// # use mearie_native::schema::{SchemaBuilder, DocumentIndex};
    /// # use mearie_native::arena::Arena;
    /// # let arena = Arena::new();
    /// # let ctx = CodegenContext::new();
    /// # let schema = SchemaBuilder::new().build();
    /// # let document = DocumentIndex::new();
    /// let builder = Generator::new(&ctx, &schema, &document);
    /// let sources = builder.generate().unwrap();
    ///
    /// assert_eq!(sources.len(), 3);
    /// assert_eq!(sources[0].file_path, "types.d.ts");
    /// assert_eq!(sources[1].file_path, "graphql.d.ts");
    /// assert_eq!(sources[2].file_path, "graphql.js");
    /// ```
    pub fn generate(&self) -> Result<Vec<SourceBuf>> {
        let types = TypesGenerator::new(self.ctx, self.schema, self.document).generate()?;
        let module = ModuleGenerator::new(self.ctx, self.schema, self.document).generate()?;
        let runtime = RuntimeGenerator::new(self.ctx, self.schema, self.document).generate()?;

        Ok(vec![types, module, runtime])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{DocumentIndex, SchemaBuilder};
    use crate::setup_codegen;
    use assertables::*;

    #[test]
    fn test_operation_builder_new() {
        let ctx = CodegenContext::new(PipelineConfig::default());
        let schema = SchemaBuilder::new().build();
        let document = DocumentIndex::new();
        let _generator = Generator::new(&ctx, &schema, &document);
    }

    #[test]
    fn test_generate_simple_query() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;
        assert_contains!(code, "GetUser$vars");
        assert_contains!(code, "GetUser$data");
    }

    #[test]
    fn test_generate_mutation() {
        let schema = r#"
            type Mutation {
                createUser(name: String!): User!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            mutation CreateUser($name: String!) {
                createUser(name: $name) {
                    id
                    name
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;
        assert_contains!(code, "CreateUser$vars");
        assert_contains!(code, "CreateUser$data");
    }

    #[test]
    fn test_generate_with_fragment() {
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

        let operations = r#"
            fragment UserFields on User {
                id
                name
                email
            }

            query GetUser($id: ID!) {
                user(id: $id) {
                    ...UserFields
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;
        assert_contains!(code, "export type UserFields$data");
        assert_contains!(code, "export type UserFields =");
        assert_contains!(code, "export type GetUser$vars");
        assert_contains!(code, "export type GetUser$data");
        assert_contains!(code, "FragmentRefs<\"UserFields\">");
        assert_contains!(code, "UserFields$key");
    }

    #[test]
    fn test_generate_with_input_object() {
        let schema = r#"
            input CreateUserInput {
                name: String!
                email: String
            }

            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;
        assert_contains!(code, "CreateUserInput");
        assert_contains!(code, "CreateUser$vars");
        assert_contains!(code, "input: CreateUserInput");
        assert_contains!(code, "CreateUser$data");
    }

    #[test]
    fn test_generate_complete_operation_output() {
        let schema = r#"
            type User {
                id: ID!
                name: String!
                email: String
            }

            type Post {
                id: ID!
                title: String!
                author: User!
            }

            type Query {
                user(id: ID!): User
                users: [User!]!
                post(id: ID!): Post
            }

            type Mutation {
                createUser(name: String!, email: String): User!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                    email
                }
            }

            query GetAllUsers {
                users {
                    id
                    name
                }
            }

            mutation CreateUser($name: String!, $email: String) {
                createUser(name: $name, email: $email) {
                    id
                    name
                    email
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type GetUser$vars = {");
        assert_contains!(code, "id: $Scalars[\"ID\"]");

        assert_contains!(code, "export type GetUser$data = {");
        assert_contains!(code, "user?: $Nullable<{");
        assert_contains!(code, "email?: $Nullable<$Scalars[\"String\"]>");
        assert_contains!(code, "name: $Scalars[\"String\"]");
        assert_contains!(code, "id: $Scalars[\"ID\"]");

        assert_contains!(code, "export type GetAllUsers$data = {");
        assert_contains!(code, "users: $List<{");

        assert_contains!(code, "export type CreateUser$vars = {");
        assert_contains!(code, "name: $Scalars[\"String\"]");
        assert_contains!(code, "email?: $Nullable<$Scalars[\"String\"]>");

        assert_contains!(code, "export type CreateUser$data = {");
        assert_contains!(code, "createUser: {");
        assert_contains!(code, "id: $Scalars[\"ID\"]");
    }

    #[test]
    fn test_generate_with_input_object_complete_output() {
        let schema = r#"
            input CreateUserInput {
                name: String!
                email: String
                age: Int
            }

            type User {
                id: ID!
                name: String!
                email: String
            }

            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
        "#;

        let operations = r#"
            mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                    email
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type CreateUserInput = {");
        assert_contains!(code, "name: $Scalars[\"String\"]");
        assert_contains!(code, "email?: $Nullable<$Scalars[\"String\"]>");
        assert_contains!(code, "age?: $Nullable<$Scalars[\"Int\"]>");

        assert_contains!(code, "export type CreateUser$vars = {");
        assert_contains!(code, "input: CreateUserInput");

        assert_contains!(code, "export type CreateUser$data = {");
        assert_contains!(code, "createUser: {");
        assert_contains!(code, "email?: $Nullable<$Scalars[\"String\"]>");
    }

    #[test]
    fn test_custom_scalars_in_input_objects() {
        let schema = r#"
            scalar DateTime
            scalar JSON
            scalar URL

            input CreateUserInput {
                name: String!
                email: String!
                createdAt: DateTime!
                updatedAt: DateTime
                metadata: JSON
                website: URL
            }

            type User {
                id: ID!
                name: String!
            }

            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
        "#;

        let operations = r#"
            mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type CreateUserInput = {");
        assert_contains!(code, "name: $Scalars[\"String\"]");
        assert_contains!(code, "email: $Scalars[\"String\"]");
        assert_contains!(code, "createdAt: $Scalars[\"DateTime\"]");
        assert_contains!(code, "updatedAt?: $Nullable<$Scalars[\"DateTime\"]>");
        assert_contains!(code, "metadata?: $Nullable<$Scalars[\"JSON\"]>");
        assert_contains!(code, "website?: $Nullable<$Scalars[\"URL\"]>");

        assert_contains!(code, "export type CreateUser$vars = {");
        assert_contains!(code, "input: CreateUserInput");
    }

    #[test]
    fn test_custom_scalars_in_variables() {
        let schema = r#"
            scalar DateTime
            scalar JSON

            type Query {
                posts(publishedAfter: DateTime!, metadata: JSON): [Post!]!
            }

            type Post {
                id: ID!
                title: String!
            }
        "#;

        let operations = r#"
            query GetPosts($publishedAfter: DateTime!, $metadata: JSON) {
                posts(publishedAfter: $publishedAfter, metadata: $metadata) {
                    id
                    title
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type GetPosts$vars = {");
        assert_contains!(code, "publishedAfter: $Scalars[\"DateTime\"]");
        assert_contains!(code, "metadata?: $Nullable<$Scalars[\"JSON\"]>");

        assert!(
            !code.contains("publishedAfter: DateTime"),
            "Should not contain bare 'DateTime' type in variables"
        );
        assert!(
            !code.contains("metadata?: $Nullable<JSON>"),
            "Should not contain bare 'JSON' type in variables"
        );
    }

    #[test]
    fn test_nested_input_objects() {
        let schema = r#"
            input AddressInput {
                street: String!
                city: String!
                country: String
            }
            input CreateUserInput {
                name: String!
                email: String!
                address: AddressInput!
                secondaryAddress: AddressInput
            }
            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type AddressInput = {");
        assert_contains!(code, "street: $Scalars[\"String\"]");
        assert_contains!(code, "city: $Scalars[\"String\"]");
        assert_contains!(code, "country?: $Nullable<$Scalars[\"String\"]>");

        assert_contains!(code, "export type CreateUserInput = {");
        assert_contains!(code, "name: $Scalars[\"String\"]");
        assert_contains!(code, "email: $Scalars[\"String\"]");
        assert_contains!(code, "address: AddressInput");
        assert_contains!(code, "secondaryAddress?: $Nullable<AddressInput>");

        assert_contains!(code, "export type CreateUser$vars = {");
        assert_contains!(code, "input: CreateUserInput");
    }

    #[test]
    fn test_fragment_with_custom_scalars() {
        let schema = r#"
            scalar DateTime
            scalar JSON

            type User {
                id: ID!
                name: String!
                createdAt: DateTime!
                updatedAt: DateTime
                metadata: JSON
            }

            type Query {
                user(id: ID!): User
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
                createdAt
                updatedAt
                metadata
            }

            query GetUser($id: ID!) {
                user(id: $id) {
                    ...UserFields
                }
            }
        "#;

        let (ctx, schema_index, document_index) = setup_codegen!(schema, operations);
        let builder = Generator::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type UserFields$data");
        assert_contains!(code, "id: $Scalars[\"ID\"]");
        assert_contains!(code, "name: $Scalars[\"String\"]");
        assert_contains!(code, "createdAt: $Scalars[\"DateTime\"]");
        assert_contains!(code, "updatedAt?: $Nullable<$Scalars[\"DateTime\"]>");
        assert_contains!(code, "metadata?: $Nullable<$Scalars[\"JSON\"]>");
    }
}
