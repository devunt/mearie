use super::super::{CodegenContext, Result, type_builder};
use super::SelectionSetGenerator;
use crate::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::Statement;

pub struct FragmentGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    selection_set_generator: &'a SelectionSetGenerator<'a, 'b>,
}

impl<'a, 'b> FragmentGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, selection_set_generator: &'a SelectionSetGenerator<'a, 'b>) -> Self {
        Self {
            ast: ctx.ast(),
            selection_set_generator,
        }
    }

    pub fn generate_fragment(&self, fragment: &FragmentDefinition<'b>) -> Result<Vec<Statement<'b>>> {
        let fragment_name = fragment.name.as_str();
        let type_name = format!("{}Fragment", fragment_name);
        let type_condition = fragment.type_condition.as_str();

        let ts_type = self
            .selection_set_generator
            .generate_selection_set(&fragment.selection_set, type_condition)?;

        let type_stmt = type_builder::export_type_alias(&self.ast, &type_name, ts_type);

        let doc_type_name = format!("{}Fragment$doc", fragment_name);
        let type_name_str = self.ast.allocator.alloc_str(&type_name);
        let fragment_type_ref = type_builder::create_type_reference(&self.ast, type_name_str);
        let doc_type = self.create_document_node_type(fragment_type_ref);
        let doc_stmt = type_builder::export_type_alias(&self.ast, &doc_type_name, doc_type);

        Ok(vec![type_stmt, doc_stmt])
    }

    fn create_document_node_type(&self, fragment_type: oxc_ast::ast::TSType<'b>) -> oxc_ast::ast::TSType<'b> {
        let mut type_params = self.ast.vec();
        type_params.push(fragment_type);

        self.ast.ts_type_type_reference(
            oxc_span::SPAN,
            self.ast
                .ts_type_name_identifier_reference(oxc_span::SPAN, "DocumentNode"),
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
    fn test_fragment_generator_new() {
        let ctx = TypeScriptContext::new();
        let registry = Registry::new();
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let _generator = FragmentGenerator::new(&ctx, &selection_set_generator);
    }

    #[test]
    fn test_generate_fragment_simple() {
        let schema = r#"
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
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = TypeScriptContext::new();
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = FragmentGenerator::new(&ctx, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Fragment(fragment))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_fragment(fragment);
            assert_ok!(&result);
            let stmts = result.unwrap();
            assert_eq!(stmts.len(), 2);
            assert_matches!(stmts[0], Statement::ExportNamedDeclaration(_));
            assert_matches!(stmts[1], Statement::ExportNamedDeclaration(_));
        } else {
            panic!("Expected fragment definition");
        }
    }

    #[test]
    fn test_generate_fragment_with_nested_selection() {
        let schema = r#"
            type User {
                id: ID!
                name: String!
                posts: [Post!]!
            }
            type Post {
                id: ID!
                title: String!
            }
        "#;

        let operations = r#"
            fragment UserWithPosts on User {
                id
                name
                posts {
                    id
                    title
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = TypeScriptContext::new();
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = FragmentGenerator::new(&ctx, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Fragment(fragment))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_fragment(fragment);
            assert_ok!(&result);
            let stmts = result.unwrap();
            assert_eq!(stmts.len(), 2);
        } else {
            panic!("Expected fragment definition");
        }
    }

    #[test]
    fn test_generate_fragment_on_interface() {
        let schema = r#"
            interface Node {
                id: ID!
            }
            type User implements Node {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            fragment NodeFields on Node {
                id
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
        let selection_set_generator = SelectionSetGenerator::new(&registry, &ctx);

        let generator = FragmentGenerator::new(&ctx, &selection_set_generator);

        if let Some(Definition::Executable(ExecutableDefinition::Fragment(fragment))) =
            operations_document.definitions.first()
        {
            let result = generator.generate_fragment(fragment);
            assert_ok!(&result);
            let stmts = result.unwrap();
            assert_eq!(stmts.len(), 2);
        } else {
            panic!("Expected fragment definition");
        }
    }
}
