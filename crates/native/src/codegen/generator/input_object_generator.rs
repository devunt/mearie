use super::super::{CodegenContext, Registry, type_builder};
use crate::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::Statement;
use oxc_span::SPAN;

pub struct InputObjectGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    registry: &'a Registry<'b>,
    document: &'b Document<'b>,
}

impl<'a, 'b> InputObjectGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, registry: &'a Registry<'b>, document: &'b Document<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            registry,
            document,
        }
    }

    pub fn generate(&self) -> oxc_allocator::Vec<'b, Statement<'b>> {
        let mut statements = self.ast.vec();

        for definition in &self.document.definitions {
            if let Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::InputObject(input_def))) =
                definition
            {
                let stmt = self.generate_input_object_type(input_def);
                statements.push(stmt);
            }
        }

        statements
    }

    fn generate_input_object_type(&self, input_def: &InputObjectTypeDefinition<'b>) -> Statement<'b> {
        let type_name = input_def.name.as_str();
        let type_literal = self.create_input_type_literal(&input_def.fields);
        type_builder::export_type_alias(&self.ast, type_name, type_literal)
    }

    fn create_input_type_literal(&self, fields: &[InputValueDefinition<'b>]) -> oxc_ast::ast::TSType<'b> {
        let mut signatures = self.ast.vec();
        for field in fields {
            let sig = self.create_input_property_signature(field);
            signatures.push(sig);
        }
        self.ast.ts_type_type_literal(SPAN, signatures)
    }

    fn create_input_property_signature(&self, field: &InputValueDefinition<'b>) -> oxc_ast::ast::TSSignature<'b> {
        let field_name = field.name.as_str();
        let is_required = matches!(&field.typ, Type::NonNull(_));
        let has_default_value = field.default_value.is_some();
        let is_optional = !is_required || has_default_value;

        let ts_type = self.map_type_for_input(&field.typ);

        let key = self.ast.property_key_static_identifier(SPAN, field_name);
        let type_annotation = self.ast.ts_type_annotation(SPAN, ts_type);

        self.ast
            .ts_signature_property_signature(SPAN, false, is_optional, false, key, Some(type_annotation))
    }

    fn map_type_for_input(&self, graphql_type: &Type<'b>) -> oxc_ast::ast::TSType<'b> {
        match graphql_type {
            Type::Named(named) => {
                let inner = self.map_named_type_for_input(named);
                type_builder::wrap_nullable(&self.ast, inner)
            }
            Type::List(inner_type) => {
                let inner = self.map_type_for_input(inner_type);
                let list = type_builder::wrap_list(&self.ast, inner);
                type_builder::wrap_nullable(&self.ast, list)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => self.map_named_type_for_input(named),
                NonNullType::List(inner_type) => {
                    let inner = self.map_type_for_input(inner_type);
                    type_builder::wrap_list(&self.ast, inner)
                }
            },
        }
    }

    fn map_named_type_for_input(&self, named_type: &NamedType<'b>) -> oxc_ast::ast::TSType<'b> {
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
    use crate::ast::Document;
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
    fn test_generate_simple_input_object() {
        let schema = r#"
            input CreateUserInput {
                name: String!
                email: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let ctx = CodegenContext::new();
        let mut registry = Registry::new();
        registry.load_schema(document);
        let generator = InputObjectGenerator::new(&ctx, &registry, document);

        let statements = generator.generate();
        assert_eq!(statements.len(), 1);
    }

    #[test]
    fn test_generate_nested_input_object() {
        let schema = r#"
            input AddressInput {
                street: String!
                city: String!
            }
            input CreateUserInput {
                name: String!
                address: AddressInput!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let ctx = CodegenContext::new();
        let mut registry = Registry::new();
        registry.load_schema(document);
        let generator = InputObjectGenerator::new(&ctx, &registry, document);

        let statements = generator.generate();
        assert_eq!(statements.len(), 2);
    }

    #[test]
    fn test_generate_input_object_output_code() {
        let schema = r#"
            input CreateUserInput {
                name: String!
                email: String
                age: Int
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let ctx = CodegenContext::new();
        let mut registry = Registry::new();
        registry.load_schema(document);
        let generator = InputObjectGenerator::new(&ctx, &registry, document);

        let statements = generator.generate();

        let ast = generator.ast;
        let program = ast.program(
            oxc_span::SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            statements,
        );
        let code = oxc_codegen::Codegen::new().build(&program).code;

        assert_contains!(code, "export type CreateUserInput");
        assert_contains!(code, "name: Scalars[\"String\"]");
        assert_contains!(code, "email?: Nullable<Scalars[\"String\"]>");
        assert_contains!(code, "age?: Nullable<Scalars[\"Int\"]>");
    }
}
