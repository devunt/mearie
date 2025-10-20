use super::super::{CodegenContext, Registry, type_builder};
use crate::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::TSType;
use oxc_span::SPAN;

pub struct OperationVariablesGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    registry: &'a Registry<'b>,
}

impl<'a, 'b> OperationVariablesGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, registry: &'a Registry<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            registry,
        }
    }

    pub fn generate_variables(&self, variables: &[VariableDefinition<'b>]) -> TSType<'b> {
        if variables.is_empty() {
            return self.generate_empty_object();
        }

        let mut signatures = self.ast.vec();

        for var_def in variables {
            let signature = self.generate_variable_signature(var_def);
            signatures.push(signature);
        }

        self.ast.ts_type_type_literal(SPAN, signatures)
    }

    fn generate_empty_object(&self) -> TSType<'b> {
        self.ast.ts_type_type_literal(SPAN, self.ast.vec())
    }

    fn generate_variable_signature(&self, var_def: &VariableDefinition<'b>) -> oxc_ast::ast::TSSignature<'b> {
        let var_name = var_def.variable.as_str();
        let has_default_value = var_def.default_value.is_some();
        let is_non_null = matches!(&var_def.typ, Type::NonNull(_));

        let is_optional = !is_non_null || has_default_value;

        let ts_type = self.map_type_for_variable(&var_def.typ);

        let key = self.ast.property_key_static_identifier(SPAN, var_name);
        let type_annotation = self.ast.ts_type_annotation(SPAN, ts_type);

        self.ast
            .ts_signature_property_signature(SPAN, false, is_optional, false, key, Some(type_annotation))
    }

    fn map_type_for_variable(&self, graphql_type: &Type<'b>) -> TSType<'b> {
        match graphql_type {
            Type::Named(named) => {
                let inner = self.map_named_type_for_variable(named);
                type_builder::wrap_nullable(&self.ast, inner)
            }
            Type::List(inner_type) => {
                let inner = self.map_type_for_variable(inner_type);
                let list = type_builder::wrap_list(&self.ast, inner);
                type_builder::wrap_nullable(&self.ast, list)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => self.map_named_type_for_variable(named),
                NonNullType::List(inner_type) => {
                    let inner = self.map_type_for_variable(inner_type);
                    type_builder::wrap_list(&self.ast, inner)
                }
            },
        }
    }

    fn map_named_type_for_variable(&self, named_type: &NamedType<'b>) -> TSType<'b> {
        if self.registry.is_scalar(named_type.name) {
            type_builder::create_scalar_reference(&self.ast, named_type.name)
        } else {
            type_builder::create_type_reference(&self.ast, named_type.name)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codegen::{CodegenContext as TypeScriptContext, Registry};
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::span::Source;
    use assertables::*;
    use oxc_ast::ast::TSType;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_operation_variables_generator_new() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let ctx = TypeScriptContext::new();
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let _generator = OperationVariablesGenerator::new(&ctx, &registry);
    }

    #[test]
    fn test_generate_empty_variables() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
            }
        "#;

        let operations = r#"
            query GetUser {
                user(id: "123") {
                    id
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let generator = OperationVariablesGenerator::new(ctx, &registry);

        let result = generator.generate_variables(&[]);
        assert_matches!(result, TSType::TSTypeLiteral(_));
    }

    #[test]
    fn test_generate_single_variable() {
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

        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let generator = OperationVariablesGenerator::new(ctx, &registry);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_variables(&op.variable_definitions);
            assert_matches!(result, TSType::TSTypeLiteral(_));
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_multiple_variables() {
        let schema = r#"
            type Query {
                users(limit: Int!, offset: Int, filter: String): [User!]!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUsers($limit: Int!, $offset: Int, $filter: String) {
                users(limit: $limit, offset: $offset, filter: $filter) {
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

        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let generator = OperationVariablesGenerator::new(ctx, &registry);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            assert_eq!(op.variable_definitions.len(), 3);
            let result = generator.generate_variables(&op.variable_definitions);
            assert_matches!(result, TSType::TSTypeLiteral(_));
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_variable_with_default_value() {
        let schema = r#"
            type Query {
                users(limit: Int): [User!]!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUsers($limit: Int = 10) {
                users(limit: $limit) {
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

        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let generator = OperationVariablesGenerator::new(ctx, &registry);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_variables(&op.variable_definitions);
            assert_matches!(result, TSType::TSTypeLiteral(_));
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_mutation_variables() {
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

        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let generator = OperationVariablesGenerator::new(ctx, &registry);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            assert_eq!(op.variable_definitions.len(), 2);
            let result = generator.generate_variables(&op.variable_definitions);
            assert_matches!(result, TSType::TSTypeLiteral(_));
        } else {
            panic!("Expected operation definition");
        }
    }

    #[test]
    fn test_generate_variables_with_list_types() {
        let schema = r#"
            type Query {
                users(ids: [ID!]!): [User!]!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUsersByIds($ids: [ID!]!) {
                users(ids: $ids) {
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

        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();
        let generator = OperationVariablesGenerator::new(ctx, &registry);

        if let Some(Definition::Executable(ExecutableDefinition::Operation(op))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_variables(&op.variable_definitions);
            assert_matches!(result, TSType::TSTypeLiteral(_));
        } else {
            panic!("Expected operation definition");
        }
    }
}
