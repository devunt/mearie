use super::super::{CodegenContext, type_builder};
use crate::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::Statement;
use oxc_span::SPAN;

pub struct EnumGenerator<'b> {
    ast: AstBuilder<'b>,
    document: &'b Document<'b>,
}

impl<'b> EnumGenerator<'b> {
    pub fn new(ctx: &'b CodegenContext, document: &'b Document<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            document,
        }
    }

    pub fn generate(&self) -> oxc_allocator::Vec<'b, Statement<'b>> {
        let mut statements = self.ast.vec();

        for definition in &self.document.definitions {
            if let Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Enum(enum_def))) = definition {
                let stmt = self.generate_enum_type(enum_def);
                statements.push(stmt);
            }
        }

        statements
    }

    fn generate_enum_type(&self, enum_def: &EnumTypeDefinition<'b>) -> Statement<'b> {
        let type_name = enum_def.name.as_str();

        let mut union_types = self.ast.vec();
        for value_def in &enum_def.values {
            let value_name = value_def.value.as_str();
            let string_literal = self.ast.ts_literal_string_literal(SPAN, value_name, None);
            let literal_type = self.ast.ts_type_literal_type(SPAN, string_literal);
            union_types.push(literal_type);
        }

        let union_type = self.ast.ts_type_union_type(SPAN, union_types);
        type_builder::export_type_alias(&self.ast, type_name, union_type)
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
    fn test_generate_enum() {
        let schema = r#"
            enum Status {
                ACTIVE
                INACTIVE
                PENDING
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let ctx = CodegenContext::new();
        let generator = EnumGenerator::new(&ctx, document);

        let statements = generator.generate();
        assert_eq!(statements.len(), 1);
    }

    #[test]
    fn test_generate_multiple_enums() {
        let schema = r#"
            enum Status {
                ACTIVE
                INACTIVE
            }
            enum Role {
                ADMIN
                USER
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let ctx = CodegenContext::new();
        let generator = EnumGenerator::new(&ctx, document);

        let statements = generator.generate();
        assert_eq!(statements.len(), 2);
    }

    #[test]
    fn test_generate_enum_output_code() {
        let schema = r#"
            enum Status {
                ACTIVE
                INACTIVE
                PENDING
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();

        let ctx = CodegenContext::new();
        let generator = EnumGenerator::new(&ctx, document);

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

        assert_contains!(code, "export type Status");
        assert_contains!(code, "\"ACTIVE\"");
        assert_contains!(code, "\"INACTIVE\"");
        assert_contains!(code, "\"PENDING\"");
        assert_contains!(code, "|");
    }
}
