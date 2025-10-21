use super::super::constants::{MUTATION_ROOT, QUERY_ROOT, SUBSCRIPTION_ROOT};
use super::super::{CodegenContext, Result, type_builder};
use super::{OperationVariablesGenerator, SelectionSetGenerator};
use crate::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::Statement;

pub struct OperationGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    variables_generator: &'a OperationVariablesGenerator<'a, 'b>,
    selection_set_generator: &'a SelectionSetGenerator<'a, 'b>,
}

impl<'a, 'b> OperationGenerator<'a, 'b> {
    pub fn new(
        ctx: &'b CodegenContext,
        variables_generator: &'a OperationVariablesGenerator<'a, 'b>,
        selection_set_generator: &'a SelectionSetGenerator<'a, 'b>,
    ) -> Self {
        Self {
            ast: ctx.ast(),
            variables_generator,
            selection_set_generator,
        }
    }

    pub fn generate_operation(&self, operation: &OperationDefinition<'b>) -> Result<Vec<Statement<'b>>> {
        let mut statements = Vec::new();

        let operation_name_temp = match operation.name {
            Some(name) => name.as_str(),
            None => "Anonymous",
        };
        let operation_name = self.ast.allocator.alloc_str(operation_name_temp);

        let kind_str = match operation.operation_type {
            OperationType::Query => "query",
            OperationType::Mutation => "mutation",
            OperationType::Subscription => "subscription",
        };

        // $data type
        let data_type_name = format!("{}$data", operation_name);
        let root_type = self.get_root_type(operation.operation_type);
        let data_type = self
            .selection_set_generator
            .generate_selection_set(&operation.selection_set, root_type)?;
        let data_stmt = type_builder::export_type_alias(&self.ast, &data_type_name, data_type);
        statements.push(data_stmt);

        // $vars type (if needed)
        if !operation.variable_definitions.is_empty() {
            let vars_type_name = format!("{}$vars", operation_name);
            let vars_type = self
                .variables_generator
                .generate_variables(&operation.variable_definitions);
            let vars_stmt = type_builder::export_type_alias(&self.ast, &vars_type_name, vars_type);
            statements.push(vars_stmt);
        }

        // artifact type (without $doc suffix)
        let data_type_name_str = self.ast.allocator.alloc_str(&data_type_name);
        let data_type_ref = type_builder::create_type_reference(&self.ast, data_type_name_str);
        let artifact_type = self.create_document_node_type(kind_str, operation_name, data_type_ref, operation);
        let artifact_stmt = type_builder::export_type_alias(&self.ast, operation_name, artifact_type);
        statements.push(artifact_stmt);

        Ok(statements)
    }

    fn get_root_type(&self, operation_type: OperationType) -> &'b str {
        match operation_type {
            OperationType::Query => QUERY_ROOT,
            OperationType::Mutation => MUTATION_ROOT,
            OperationType::Subscription => SUBSCRIPTION_ROOT,
        }
    }

    fn create_document_node_type(
        &self,
        kind: &'b str,
        name: &'b str,
        data_type: oxc_ast::ast::TSType<'b>,
        operation: &OperationDefinition<'b>,
    ) -> oxc_ast::ast::TSType<'b> {
        use oxc_span::Atom;

        let mut type_params = self.ast.vec();

        // 1. kind type literal
        let kind_literal = self.ast.ts_literal_string_literal(oxc_span::SPAN, kind, None::<Atom>);
        let kind_type = self.ast.ts_type_literal_type(oxc_span::SPAN, kind_literal);
        type_params.push(kind_type);

        // 2. name type literal
        let name_literal = self.ast.ts_literal_string_literal(oxc_span::SPAN, name, None::<Atom>);
        let name_type = self.ast.ts_type_literal_type(oxc_span::SPAN, name_literal);
        type_params.push(name_type);

        // 3. Data type reference
        type_params.push(data_type);

        // 4. Variables type (if exists) or never
        if !operation.variable_definitions.is_empty() {
            let operation_name = operation.name.unwrap().as_str();
            let vars_type_name = self.ast.allocator.alloc_str(&format!("{}$vars", operation_name));
            let vars_type = type_builder::create_type_reference(&self.ast, vars_type_name);
            type_params.push(vars_type);
        } else {
            let never_type = self.ast.ts_type_never_keyword(oxc_span::SPAN);
            type_params.push(never_type);
        }

        self.ast.ts_type_type_reference(
            oxc_span::SPAN,
            self.ast.ts_type_name_identifier_reference(oxc_span::SPAN, "Artifact"),
            Some(self.ast.ts_type_parameter_instantiation(oxc_span::SPAN, type_params)),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::Document;
    use crate::codegen::{CodegenContext as TypeScriptContext, Registry};
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::span::Source;
    use assertables::*;
    use oxc_ast::ast::Statement;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_operation_generator_new() {
        let registry = Registry::new();
        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let _generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);
    }

    #[test]
    fn test_generate_query_operation() {
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

        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_operation(op);
            assert_ok!(&result);
            let statements = result.unwrap();
            assert_eq!(statements.len(), 3);
            assert_matches!(statements[0], Statement::ExportNamedDeclaration(_));
            assert_matches!(statements[1], Statement::ExportNamedDeclaration(_));
            assert_matches!(statements[2], Statement::ExportNamedDeclaration(_));
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_mutation_operation() {
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

        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_operation(op);
            assert_ok!(&result);
            let statements = result.unwrap();
            assert_eq!(statements.len(), 3);
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_operation_without_variables() {
        let schema = r#"
            type Query {
                me: User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetMe {
                me {
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

        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_operation(op);
            assert_ok!(&result);
            let statements = result.unwrap();
            assert_eq!(statements.len(), 2);
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_subscription_operation() {
        let schema = r#"
            type Subscription {
                userUpdated(id: ID!): User!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            subscription OnUserUpdated($id: ID!) {
                userUpdated(id: $id) {
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

        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_operation(op);
            assert_ok!(&result);
            let statements = result.unwrap();
            assert_eq!(statements.len(), 3);
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_query_operation_output_code() {
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
            query GetUser($id: ID!) {
                user(id: $id) {
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

        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_operation(op);
            assert_ok!(&result);
            let statements = result.unwrap();

            let ast = ctx.ast();
            let program = ast.program(
                oxc_span::SPAN,
                oxc_span::SourceType::default(),
                "",
                ast.vec(),
                None,
                ast.vec(),
                ast.vec_from_iter(statements),
            );
            let code = oxc_codegen::Codegen::new().build(&program).code;

            assert_contains!(code, "export type GetUser$vars");
            assert_contains!(code, "id: Scalars[\"ID\"]");
            assert_contains!(code, "export type GetUser$data");
            assert_contains!(code, "user?: Nullable<{");
            assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");
            assert_contains!(code, "name: Scalars[\"String\"]");
            assert_contains!(code, "id: Scalars[\"ID\"]");
            assert_contains!(code, "export type GetUser");
            assert_contains!(code, "Artifact<\"query\", \"GetUser\", GetUser$data, GetUser$vars>");
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_mutation_operation_output_code() {
        let schema = r#"
            type Mutation {
                createUser(name: String!, email: String): User!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            mutation CreateUser($name: String!, $email: String) {
                createUser(name: $name, email: $email) {
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

        let ctx = TypeScriptContext::new();
        let variables_generator = OperationVariablesGenerator::new(&ctx, &registry);
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = OperationGenerator::new(&ctx, &variables_generator, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_operation(op);
            assert_ok!(&result);
            let statements = result.unwrap();

            let ast = ctx.ast();
            let program = ast.program(
                oxc_span::SPAN,
                oxc_span::SourceType::default(),
                "",
                ast.vec(),
                None,
                ast.vec(),
                ast.vec_from_iter(statements),
            );
            let code = oxc_codegen::Codegen::new().build(&program).code;

            assert_contains!(code, "export type CreateUser$vars");
            assert_contains!(code, "name: Scalars[\"String\"]");
            assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");
            assert_contains!(code, "export type CreateUser$data");
            assert_contains!(code, "createUser: {");
            assert_contains!(code, "export type CreateUser");
            assert_contains!(
                code,
                "Artifact<\"mutation\", \"CreateUser\", CreateUser$data, CreateUser$vars>"
            );
        } else {
            panic!("Expected operation definition");
        }
    }
}
