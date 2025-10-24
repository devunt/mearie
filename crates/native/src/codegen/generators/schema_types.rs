use super::super::constants::SCALARS_TYPE;
use super::super::{CodegenContext, type_builder};
use crate::graphql::ast::*;
use crate::schema::{SchemaIndex, TypeInfo};
use oxc_ast::AstBuilder;
use oxc_ast::ast::Statement;
use oxc_span::SPAN;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScalarPrimitiveType {
    String,
    Number,
    Boolean,
}

pub struct SchemaTypesGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
}

impl<'a, 'b> SchemaTypesGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>) -> Self {
        Self { ast: ctx.ast(), schema }
    }

    pub fn generate(&self) -> oxc_allocator::Vec<'b, Statement<'b>> {
        let mut statements = self.ast.vec();

        statements.push(self.generate_scalars_type());

        for (_name, type_info) in self.schema.types() {
            if let TypeInfo::InputObject(input_def) = type_info {
                statements.push(self.generate_input_object_type(input_def));
            }
        }

        statements
    }

    pub fn generate_enums_for_module(&self) -> oxc_allocator::Vec<'b, Statement<'b>> {
        let mut statements = self.ast.vec();

        for (_name, type_info) in self.schema.types() {
            if let TypeInfo::Enum(enum_def) = type_info {
                statements.push(self.generate_enum_type(enum_def));
            }
        }

        statements
    }

    fn generate_scalars_type(&self) -> Statement<'b> {
        let ident = self.ast.binding_identifier(SPAN, SCALARS_TYPE);

        let mut properties = self.ast.vec_from_array([
            self.create_scalar_property_signature("ID", ScalarPrimitiveType::String),
            self.create_scalar_property_signature("String", ScalarPrimitiveType::String),
            self.create_scalar_property_signature("Int", ScalarPrimitiveType::Number),
            self.create_scalar_property_signature("Float", ScalarPrimitiveType::Number),
            self.create_scalar_property_signature("Boolean", ScalarPrimitiveType::Boolean),
        ]);

        for scalar_name in self.schema.custom_scalars() {
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
        if self.schema.is_scalar(named_type.name.as_str()) {
            type_builder::create_scalar_reference(&self.ast, named_type.name.as_str())
        } else {
            type_builder::create_type_reference(&self.ast, named_type.name.as_str())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assertables::*;
    use crate::setup_codegen;
    use oxc_codegen::Codegen;


    #[test]
    fn test_scalars_generator_new() {
        let (ctx, schema_index, _) = setup_codegen!(r#""#, r#""#);
        let _generator = SchemaTypesGenerator::new(&ctx, &schema_index);
    }

    #[test]
    fn test_generate_scalars_with_built_in_only() {
        let (ctx, schema_index, _) = setup_codegen!(r#""#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate();
        assert_eq!(statements.len(), 1);
        assert_matches!(statements[0], Statement::TSTypeAliasDeclaration(_));
    }

    #[test]
    fn test_generate_scalars_with_custom_scalars() {
        let (ctx, schema_index, _) = setup_codegen!(r#"scalar DateTime scalar JSON scalar URL"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            statements,
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

    #[test]
    fn test_generate_enum() {
        let (ctx, schema_index, _) = setup_codegen!(r#"enum Status { ACTIVE INACTIVE PENDING }"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate_enums_for_module();
        assert_eq!(statements.len(), 1);
    }

    #[test]
    fn test_generate_multiple_enums() {
        let (ctx, schema_index, _) = setup_codegen!(r#"enum Status { ACTIVE INACTIVE } enum Role { ADMIN USER }"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate_enums_for_module();
        assert_eq!(statements.len(), 2);
    }

    #[test]
    fn test_generate_enum_output_code() {
        let (ctx, schema_index, _) = setup_codegen!(r#"enum Status { ACTIVE INACTIVE PENDING }"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate_enums_for_module();

        let ast = ctx.ast();
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

    #[test]
    fn test_generate_simple_input_object() {
        let (ctx, schema_index, _) = setup_codegen!(r#"input CreateUserInput { name: String! email: String }"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate();
        assert_eq!(statements.len(), 2);
    }

    #[test]
    fn test_generate_nested_input_object() {
        let (ctx, schema_index, _) = setup_codegen!(r#"input AddressInput { street: String! city: String! } input CreateUserInput { name: String! address: AddressInput! }"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate();
        assert_eq!(statements.len(), 3);
    }

    #[test]
    fn test_generate_input_object_output_code() {
        let (ctx, schema_index, _) = setup_codegen!(r#"input CreateUserInput { name: String! email: String age: Int }"#, r#""#);
        let generator = SchemaTypesGenerator::new(&ctx, &schema_index);

        let statements = generator.generate();

        let ast = ctx.ast();
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
