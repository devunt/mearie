use super::{
    CodegenContext, DocumentNodeGenerator, EnumGenerator, FragmentGenerator, InputObjectGenerator,
    ModuleAugmentationGenerator, OperationGenerator, OperationVariablesGenerator, Registry, Result, ScalarsGenerator,
    SelectionSetGenerator,
};
use crate::span::SourceOwned;
use oxc_ast::ast::{Statement, TSType};
use oxc_codegen::Codegen;
use oxc_span::{SPAN, SourceType};

pub struct Builder<'a, 'b> {
    ctx: &'a CodegenContext,
    registry: &'a Registry<'b>,
}

impl<'a, 'b> Builder<'a, 'b> {
    pub fn new(ctx: &'a CodegenContext, registry: &'a Registry<'b>) -> Self {
        Self { ctx, registry }
    }

    pub fn generate(&self) -> Result<Vec<SourceOwned>> {
        let ast = self.ctx.ast();
        let mut statements = ast.vec();

        let import_stmt = self.create_core_types_import(&ast);
        statements.push(import_stmt);

        let scalars_generator = ScalarsGenerator::new(self.ctx, self.registry);
        let scalars_stmt = scalars_generator.generate();
        statements.push(scalars_stmt);

        for schema_document in self.registry.schemas() {
            let input_object_generator = InputObjectGenerator::new(self.ctx, self.registry, schema_document);
            let input_object_stmts = input_object_generator.generate();
            for stmt in input_object_stmts {
                statements.push(stmt);
            }
        }

        let variables_generator = OperationVariablesGenerator::new(self.ctx, self.registry);
        let selection_set_generator = SelectionSetGenerator::new(self.registry, self.ctx);
        let fragment_generator = FragmentGenerator::new(self.ctx, &selection_set_generator);
        let operation_generator = OperationGenerator::new(self.ctx, &variables_generator, &selection_set_generator);

        for fragment in self.registry.fragments() {
            let stmts = fragment_generator.generate_fragment(fragment)?;
            for stmt in stmts {
                statements.push(stmt);
            }
        }

        for operation in self.registry.operations() {
            let op_stmts = operation_generator.generate_operation(operation)?;
            for stmt in op_stmts {
                statements.push(stmt);
            }
        }

        let program = self.create_program(&ast, statements);
        let code = self.print_program(&program);

        // Generate enums
        let mut enum_statements = ast.vec();
        for schema_document in self.registry.schemas() {
            let enum_generator = EnumGenerator::new(self.ctx, schema_document);
            let enum_stmts = enum_generator.generate();
            for stmt in enum_stmts {
                enum_statements.push(stmt);
            }
        }

        // Generate public types (fragment $key exports)
        let public_statements = self.generate_public_types_statements(&ast);

        let augmentation_generator = ModuleAugmentationGenerator::new(self.ctx, self.registry);
        let module_augmentation = augmentation_generator.generate_with_additional(enum_statements, public_statements)?;

        let document_node_generator = DocumentNodeGenerator::new(self.ctx, self.registry);
        let documents_statements = document_node_generator.generate()?;
        let documents_code = self.generate_graphql_js(documents_statements);

        Ok(vec![
            SourceOwned {
                code,
                file_path: "types.d.ts".to_string(),
                start_line: 1,
            },
            SourceOwned {
                code: module_augmentation,
                file_path: "graphql.d.ts".to_string(),
                start_line: 1,
            },
            SourceOwned {
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

    fn generate_public_types_statements<'c>(&self, ast: &oxc_ast::AstBuilder<'c>) -> oxc_allocator::Vec<'c, Statement<'c>> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{Declaration, ImportOrExportKind, TSTypeParameterDeclaration, WithClause};
        use oxc_span::SPAN;

        let mut statements = ast.vec();

        for fragment in self.registry.fragments() {
            let fragment_name = fragment.name.as_str();
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
        use oxc_ast::ast::{ObjectExpression, TSType, TSTypeParameterInstantiation};
        use oxc_span::Atom;

        let type_name_str = ast.allocator.alloc_str(type_name);
        let qualifier = ast.ts_import_type_qualifier_identifier(SPAN, type_name_str);

        ast.ts_type_import_type(
            SPAN,
            ast.ts_type_literal_type(
                SPAN,
                ast.ts_literal_string_literal(SPAN, "./types.d.ts", None::<Atom>),
            ),
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
                ast.alloc(ast.expression_statement(SPAN, expression_body))
            )]),
        };

        // Arrow function
        use oxc_ast::ast::TSTypeParameterDeclaration;
        let arrow_function = ast.arrow_function_expression(
            SPAN,
            true, // expression
            false, // async
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
    use crate::parser::ParseNode;
    use crate::{ast::Document, parser::GraphQLContext, span::Source};
    use assertables::*;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_operation_builder_new() {
        let ctx = CodegenContext::new();
        let registry = Registry::new();
        let _builder = Builder::new(&ctx, &registry);
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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let builder = Builder::new(&ctx, &registry);

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
