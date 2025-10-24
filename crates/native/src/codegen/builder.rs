use super::{
    CodegenContext,
    generators::{OperationsGenerator, RuntimeGenerator, SchemaTypesGenerator},
};
use crate::error::Result;
use crate::schema::{DocumentIndex, SchemaIndex};
use crate::source::SourceBuf;
use oxc_ast::ast::{Statement, TSType};
use oxc_codegen::Codegen;
use oxc_span::{SPAN, SourceType};

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
/// - [`SchemaTypesGenerator`] - Generates scalar types, input objects, and enums
/// - [`OperationsGenerator`] - Generates operation and fragment types
/// - [`RuntimeGenerator`] - Generates document nodes and module augmentation
///
/// # Example
///
/// ```
/// use mearie_native::codegen::{CodegenContext, Builder};
/// use mearie_native::schema::{SchemaBuilder, DocumentIndex};
/// use mearie_native::arena::Arena;
///
/// let arena = Arena::new();
/// let ctx = CodegenContext::new();
/// let schema = SchemaBuilder::new(&arena).build();
/// let document = DocumentIndex::new();
///
/// let builder = Builder::new(&ctx, &schema, &document);
/// let sources = builder.generate().unwrap();
/// ```
pub struct Builder<'a, 'b> {
    ctx: &'a CodegenContext,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> Builder<'a, 'b> {
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
    /// # use mearie_native::codegen::{CodegenContext, Builder};
    /// # use mearie_native::schema::{SchemaBuilder, DocumentIndex};
    /// # use mearie_native::arena::Arena;
    /// # let arena = Arena::new();
    /// # let ctx = CodegenContext::new();
    /// # let schema = SchemaBuilder::new(&arena).build();
    /// # let document = DocumentIndex::new();
    /// let builder = Builder::new(&ctx, &schema, &document);
    /// let sources = builder.generate().unwrap();
    ///
    /// assert_eq!(sources.len(), 3);
    /// assert_eq!(sources[0].file_path, "types.d.ts");
    /// assert_eq!(sources[1].file_path, "graphql.d.ts");
    /// assert_eq!(sources[2].file_path, "graphql.js");
    /// ```
    pub fn generate(&self) -> Result<Vec<SourceBuf>> {
        let ast = self.ctx.ast();
        let mut statements = ast.vec();

        let import_stmt = self.create_core_types_import(&ast);
        statements.push(import_stmt);

        let schema_generator = SchemaTypesGenerator::new(self.ctx, self.schema);
        let schema_stmts = schema_generator.generate();
        for stmt in schema_stmts {
            statements.push(stmt);
        }

        let operations_generator = OperationsGenerator::new(self.ctx, self.schema, self.document);
        let operation_stmts = operations_generator.generate()?;
        for stmt in operation_stmts {
            statements.push(stmt);
        }

        let program = self.create_program(&ast, statements);
        let code = self.print_program(&program);

        let enum_statements = schema_generator.generate_enums_for_module();

        let public_statements = self.generate_public_types_statements(&ast);

        let runtime_generator = RuntimeGenerator::new(self.ctx, self.schema, self.document);
        let module_augmentation = runtime_generator.generate_module_augmentation(enum_statements, public_statements)?;

        let documents_statements = runtime_generator.generate_document_nodes()?;
        let documents_code = self.generate_graphql_js(documents_statements);

        Ok(vec![
            SourceBuf {
                code,
                file_path: "types.d.ts".to_string(),
                start_line: 1,
            },
            SourceBuf {
                code: module_augmentation,
                file_path: "graphql.d.ts".to_string(),
                start_line: 1,
            },
            SourceBuf {
                code: documents_code,
                file_path: "graphql.js".to_string(),
                start_line: 1,
            },
        ])
    }

    fn create_program<'c>(
        &self,
        ast: &oxc_ast::AstBuilder<'c>,
        statements: oxc_allocator::Vec<'c, Statement<'c>>,
    ) -> oxc_ast::ast::Program<'c> {
        ast.program(SPAN, SourceType::default(), "", ast.vec(), None, ast.vec(), statements)
    }

    fn print_program(&self, program: &oxc_ast::ast::Program) -> String {
        Codegen::new().build(program).code
    }

    fn generate_graphql_js(&self, statements: Vec<Statement<'b>>) -> String {
        let ast = self.ctx.ast();

        // Add graphql function at the end
        let mut all_statements = ast.vec_from_iter(statements);

        // export const graphql = (document) => documentMap[document];
        let graphql_function = self.create_graphql_function(&ast);
        all_statements.push(graphql_function);

        let program = self.create_program(&ast, all_statements);
        self.print_program(&program)
    }

    fn generate_public_types_statements<'c>(
        &self,
        ast: &oxc_ast::AstBuilder<'c>,
    ) -> oxc_allocator::Vec<'c, Statement<'c>> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{Declaration, ImportOrExportKind, TSTypeParameterDeclaration, WithClause};
        use oxc_span::SPAN;

        let mut statements = ast.vec();

        for fragment in self.document.fragments() {
            let fragment_name = fragment.name;
            let type_name_str = format!("{}$key", fragment_name);
            let type_name = ast.allocator.alloc_str(&type_name_str);

            // Create import type: import("./types.d.ts").UserProfile$key
            let import_type = self.create_import_type_for_key(ast, &type_name_str);

            // Create type alias: export type UserProfile$key = import("./types.d.ts").UserProfile$key
            let ts_type_alias = ast.ts_type_alias_declaration(
                SPAN,
                ast.binding_identifier(SPAN, type_name),
                None::<OxcBox<TSTypeParameterDeclaration>>,
                import_type,
                false,
            );

            let export_decl = ast.export_named_declaration(
                SPAN,
                Some(Declaration::TSTypeAliasDeclaration(ast.alloc(ts_type_alias))),
                ast.vec(),
                None,
                ImportOrExportKind::Type,
                None::<OxcBox<WithClause>>,
            );

            statements.push(Statement::ExportNamedDeclaration(ast.alloc(export_decl)));
        }

        statements
    }

    fn create_import_type_for_key<'c>(&self, ast: &oxc_ast::AstBuilder<'c>, type_name: &str) -> TSType<'c> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{ObjectExpression, TSTypeParameterInstantiation};
        use oxc_span::Atom;

        let type_name_str = ast.allocator.alloc_str(type_name);
        let qualifier = ast.ts_import_type_qualifier_identifier(SPAN, type_name_str);

        ast.ts_type_import_type(
            SPAN,
            ast.ts_type_literal_type(SPAN, ast.ts_literal_string_literal(SPAN, "./types.d.ts", None::<Atom>)),
            None::<OxcBox<ObjectExpression>>,
            Some(qualifier),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn create_graphql_function<'c>(&self, ast: &oxc_ast::AstBuilder<'c>) -> Statement<'c> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{
            BindingRestElement, Declaration, Expression, FormalParameterKind, FunctionBody, ImportOrExportKind,
            Statement as StmtInner, VariableDeclarationKind, WithClause,
        };
        use oxc_span::Atom;

        // Parameter: document
        use oxc_ast::ast::TSTypeAnnotation;
        let param_pattern = ast.binding_pattern(
            ast.binding_pattern_kind_binding_identifier(SPAN, Atom::from("document")),
            None::<OxcBox<TSTypeAnnotation>>,
            false,
        );
        let param = ast.formal_parameter(SPAN, ast.vec(), param_pattern, None, false, false);
        let mut params_vec = ast.vec();
        params_vec.push(param);
        let formal_params = ast.formal_parameters(
            SPAN,
            FormalParameterKind::ArrowFormalParameters,
            params_vec,
            None::<OxcBox<BindingRestElement>>,
        );

        // Body: documentMap[document]
        let document_map_expr = Expression::Identifier(ast.alloc(ast.identifier_reference(SPAN, "documentMap")));
        let document_expr = Expression::Identifier(ast.alloc(ast.identifier_reference(SPAN, "document")));
        let member_expr = ast.member_expression_computed(SPAN, document_map_expr, document_expr, false);

        // For expression body arrow function
        let expression_body = member_expr.into();
        let function_body = FunctionBody {
            span: SPAN,
            directives: ast.vec(),
            statements: ast.vec_from_iter(vec![StmtInner::ExpressionStatement(
                ast.alloc(ast.expression_statement(SPAN, expression_body)),
            )]),
        };

        // Arrow function
        use oxc_ast::ast::TSTypeParameterDeclaration;
        let arrow_function = ast.arrow_function_expression(
            SPAN,
            true,                                       // expression
            false,                                      // async
            None::<OxcBox<TSTypeParameterDeclaration>>, // type_parameters
            ast.alloc(formal_params),
            None::<OxcBox<TSTypeAnnotation>>, // return_type
            ast.alloc(function_body),
        );

        // const graphql = ...
        let var_declarator = ast.variable_declarator(
            SPAN,
            VariableDeclarationKind::Const,
            ast.binding_pattern(
                ast.binding_pattern_kind_binding_identifier(SPAN, Atom::from("graphql")),
                None::<OxcBox<TSTypeAnnotation>>,
                false,
            ),
            Some(Expression::ArrowFunctionExpression(ast.alloc(arrow_function))),
            false,
        );

        let mut declarations = ast.vec();
        declarations.push(var_declarator);
        let var_decl = ast.variable_declaration(SPAN, VariableDeclarationKind::Const, declarations, false);

        // export const graphql = ...
        let export_decl = ast.export_named_declaration(
            SPAN,
            Some(Declaration::VariableDeclaration(ast.alloc(var_decl))),
            ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Statement::ExportNamedDeclaration(ast.alloc(export_decl))
    }

    fn create_core_types_import<'c>(&self, ast: &oxc_ast::AstBuilder<'c>) -> Statement<'c> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{ImportOrExportKind, Statement, WithClause};
        use oxc_span::{Atom, SPAN};

        let mut specifiers = ast.vec();

        let type_names = ["Artifact", "Nullable", "List", "FragmentRefs"];
        for type_name in type_names {
            let local = ast.binding_identifier(SPAN, Atom::from(type_name));
            let imported = ast.module_export_name_identifier_name(SPAN, type_name);
            let specifier =
                ast.import_declaration_specifier_import_specifier(SPAN, imported, local, ImportOrExportKind::Value);
            specifiers.push(specifier);
        }

        let import_decl = ast.import_declaration(
            SPAN,
            Some(specifiers),
            ast.string_literal(SPAN, "mearie/types", None::<Atom>),
            None,
            None::<OxcBox<WithClause>>,
            ImportOrExportKind::Type,
        );

        Statement::ImportDeclaration(ast.alloc(import_decl))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arena::Arena;
    use crate::graphql::parser::Parser;
    use crate::schema::{DocumentIndex, SchemaBuilder};
    use crate::source::Source;
    use assertables::*;

    #[test]
    fn test_operation_builder_new() {
        let arena = Arena::new();
        let ctx = CodegenContext::new();
        let schema = SchemaBuilder::new(&arena).build();
        let document = DocumentIndex::new();
        let _builder = Builder::new(&ctx, &schema, &document);
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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();
        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();
        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type GetUser$vars = {");
        assert_contains!(code, "id: Scalars[\"ID\"]");

        assert_contains!(code, "export type GetUser$data = {");
        assert_contains!(code, "user?: Nullable<{");
        assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "id: Scalars[\"ID\"]");

        assert_contains!(code, "export type GetAllUsers$data = {");
        assert_contains!(code, "users: List<{");

        assert_contains!(code, "export type CreateUser$vars = {");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");

        assert_contains!(code, "export type CreateUser$data = {");
        assert_contains!(code, "createUser: {");
        assert_contains!(code, "id: Scalars[\"ID\"]");
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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type CreateUserInput = {");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");
        assert_contains!(code, "age?: Nullable<Scalars[\"Int\"]>");

        assert_contains!(code, "export type CreateUser$vars = {");
        assert_contains!(code, "input: CreateUserInput");

        assert_contains!(code, "export type CreateUser$data = {");
        assert_contains!(code, "createUser: {");
        assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");
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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type CreateUserInput = {");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "email: Scalars[\"String\"]");
        assert_contains!(code, "createdAt: Scalars[\"DateTime\"]");
        assert_contains!(code, "updatedAt?: Nullable<Scalars[\"DateTime\"]>");
        assert_contains!(code, "metadata?: Nullable<Scalars[\"JSON\"]>");
        assert_contains!(code, "website?: Nullable<Scalars[\"URL\"]>");

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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type GetPosts$vars = {");
        assert_contains!(code, "publishedAfter: Scalars[\"DateTime\"]");
        assert_contains!(code, "metadata?: Nullable<Scalars[\"JSON\"]>");

        assert!(
            !code.contains("publishedAfter: DateTime"),
            "Should not contain bare 'DateTime' type in variables"
        );
        assert!(
            !code.contains("metadata?: Nullable<JSON>"),
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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type AddressInput = {");
        assert_contains!(code, "street: Scalars[\"String\"]");
        assert_contains!(code, "city: Scalars[\"String\"]");
        assert_contains!(code, "country?: Nullable<Scalars[\"String\"]>");

        assert_contains!(code, "export type CreateUserInput = {");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "email: Scalars[\"String\"]");
        assert_contains!(code, "address: AddressInput");
        assert_contains!(code, "secondaryAddress?: Nullable<AddressInput>");

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

        let arena = Arena::new();
        let schema_source = Source::ephemeral(schema);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();
        let operations_source = Source::ephemeral(operations);
        let operations_document = Parser::new(&arena).with_source(&operations_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();

        document_index.add_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &schema_index, &document_index);

        let result = builder.generate();
        assert_ok!(&result);
        let files = result.unwrap();
        let code = &files[0].code;

        assert_contains!(code, "export type UserFields$data");
        assert_contains!(code, "id: Scalars[\"ID\"]");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "createdAt: Scalars[\"DateTime\"]");
        assert_contains!(code, "updatedAt?: Nullable<Scalars[\"DateTime\"]>");
        assert_contains!(code, "metadata?: Nullable<Scalars[\"JSON\"]>");
    }
}
