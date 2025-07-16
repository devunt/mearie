use super::super::constants::SCALARS_TYPE;
use super::super::{CodegenContext, Registry};
use oxc_ast::AstBuilder;
use oxc_ast::ast::Statement;
use oxc_span::SPAN;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScalarPrimitiveType {
    String,
    Number,
    Boolean,
}

pub struct ScalarsGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    registry: &'a Registry<'b>,
}

impl<'a, 'b> ScalarsGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, registry: &'a Registry<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            registry,
        }
    }

    pub fn generate(&self) -> Statement<'b> {
        let ident = self.ast.binding_identifier(SPAN, SCALARS_TYPE);

        let mut properties = self.ast.vec_from_array([
            self.create_scalar_property_signature("ID", ScalarPrimitiveType::String),
            self.create_scalar_property_signature("String", ScalarPrimitiveType::String),
            self.create_scalar_property_signature("Int", ScalarPrimitiveType::Number),
            self.create_scalar_property_signature("Float", ScalarPrimitiveType::Number),
            self.create_scalar_property_signature("Boolean", ScalarPrimitiveType::Boolean),
        ]);

        for scalar_name in self.registry.custom_scalars() {
            properties.push(self.create_custom_scalar_property_signature(scalar_name, None));
        }

        let type_literal = self.ast.ts_type_type_literal(SPAN, properties);

        let decl = self.ast.ts_type_alias_declaration(
            SPAN,
            ident,
            None::<oxc_allocator::Box<oxc_ast::ast::TSTypeParameterDeclaration>>,
            type_literal,
            false,
        );

        Statement::TSTypeAliasDeclaration(self.ast.alloc(decl))
    }

    fn create_scalar_property_signature(
        &self,
        key: &'b str,
        value_type: ScalarPrimitiveType,
    ) -> oxc_ast::ast::TSSignature<'b> {
        let type_annotation = match value_type {
            ScalarPrimitiveType::String => self.ast.ts_type_string_keyword(SPAN),
            ScalarPrimitiveType::Number => self.ast.ts_type_number_keyword(SPAN),
            ScalarPrimitiveType::Boolean => self.ast.ts_type_boolean_keyword(SPAN),
        };

        let key_prop = self.ast.property_key_static_identifier(SPAN, key);

        self.ast.ts_signature_property_signature(
            SPAN,
            false,
            false,
            false,
            key_prop,
            Some(self.ast.ts_type_annotation(SPAN, type_annotation)),
        )
    }

    fn create_custom_scalar_property_signature(
        &self,
        key: &'b str,
        mapping: Option<&'b str>,
    ) -> oxc_ast::ast::TSSignature<'b> {
        let type_annotation = match mapping {
            None => self.ast.ts_type_unknown_keyword(SPAN),
            Some(type_name) => self.ast.ts_type_type_reference(
                SPAN,
                self.ast.ts_type_name_identifier_reference(SPAN, type_name),
                None::<oxc_allocator::Box<oxc_ast::ast::TSTypeParameterInstantiation>>,
            ),
        };

        let key_prop = self.ast.property_key_static_identifier(SPAN, key);

        self.ast.ts_signature_property_signature(
            SPAN,
            false,
            false,
            false,
            key_prop,
            Some(self.ast.ts_type_annotation(SPAN, type_annotation)),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::Document;
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::span::Source;
    use assertables::*;
    use oxc_codegen::Codegen;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_scalars_generator_new() {
        let ctx = CodegenContext::new();
        let registry = Registry::new();
        let _generator = ScalarsGenerator::new(&ctx, &registry);
    }

    #[test]
    fn test_generate_scalars_with_built_in_only() {
        let ctx = CodegenContext::new();
        let registry = Registry::new();
        let generator = ScalarsGenerator::new(&ctx, &registry);

        let stmt = generator.generate();
        assert_matches!(stmt, Statement::TSTypeAliasDeclaration(_));
    }

    #[test]
    fn test_generate_scalars_with_custom_scalars() {
        let schema = r#"
            scalar DateTime
            scalar JSON
            scalar URL
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(document);

        let ctx = CodegenContext::new();
        let generator = ScalarsGenerator::new(&ctx, &registry);

        let stmt = generator.generate();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_array([stmt]),
        );

        let code = Codegen::new().build(&program).code;

        assert_contains!(code, "type Scalars");
        assert_contains!(code, "ID: string");
        assert_contains!(code, "String: string");
        assert_contains!(code, "Int: number");
        assert_contains!(code, "Float: number");
        assert_contains!(code, "Boolean: boolean");
        assert_contains!(code, "DateTime: unknown");
        assert_contains!(code, "JSON: unknown");
        assert_contains!(code, "URL: unknown");
    }
}
