use super::super::{CodegenContext, Registry, Result};
use crate::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_codegen::Codegen;
use oxc_span::{Atom, SPAN, SourceType};

pub struct ModuleAugmentationGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    registry: &'a Registry<'b>,
}

impl<'a, 'b> ModuleAugmentationGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, registry: &'a Registry<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            registry,
        }
    }

    pub fn generate(&self) -> Result<String> {
        self.generate_with_additional(self.ast.vec(), self.ast.vec())
    }

    pub fn generate_with_additional(
        &self,
        enum_statements: oxc_allocator::Vec<'b, Statement<'b>>,
        public_statements: oxc_allocator::Vec<'b, Statement<'b>>,
    ) -> Result<String> {
        // First, create type aliases for all operations and fragments (outside module)
        let mut outside_statements = self.ast.vec();

        for operation in self.registry.operations() {
            if let Some(stmt) = self.create_type_alias(operation) {
                outside_statements.push(stmt);
            }
        }

        for fragment in self.registry.fragments() {
            if let Some(stmt) = self.create_type_alias_for_fragment(fragment) {
                outside_statements.push(stmt);
            }
        }

        // Now create module body statements
        let mut module_statements = self.ast.vec();

        // Add enum types inside module
        for enum_stmt in enum_statements {
            module_statements.push(enum_stmt);
        }

        // Add public types (fragment $key exports) inside module
        for public_stmt in public_statements {
            module_statements.push(public_stmt);
        }

        // Add function overloads inside module
        for operation in self.registry.operations() {
            if let Some(stmt) = self.create_function_overload(operation) {
                module_statements.push(stmt);
            }
        }

        for fragment in self.registry.fragments() {
            if let Some(stmt) = self.create_function_overload_for_fragment(fragment) {
                module_statements.push(stmt);
            }
        }

        let module_body = self
            .ast
            .ts_module_declaration_body_module_block(SPAN, self.ast.vec(), module_statements);

        let module_name = self
            .ast
            .ts_module_declaration_name_string_literal(SPAN, "~graphql", None::<Atom>);

        let module_decl = self.ast.ts_module_declaration(
            SPAN,
            module_name,
            Some(module_body),
            TSModuleDeclarationKind::Module,
            true,
        );

        let declare_stmt = Statement::from(Declaration::TSModuleDeclaration(self.ast.alloc(module_decl)));

        // Combine outside statements and module declaration
        let mut all_statements = self.ast.vec();
        for stmt in outside_statements {
            all_statements.push(stmt);
        }
        all_statements.push(declare_stmt);

        let program = self.ast.program(
            SPAN,
            SourceType::default(),
            "",
            self.ast.vec(),
            None,
            self.ast.vec(),
            all_statements,
        );

        Ok(Codegen::new().build(&program).code)
    }

    fn create_type_alias(&self, operation: &OperationDefinition<'b>) -> Option<Statement<'b>> {
        let operation_name = operation.name.as_ref()?.as_str();
        let operation_name_str = self.ast.allocator.alloc_str(operation_name);

        // Create the import type
        let import_type = self.create_import_type(operation_name);

        // Create type alias: type GetUser = import("./types.d.ts").GetUser
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::TSTypeParameterDeclaration;

        let ts_type_alias = self.ast.ts_type_alias_declaration(
            SPAN,
            self.ast.binding_identifier(SPAN, operation_name_str),
            None::<OxcBox<TSTypeParameterDeclaration>>,
            import_type,
            false,
        );

        Some(Statement::from(Declaration::TSTypeAliasDeclaration(
            self.ast.alloc(ts_type_alias),
        )))
    }

    fn create_type_alias_for_fragment(&self, fragment: &FragmentDefinition<'b>) -> Option<Statement<'b>> {
        let fragment_name = fragment.name.as_str();
        let fragment_name_str = self.ast.allocator.alloc_str(fragment_name);

        // Create the import type
        let import_type = self.create_import_type(fragment_name);

        // Create type alias: type UserProfile = import("./types.d.ts").UserProfile
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::TSTypeParameterDeclaration;

        let ts_type_alias = self.ast.ts_type_alias_declaration(
            SPAN,
            self.ast.binding_identifier(SPAN, fragment_name_str),
            None::<OxcBox<TSTypeParameterDeclaration>>,
            import_type,
            false,
        );

        Some(Statement::from(Declaration::TSTypeAliasDeclaration(
            self.ast.alloc(ts_type_alias),
        )))
    }

    fn create_function_overload(&self, operation: &OperationDefinition<'b>) -> Option<Statement<'b>> {
        let operation_name = operation.name.as_ref()?.as_str();
        let source = self.get_operation_source(operation)?;

        let return_type = self.create_simple_return_type(operation_name);
        let return_type_annotation = self.ast.ts_type_annotation(SPAN, return_type);

        let string_literal_type = self
            .ast
            .ts_type_literal_type(SPAN, self.ast.ts_literal_string_literal(SPAN, source, None::<Atom>));

        let type_annotation = self.ast.ts_type_annotation(SPAN, string_literal_type);

        let param_pattern = self.ast.binding_pattern(
            self.ast
                .binding_pattern_kind_binding_identifier(SPAN, Atom::from("document")),
            Some(type_annotation),
            false,
        );

        let param = self
            .ast
            .formal_parameter(SPAN, self.ast.vec(), param_pattern, None, false, false);

        let mut params = self.ast.vec();
        params.push(param);

        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{BindingRestElement, WithClause};

        let formal_params = self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::Signature,
            params,
            None::<OxcBox<BindingRestElement>>,
        );

        let function_id = self.ast.binding_identifier(SPAN, Atom::from("graphql"));

        let function = Function {
            span: SPAN,
            r#type: FunctionType::FunctionDeclaration,
            id: Some(function_id),
            generator: false,
            r#async: false,
            declare: false,
            type_parameters: None,
            this_param: None,
            params: self.ast.alloc(formal_params),
            return_type: Some(self.ast.alloc(return_type_annotation)),
            body: None,
            scope_id: std::cell::Cell::new(None),
            pife: false,
            pure: false,
        };

        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::FunctionDeclaration(self.ast.alloc(function))),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Some(Statement::ExportNamedDeclaration(self.ast.alloc(export_decl)))
    }

    fn create_function_overload_for_fragment(&self, fragment: &FragmentDefinition<'b>) -> Option<Statement<'b>> {
        let fragment_name = fragment.name.as_str();
        let source = self.get_fragment_source(fragment)?;

        let return_type = self.create_simple_fragment_return_type(fragment_name);
        let return_type_annotation = self.ast.ts_type_annotation(SPAN, return_type);

        let string_literal_type = self
            .ast
            .ts_type_literal_type(SPAN, self.ast.ts_literal_string_literal(SPAN, source, None::<Atom>));

        let type_annotation = self.ast.ts_type_annotation(SPAN, string_literal_type);

        let param_pattern = self.ast.binding_pattern(
            self.ast
                .binding_pattern_kind_binding_identifier(SPAN, Atom::from("document")),
            Some(type_annotation),
            false,
        );

        let param = self
            .ast
            .formal_parameter(SPAN, self.ast.vec(), param_pattern, None, false, false);

        let mut params = self.ast.vec();
        params.push(param);

        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{BindingRestElement, WithClause};

        let formal_params = self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::Signature,
            params,
            None::<OxcBox<BindingRestElement>>,
        );

        let function_id = self.ast.binding_identifier(SPAN, Atom::from("graphql"));

        let function = Function {
            span: SPAN,
            r#type: FunctionType::FunctionDeclaration,
            id: Some(function_id),
            generator: false,
            r#async: false,
            declare: false,
            type_parameters: None,
            this_param: None,
            params: self.ast.alloc(formal_params),
            return_type: Some(self.ast.alloc(return_type_annotation)),
            body: None,
            scope_id: std::cell::Cell::new(None),
            pife: false,
            pure: false,
        };

        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::FunctionDeclaration(self.ast.alloc(function))),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Some(Statement::ExportNamedDeclaration(self.ast.alloc(export_decl)))
    }

    fn get_operation_source(&self, operation: &OperationDefinition<'b>) -> Option<&'b str> {
        for doc in self.registry.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Operation(op)) = definition
                    && std::ptr::eq(op as *const _, operation as *const _)
                {
                    return Some(doc.source.code);
                }
            }
        }
        None
    }

    fn get_fragment_source(&self, fragment: &FragmentDefinition<'b>) -> Option<&'b str> {
        for doc in self.registry.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = definition
                    && std::ptr::eq(frag as *const _, fragment as *const _)
                {
                    return Some(doc.source.code);
                }
            }
        }
        None
    }

    fn create_import_type(&self, type_name: &str) -> TSType<'b> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::{ObjectExpression, TSTypeParameterInstantiation};

        let type_name_str = self.ast.allocator.alloc_str(type_name);
        let qualifier = self.ast.ts_import_type_qualifier_identifier(SPAN, type_name_str);

        self.ast.ts_type_import_type(
            SPAN,
            self.ast.ts_type_literal_type(
                SPAN,
                self.ast.ts_literal_string_literal(SPAN, "./types.d.ts", None::<Atom>),
            ),
            None::<OxcBox<ObjectExpression>>,
            Some(qualifier),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn create_simple_return_type(&self, operation_name: &str) -> TSType<'b> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::TSTypeParameterInstantiation;

        let operation_name_str = self.ast.allocator.alloc_str(operation_name);

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, operation_name_str),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn create_simple_fragment_return_type(&self, fragment_name: &str) -> TSType<'b> {
        use oxc_allocator::Box as OxcBox;
        use oxc_ast::ast::TSTypeParameterInstantiation;

        let fragment_name_str = self.ast.allocator.alloc_str(fragment_name);

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, fragment_name_str),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::Document;
    use crate::codegen::{CodegenContext, Registry};
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::span::Source;
    use assertables::*;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_module_augmentation_generator_new() {
        let ctx = CodegenContext::new();
        let registry = Registry::new();
        let _generator = ModuleAugmentationGenerator::new(&ctx, &registry);
    }

    #[test]
    fn test_generate_module_augmentation() {
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
        let generator = ModuleAugmentationGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let code = result.unwrap();

        assert_contains!(code, "declare module \"~graphql\"");
        assert_contains!(code, "export function graphql");
        assert_contains!(code, "type GetUser");
        assert_contains!(code, "import(\"./types.d.ts\").GetUser");
    }

    #[test]
    fn test_generate_with_multiple_operations() {
        let schema = r#"
            type Query {
                user(id: ID!): User
                users: [User!]!
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

            query GetAllUsers {
                users {
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
        let generator = ModuleAugmentationGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let code = result.unwrap();

        assert_contains!(code, "declare module \"~graphql\"");
        assert_contains!(code, "type GetUser");
        assert_contains!(code, "type GetAllUsers");
        assert_contains!(code, "import(\"./types.d.ts\").GetUser");
        assert_contains!(code, "import(\"./types.d.ts\").GetAllUsers");
    }

    #[test]
    fn test_generate_with_fragments() {
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
        let generator = ModuleAugmentationGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let code = result.unwrap();

        assert_contains!(code, "declare module \"~graphql\"");
        assert_contains!(code, "type GetUser");
        assert_contains!(code, "type UserFields");
        assert_contains!(code, "import(\"./types.d.ts\").GetUser");
        assert_contains!(code, "import(\"./types.d.ts\").UserFields");
    }
}
