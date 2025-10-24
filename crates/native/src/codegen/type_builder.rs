use super::constants::{LIST_TYPE, NULLABLE_TYPE, SCALARS_TYPE};
use crate::graphql::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast::ast::TSType;
use oxc_span::SPAN;
use rustc_hash::FxHashMap;

pub fn create_scalar_reference<'a>(ast: &AstBuilder<'a>, scalar_name: &'a str) -> TSType<'a> {
    use oxc_span::Atom;

    let scalars_ref = ast.ts_type_type_reference(
        SPAN,
        ast.ts_type_name_identifier_reference(SPAN, SCALARS_TYPE),
        None::<oxc_allocator::Box<oxc_ast::ast::TSTypeParameterInstantiation>>,
    );

    let string_literal = ast.ts_literal_string_literal(SPAN, scalar_name, None::<Atom>);
    let literal_type = ast.ts_type_literal_type(SPAN, string_literal);

    ast.ts_type_indexed_access_type(SPAN, scalars_ref, literal_type)
}

pub fn create_type_reference<'a>(ast: &AstBuilder<'a>, type_name: &'a str) -> TSType<'a> {
    ast.ts_type_type_reference(
        SPAN,
        ast.ts_type_name_identifier_reference(SPAN, type_name),
        None::<oxc_allocator::Box<oxc_ast::ast::TSTypeParameterInstantiation>>,
    )
}

pub fn create_field_reference<'a>(ast: &AstBuilder<'a>, type_name: &'a str, field_name: &'a str) -> TSType<'a> {
    use oxc_span::Atom;

    let type_ref = ast.ts_type_type_reference(
        SPAN,
        ast.ts_type_name_identifier_reference(SPAN, type_name),
        None::<oxc_allocator::Box<oxc_ast::ast::TSTypeParameterInstantiation>>,
    );

    let string_literal = ast.ts_literal_string_literal(SPAN, field_name, None::<Atom>);
    let literal_type = ast.ts_type_literal_type(SPAN, string_literal);

    ast.ts_type_indexed_access_type(SPAN, type_ref, literal_type)
}

pub fn wrap_nullable<'a>(ast: &AstBuilder<'a>, inner_type: TSType<'a>) -> TSType<'a> {
    let type_param_instantiation = ast.ts_type_parameter_instantiation(SPAN, ast.vec_from_array([inner_type]));

    ast.ts_type_type_reference(
        SPAN,
        ast.ts_type_name_identifier_reference(SPAN, NULLABLE_TYPE),
        Some(type_param_instantiation),
    )
}

pub fn wrap_list<'a>(ast: &AstBuilder<'a>, inner_type: TSType<'a>) -> TSType<'a> {
    let type_param_instantiation = ast.ts_type_parameter_instantiation(SPAN, ast.vec_from_array([inner_type]));

    ast.ts_type_type_reference(
        SPAN,
        ast.ts_type_name_identifier_reference(SPAN, LIST_TYPE),
        Some(type_param_instantiation),
    )
}

pub fn map_type<'a>(ast: &AstBuilder<'a>, graphql_type: &Type<'a>) -> TSType<'a> {
    match graphql_type {
        Type::Named(named) => {
            let inner = create_type_reference(ast, named.name.as_str());
            wrap_nullable(ast, inner)
        }
        Type::List(inner_type) => {
            let inner = map_type(ast, inner_type);
            let list = wrap_list(ast, inner);
            wrap_nullable(ast, list)
        }
        Type::NonNull(non_null) => match non_null {
            NonNullType::Named(named) => create_type_reference(ast, named.name.as_str()),
            NonNullType::List(inner_type) => {
                let inner = map_type(ast, inner_type);
                wrap_list(ast, inner)
            }
        },
    }
}

pub fn create_type_literal_from_map<'a>(ast: &AstBuilder<'a>, field_map: FxHashMap<&'a str, TSType<'a>>) -> TSType<'a> {
    let mut signatures = ast.vec();

    for (field_name, field_type) in field_map {
        let field_name_atom = ast.atom(field_name);
        let key = ast.property_key_static_identifier(SPAN, field_name_atom);
        let type_annotation = ast.ts_type_annotation(SPAN, field_type);

        let sig = ast.ts_signature_property_signature(SPAN, false, false, false, key, Some(type_annotation));
        signatures.push(sig);
    }

    ast.ts_type_type_literal(SPAN, signatures)
}

pub fn create_type_literal_from_map_with_optional<'a>(
    ast: &AstBuilder<'a>,
    field_map: FxHashMap<&'a str, (TSType<'a>, bool)>,
) -> TSType<'a> {
    let mut signatures = ast.vec();

    for (field_name, (field_type, is_optional)) in field_map {
        let field_name_atom = ast.atom(field_name);
        let key = ast.property_key_static_identifier(SPAN, field_name_atom);
        let type_annotation = ast.ts_type_annotation(SPAN, field_type);

        let sig = ast.ts_signature_property_signature(SPAN, false, is_optional, false, key, Some(type_annotation));
        signatures.push(sig);
    }

    ast.ts_type_type_literal(SPAN, signatures)
}

pub fn create_intersection_type<'a>(ast: &AstBuilder<'a>, types: Vec<TSType<'a>>) -> TSType<'a> {
    let mut ts_types = ast.vec();
    for ty in types {
        ts_types.push(ty);
    }
    ast.ts_type_intersection_type(SPAN, ts_types)
}

pub fn create_union_type<'a>(ast: &AstBuilder<'a>, types: Vec<TSType<'a>>) -> TSType<'a> {
    let mut ts_types = ast.vec();
    for ty in types {
        ts_types.push(ty);
    }
    ast.ts_type_union_type(SPAN, ts_types)
}

pub fn create_empty_object<'a>(ast: &AstBuilder<'a>) -> TSType<'a> {
    ast.ts_type_type_literal(SPAN, ast.vec())
}

pub fn create_fragment_refs_type<'a>(ast: &AstBuilder<'a>, fragment_names: Vec<&'a str>) -> TSType<'a> {
    use oxc_span::Atom;

    if fragment_names.is_empty() {
        return create_empty_object(ast);
    }

    let mut union_types = ast.vec();
    for name in fragment_names {
        let literal = ast.ts_literal_string_literal(SPAN, name, None::<Atom>);
        let literal_type = ast.ts_type_literal_type(SPAN, literal);
        union_types.push(literal_type);
    }

    let value_type = if union_types.len() == 1 {
        union_types.into_iter().next().unwrap()
    } else {
        ast.ts_type_union_type(SPAN, union_types)
    };

    let type_param_instantiation = ast.ts_type_parameter_instantiation(SPAN, ast.vec_from_array([value_type]));

    ast.ts_type_type_reference(
        SPAN,
        ast.ts_type_name_identifier_reference(SPAN, "FragmentRefs"),
        Some(type_param_instantiation),
    )
}

pub fn export_type_alias<'a>(ast: &AstBuilder<'a>, name: &str, ts_type: TSType<'a>) -> oxc_ast::ast::Statement<'a> {
    use oxc_ast::ast::{Declaration, Statement};

    let name_atom = ast.atom(name);
    let decl = ast.ts_type_alias_declaration(
        SPAN,
        ast.binding_identifier(SPAN, name_atom),
        None::<oxc_allocator::Box<oxc_ast::ast::TSTypeParameterDeclaration>>,
        ts_type,
        false,
    );

    let decl_boxed = ast.alloc(decl);
    let export_decl = ast.export_named_declaration(
        SPAN,
        Some(Declaration::TSTypeAliasDeclaration(decl_boxed)),
        ast.vec(),
        None::<oxc_ast::ast::StringLiteral>,
        oxc_ast::ast::ImportOrExportKind::Value,
        None::<oxc_ast::ast::WithClause>,
    );

    Statement::ExportNamedDeclaration(ast.alloc(export_decl))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codegen::CodegenContext as TypeScriptContext;
    use assertables::*;
    use oxc_allocator::Allocator;
    use oxc_ast::AstBuilder;
    use oxc_ast::ast::TSType;

    #[test]
    fn test_create_scalar_reference() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);
        let ts_type = create_scalar_reference(&ast, "ID");
        assert_matches!(ts_type, TSType::TSIndexedAccessType(_));
    }

    #[test]
    fn test_create_type_reference() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);
        let ts_type = create_type_reference(&ast, "User");
        assert_matches!(ts_type, TSType::TSTypeReference(_));
    }

    #[test]
    fn test_create_field_reference() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);
        let ts_type = create_field_reference(&ast, "User", "id");
        assert_matches!(ts_type, TSType::TSIndexedAccessType(_));
    }

    #[test]
    fn test_wrap_nullable() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);
        let inner = create_type_reference(&ast, "User");
        let wrapped = wrap_nullable(&ast, inner);
        assert_matches!(wrapped, TSType::TSTypeReference(_));
    }

    #[test]
    fn test_wrap_list() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);
        let inner = create_type_reference(&ast, "User");
        let wrapped = wrap_list(&ast, inner);
        assert_matches!(wrapped, TSType::TSTypeReference(_));
    }

    #[test]
    fn test_create_empty_object() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let result = create_empty_object(&ast);
        assert_matches!(result, TSType::TSTypeLiteral(_));
    }

    #[test]
    fn test_create_type_literal_from_empty_map() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let field_map = FxHashMap::default();
        let result = create_type_literal_from_map(&ast, field_map);
        assert_matches!(result, TSType::TSTypeLiteral(_));
    }

    #[test]
    fn test_create_type_literal_from_map_with_single_field() {
        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let ast = ctx.ast();

        let mut field_map = FxHashMap::default();
        let field_type = create_type_reference(&ast, "String");
        field_map.insert("id", field_type);

        let result = create_type_literal_from_map(&ast, field_map);
        assert_matches!(result, TSType::TSTypeLiteral(_));
    }

    #[test]
    fn test_create_type_literal_from_map_with_multiple_fields() {
        let ctx = Box::leak(Box::new(TypeScriptContext::new()));
        let ast = ctx.ast();

        let mut field_map = FxHashMap::default();
        field_map.insert("id", create_type_reference(&ast, "ID"));
        field_map.insert("name", create_type_reference(&ast, "String"));
        field_map.insert("email", create_type_reference(&ast, "String"));

        let result = create_type_literal_from_map(&ast, field_map);
        assert_matches!(result, TSType::TSTypeLiteral(_));
    }

    #[test]
    fn test_create_intersection_type_with_single_type() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let types = vec![create_type_reference(&ast, "User")];
        let result = create_intersection_type(&ast, types);
        assert_matches!(result, TSType::TSIntersectionType(_));
    }

    #[test]
    fn test_create_intersection_type_with_multiple_types() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let types = vec![
            create_type_reference(&ast, "User"),
            create_type_reference(&ast, "Timestamped"),
            create_type_reference(&ast, "Auditable"),
        ];
        let result = create_intersection_type(&ast, types);
        assert_matches!(result, TSType::TSIntersectionType(_));
    }

    #[test]
    fn test_create_union_type_with_single_type() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let types = vec![create_type_reference(&ast, "User")];
        let result = create_union_type(&ast, types);
        assert_matches!(result, TSType::TSUnionType(_));
    }

    #[test]
    fn test_create_union_type_with_multiple_types() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let types = vec![
            create_type_reference(&ast, "User"),
            create_type_reference(&ast, "Post"),
            create_type_reference(&ast, "Comment"),
        ];
        let result = create_union_type(&ast, types);
        assert_matches!(result, TSType::TSUnionType(_));
    }

    #[test]
    fn test_create_intersection_type_empty_vec() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let types = vec![];
        let result = create_intersection_type(&ast, types);
        assert_matches!(result, TSType::TSIntersectionType(_));
    }

    #[test]
    fn test_create_union_type_empty_vec() {
        let allocator = Allocator::default();
        let ast = AstBuilder::new(&allocator);

        let types = vec![];
        let result = create_union_type(&ast, types);
        assert_matches!(result, TSType::TSUnionType(_));
    }
}
