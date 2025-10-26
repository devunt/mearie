use super::super::CodegenContext;
use crate::error::{MearieError, Result};
use crate::graphql::ast::*;
use crate::schema::{DocumentIndex, SchemaIndex};
use crate::source::SourceBuf;
use itertools::chain;
use oxc_allocator::Box as OxcBox;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_codegen::Codegen;
use oxc_span::{Atom, SPAN, SourceType};
use rustc_hash::FxHashMap;

type StmtVec<'b> = oxc_allocator::Vec<'b, Statement<'b>>;

pub struct TypesGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> TypesGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            schema,
            document,
        }
    }

    pub fn generate(&self) -> Result<SourceBuf> {
        let statements = self.ast.vec_from_iter(chain![
            std::iter::once(self.stmt_import_core()),
            std::iter::once(self.export_scalars()),
            std::iter::once(self.export_schema()),
            self.gen_enum_exports(),
            self.gen_input_exports(),
            self.gen_fragment_exports()?,
            self.gen_operation_exports()?,
        ]);

        let program = self.ast.program(
            SPAN,
            SourceType::default(),
            "",
            self.ast.vec(),
            None,
            self.ast.vec(),
            statements,
        );

        let code = Codegen::new().build(&program).code;

        Ok(SourceBuf {
            code,
            file_path: "types.d.ts".to_string(),
            start_line: 1,
        })
    }

    fn gen_enum_exports(&self) -> StmtVec<'b> {
        self.ast
            .vec_from_iter(self.schema.enums().map(|enum_def| self.export_enum(enum_def)))
    }

    fn gen_input_exports(&self) -> StmtVec<'b> {
        self.ast.vec_from_iter(
            self.schema
                .input_objects()
                .map(|input_def| self.export_input(input_def)),
        )
    }

    fn gen_operation_exports(&self) -> Result<StmtVec<'b>> {
        let stmts: Result<Vec<Vec<Statement<'b>>>> = self
            .document
            .operations()
            .map(|operation| self.export_operation(operation))
            .collect();

        Ok(self.ast.vec_from_iter(stmts?.into_iter().flatten()))
    }

    fn gen_fragment_exports(&self) -> Result<StmtVec<'b>> {
        let stmts: Result<Vec<Vec<Statement<'b>>>> = self
            .document
            .fragments()
            .map(|fragment| self.export_fragment(fragment))
            .collect();

        Ok(self.ast.vec_from_iter(stmts?.into_iter().flatten()))
    }

    fn export_scalars(&self) -> Statement<'b> {
        let built_in_scalars = [
            ("ID", self.ast.ts_type_string_keyword(SPAN)),
            ("String", self.ast.ts_type_string_keyword(SPAN)),
            ("Int", self.ast.ts_type_number_keyword(SPAN)),
            ("Float", self.ast.ts_type_number_keyword(SPAN)),
            ("Boolean", self.ast.ts_type_boolean_keyword(SPAN)),
        ];

        let properties = self.ast.vec_from_iter(chain![
            built_in_scalars.into_iter().map(|(name, typ)| {
                self.ast.ts_signature_property_signature(
                    SPAN,
                    false,
                    false,
                    false,
                    self.ast.property_key_static_identifier(SPAN, name),
                    Some(self.ast.ts_type_annotation(SPAN, typ)),
                )
            }),
            self.schema.custom_scalars().iter().map(|name| {
                let typ = match None {
                    Some(type_name) => self.type_ref(type_name),
                    None => self.ast.ts_type_unknown_keyword(SPAN),
                };

                self.ast.ts_signature_property_signature(
                    SPAN,
                    false,
                    false,
                    false,
                    self.ast.property_key_static_identifier(SPAN, *name),
                    Some(self.ast.ts_type_annotation(SPAN, typ)),
                )
            }),
        ]);

        let type_literal = self.ast.ts_type_type_literal(SPAN, properties);

        self.stmt_export_type("$Scalars", type_literal)
    }

    fn export_schema(&self) -> Statement<'b> {
        let schema_meta_type = self.type_ref("$SchemaMeta");
        self.stmt_export_type("$Schema", schema_meta_type)
    }

    fn export_enum(&self, enum_def: &EnumTypeDefinition<'b>) -> Statement<'b> {
        let type_name = enum_def.name.as_str();

        let types = self.ast.vec_from_iter(enum_def.values.iter().map(|value_def| {
            let value_name = value_def.value.as_str();
            let string_literal = self.ast.ts_literal_string_literal(SPAN, value_name, None);
            self.ast.ts_type_literal_type(SPAN, string_literal)
        }));

        let union_type = self.ast.ts_type_union_type(SPAN, types);
        self.stmt_export_type(type_name, union_type)
    }

    fn export_input(&self, input_def: &InputObjectTypeDefinition<'b>) -> Statement<'b> {
        let type_name = input_def.name.as_str();

        let props = self.ast.vec_from_iter(
            input_def
                .fields
                .iter()
                .map(|field| self.sig_field(field.name.as_str(), &field.typ, field.default_value.is_some())),
        );

        let type_literal = self.ast.ts_type_type_literal(SPAN, props);
        self.stmt_export_type(type_name, type_literal)
    }

    fn export_operation(&self, operation: &OperationDefinition<'b>) -> Result<Vec<Statement<'b>>> {
        let name = operation
            .name
            .ok_or_else(|| MearieError::codegen("Operation must have a name"))?
            .as_str();

        let (kind, root_type) = match operation.operation_type {
            OperationType::Query => ("query", "Query"),
            OperationType::Mutation => ("mutation", "Mutation"),
            OperationType::Subscription => ("subscription", "Subscription"),
        };

        let data_type = self.type_selection_set(&operation.selection_set, root_type)?;
        let vars_type = self.type_variables(&operation.variable_definitions);
        let artifact_type = self.type_artifact(
            kind,
            name,
            self.type_ref(&format!("{}$data", name)),
            Some(self.type_ref(&format!("{}$vars", name))),
        );

        Ok(vec![
            self.stmt_export_type(&format!("{}$data", name), data_type),
            self.stmt_export_type(&format!("{}$vars", name), vars_type),
            self.stmt_export_type(name, artifact_type),
        ])
    }

    fn export_fragment(&self, fragment: &FragmentDefinition<'b>) -> Result<Vec<Statement<'b>>> {
        let fragment_name = fragment.name.as_str();
        let type_condition = fragment.type_condition.as_str();

        let data_type = self.type_selection_set(&fragment.selection_set, type_condition)?;
        let key_type = self.type_fragment_refs(vec![fragment_name]);
        let artifact_type = self.type_artifact(
            "fragment",
            fragment_name,
            self.type_ref(&format!("{}$data", fragment_name)),
            None,
        );

        Ok(vec![
            self.stmt_export_type(&format!("{}$data", fragment_name), data_type),
            self.stmt_export_type(&format!("{}$key", fragment_name), key_type),
            self.stmt_export_type(fragment_name, artifact_type),
        ])
    }

    fn type_selection_set(&self, selection_set: &SelectionSet<'b>, parent_type: &'b str) -> Result<TSType<'b>> {
        if selection_set.is_empty() {
            return Ok(self.type_empty_object());
        }

        let mut field_map: FxHashMap<&'b str, (TSType<'b>, bool)> = FxHashMap::default();
        let mut inline_fragment_types: Vec<TSType<'b>> = Vec::new();
        let mut fragment_refs: Vec<&'b str> = Vec::new();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    let (field_name, field_type, is_optional) = self.field_type_info(field, parent_type)?;
                    field_map.insert(field_name, (field_type, is_optional));
                }
                Selection::FragmentSpread(spread) => {
                    let fragment_name = spread.fragment_name.as_str();
                    self.document
                        .get_fragment(fragment_name)
                        .ok_or_else(|| MearieError::codegen(format!("Fragment '{}' not found", fragment_name)))?;
                    fragment_refs.push(fragment_name);
                }
                Selection::InlineFragment(inline) => {
                    let fragment_type = self.type_inline_fragment(inline, parent_type)?;
                    inline_fragment_types.push(fragment_type);
                }
            }
        }

        Ok(self.type_intersect_selections(field_map, inline_fragment_types, fragment_refs))
    }

    fn field_type_info(&self, field: &Field<'b>, parent_type: &'b str) -> Result<(&'b str, TSType<'b>, bool)> {
        let field_name = field.alias_or_name().as_str();
        let actual_field_name = field.name.as_str();

        if actual_field_name.starts_with("__") {
            let introspection_type = match actual_field_name {
                "__typename" => self.ast.ts_type_string_keyword(SPAN),
                _ => self.ast.ts_type_unknown_keyword(SPAN),
            };
            return Ok((field_name, introspection_type, false));
        }

        let field_def = self.schema.get_field(parent_type, actual_field_name).ok_or_else(|| {
            MearieError::codegen(format!(
                "Field '{}' not found on type '{}'",
                actual_field_name, parent_type
            ))
        })?;

        let graphql_type = &field_def.typ;
        let is_optional = graphql_type.is_nullable();

        let field_type = if !field.selection_set.is_empty() {
            let inner_type_name = graphql_type.innermost_type().as_str();
            let selection_type = self.type_selection_set(&field.selection_set, inner_type_name)?;
            self.type_from_graphql(graphql_type, Some(selection_type))
        } else {
            self.type_from_graphql(graphql_type, None)
        };

        Ok((field_name, field_type, is_optional))
    }

    fn type_inline_fragment(&self, inline_fragment: &InlineFragment<'b>, parent_type: &'b str) -> Result<TSType<'b>> {
        let type_condition = inline_fragment
            .type_condition
            .map(|name| name.as_str())
            .unwrap_or(parent_type);

        self.type_selection_set(&inline_fragment.selection_set, type_condition)
    }

    fn type_intersect_selections(
        &self,
        field_map: FxHashMap<&'b str, (TSType<'b>, bool)>,
        inline_fragment_types: Vec<TSType<'b>>,
        fragment_refs: Vec<&'b str>,
    ) -> TSType<'b> {
        let base_type = if !field_map.is_empty() {
            self.type_object(field_map)
        } else {
            self.type_empty_object()
        };

        let mut all_types = vec![base_type];
        all_types.extend(inline_fragment_types);

        if !fragment_refs.is_empty() {
            let fragment_refs_type = self.type_fragment_refs(fragment_refs);
            all_types.push(fragment_refs_type);
        }

        if all_types.len() == 1 {
            all_types.into_iter().next().unwrap()
        } else {
            let ts_types = self.ast.vec_from_iter(all_types);
            self.ast.ts_type_intersection_type(SPAN, ts_types)
        }
    }

    fn type_variables(&self, variables: &[VariableDefinition<'b>]) -> TSType<'b> {
        let props =
            self.ast.vec_from_iter(variables.iter().map(|var_def| {
                self.sig_field(var_def.variable.as_str(), &var_def.typ, var_def.default_value.is_some())
            }));

        self.ast.ts_type_type_literal(SPAN, props)
    }

    fn type_artifact(
        &self,
        kind: &'b str,
        name: &'b str,
        data_type: TSType<'b>,
        vars_type: Option<TSType<'b>>,
    ) -> TSType<'b> {
        let mut type_params = self.ast.vec();

        let kind_literal = self.ast.ts_literal_string_literal(SPAN, kind, None::<Atom>);
        let kind_type = self.ast.ts_type_literal_type(SPAN, kind_literal);
        type_params.push(kind_type);

        let name_literal = self.ast.ts_literal_string_literal(SPAN, name, None::<Atom>);
        let name_type = self.ast.ts_type_literal_type(SPAN, name_literal);
        type_params.push(name_type);

        type_params.push(data_type);
        type_params.push(vars_type.unwrap_or_else(|| self.ast.ts_type_never_keyword(SPAN)));

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "$Artifact"),
            Some(self.ast.ts_type_parameter_instantiation(SPAN, type_params)),
        )
    }

    fn sig_field(&self, name: &'b str, graphql_type: &Type<'b>, has_default_value: bool) -> TSSignature<'b> {
        let is_nullable = graphql_type.is_nullable();
        let is_optional = is_nullable || has_default_value;

        let typ = self.type_from_graphql(graphql_type, None);

        self.ast.ts_signature_property_signature(
            SPAN,
            false,
            is_optional,
            false,
            self.ast.property_key_static_identifier(SPAN, name),
            Some(self.ast.ts_type_annotation(SPAN, typ)),
        )
    }

    fn type_from_graphql(&self, graphql_type: &Type<'b>, inner: Option<TSType<'b>>) -> TSType<'b> {
        match graphql_type {
            Type::Named(named) => {
                let base = inner.unwrap_or_else(|| self.type_from_named(named));
                self.type_nullable(base)
            }
            Type::List(nested_type) => {
                let nested = self.type_from_graphql(nested_type, inner);
                let list = self.type_list(nested);
                self.type_nullable(list)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => inner.unwrap_or_else(|| self.type_from_named(named)),
                NonNullType::List(nested_type) => {
                    let nested = self.type_from_graphql(nested_type, inner);
                    self.type_list(nested)
                }
            },
        }
    }

    fn type_from_named(&self, named_type: &NamedType<'b>) -> TSType<'b> {
        if self.schema.is_scalar(named_type.name.as_str()) {
            self.type_scalar_ref(named_type.name.as_str())
        } else {
            self.type_ref(named_type.name.as_str())
        }
    }

    fn type_object(&self, field_map: FxHashMap<&'b str, (TSType<'b>, bool)>) -> TSType<'b> {
        let mut signatures = self.ast.vec();

        for (field_name, (field_type, is_optional)) in field_map {
            let field_name_atom = self.ast.atom(field_name);
            let key = self.ast.property_key_static_identifier(SPAN, field_name_atom);
            let type_annotation = self.ast.ts_type_annotation(SPAN, field_type);

            let sig =
                self.ast
                    .ts_signature_property_signature(SPAN, false, is_optional, false, key, Some(type_annotation));
            signatures.push(sig);
        }

        self.ast.ts_type_type_literal(SPAN, signatures)
    }

    fn type_fragment_refs(&self, fragment_names: Vec<&'b str>) -> TSType<'b> {
        let union_types = self.ast.vec_from_iter(fragment_names.iter().map(|name| {
            let literal = self.ast.ts_literal_string_literal(SPAN, *name, None::<Atom>);
            self.ast.ts_type_literal_type(SPAN, literal)
        }));

        let value_type = if union_types.len() == 1 {
            union_types.into_iter().next().unwrap()
        } else {
            self.ast.ts_type_union_type(SPAN, union_types)
        };

        let type_param_instantiation = self
            .ast
            .ts_type_parameter_instantiation(SPAN, self.ast.vec_from_array([value_type]));

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "$FragmentRefs"),
            Some(type_param_instantiation),
        )
    }

    fn type_nullable(&self, inner_type: TSType<'b>) -> TSType<'b> {
        let type_param_instantiation = self
            .ast
            .ts_type_parameter_instantiation(SPAN, self.ast.vec_from_array([inner_type]));

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "$Nullable"),
            Some(type_param_instantiation),
        )
    }

    fn type_list(&self, inner_type: TSType<'b>) -> TSType<'b> {
        let type_param_instantiation = self
            .ast
            .ts_type_parameter_instantiation(SPAN, self.ast.vec_from_array([inner_type]));

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "$List"),
            Some(type_param_instantiation),
        )
    }

    fn type_scalar_ref(&self, scalar_name: &'b str) -> TSType<'b> {
        let scalars = self.type_ref("$Scalars");

        let string_literal = self.ast.ts_literal_string_literal(SPAN, scalar_name, None::<Atom>);
        let literal_type = self.ast.ts_type_literal_type(SPAN, string_literal);

        self.ast.ts_type_indexed_access_type(SPAN, scalars, literal_type)
    }

    fn type_ref(&self, type_name: &str) -> TSType<'b> {
        let type_name_str = self.ast.allocator.alloc_str(type_name);
        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, type_name_str),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn type_empty_object(&self) -> TSType<'b> {
        self.ast.ts_type_type_literal(SPAN, self.ast.vec())
    }

    fn stmt_export_type(&self, name: &str, ts_type: TSType<'b>) -> Statement<'b> {
        let name_atom = self.ast.atom(name);
        let decl = self.ast.ts_type_alias_declaration(
            SPAN,
            self.ast.binding_identifier(SPAN, name_atom),
            None::<OxcBox<TSTypeParameterDeclaration>>,
            ts_type,
            false,
        );

        let decl_boxed = self.ast.alloc(decl);
        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::TSTypeAliasDeclaration(decl_boxed)),
            self.ast.vec(),
            None::<StringLiteral>,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Statement::ExportNamedDeclaration(self.ast.alloc(export_decl))
    }

    fn stmt_import_core(&self) -> Statement<'b> {
        let mut specifiers = self.ast.vec();

        let type_names = ["Artifact", "Nullable", "List", "FragmentRefs", "SchemaMeta"];
        for type_name in type_names {
            let local_type_name = format!("${}", type_name);

            let local = self.ast.binding_identifier(SPAN, self.ast.atom(&local_type_name));
            let imported = self
                .ast
                .module_export_name_identifier_name(SPAN, self.ast.atom(type_name));
            let specifier = self.ast.import_declaration_specifier_import_specifier(
                SPAN,
                imported,
                local,
                ImportOrExportKind::Value,
            );
            specifiers.push(specifier);
        }

        let import_decl = self.ast.import_declaration(
            SPAN,
            Some(specifiers),
            self.ast.string_literal(SPAN, "mearie/types", None::<Atom>),
            None,
            None::<OxcBox<WithClause>>,
            ImportOrExportKind::Type,
        );

        Statement::ImportDeclaration(self.ast.alloc(import_decl))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup_codegen;
    use assertables::*;

    #[test]
    fn test_generate_scalars_with_built_in_only() {
        let (ctx, schema_index, document_index) = setup_codegen!(r#""#, r#""#);
        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);

        let result = generator.generate();
        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "type $Scalars");
    }

    #[test]
    fn test_generate_with_custom_scalars() {
        let (ctx, schema_index, document_index) = setup_codegen!(r#"scalar DateTime scalar JSON scalar URL"#, r#""#);
        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);

        let result = generator.generate();
        assert_ok!(&result);
        let source_buf = result.unwrap();

        assert_contains!(source_buf.code, "type $Scalars");
        assert_contains!(source_buf.code, "DateTime: unknown");
        assert_contains!(source_buf.code, "JSON: unknown");
        assert_contains!(source_buf.code, "URL: unknown");
    }

    #[test]
    fn test_generate_enum() {
        let (ctx, schema_index, document_index) = setup_codegen!(r#"enum Status { ACTIVE INACTIVE PENDING }"#, r#""#);
        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);

        let result = generator.generate();
        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "export type Status");
    }

    #[test]
    fn test_generate_input_object() {
        let (ctx, schema_index, document_index) =
            setup_codegen!(r#"input CreateUserInput { name: String! email: String }"#, r#""#);
        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);

        let result = generator.generate();
        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "export type CreateUserInput");
    }

    #[test]
    fn test_generate_operation() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"type Query { user(id: ID!): User } type User { id: ID! name: String! }"#,
            r#"query GetUser($id: ID!) { user(id: $id) { id name } }"#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "export type GetUser");
    }

    #[test]
    fn test_generate_fragment() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"type User { id: ID! name: String! email: String }"#,
            r#"fragment UserFields on User { id name email }"#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "export type UserFields");
    }

    #[test]
    fn test_typename_introspection_field() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"type Query { user: User } type User { id: ID! name: String! }"#,
            r#"query GetUser { user { __typename id name } }"#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "__typename: string");
    }

    #[test]
    fn test_typename_in_inline_fragment() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { search: SearchResult }
                union SearchResult = User | Post
                type User { id: ID! name: String! }
                type Post { id: ID! title: String! }
            "#,
            r#"
                query Search {
                    search {
                        ... on User { __typename id name }
                        ... on Post { __typename id title }
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, "__typename: string");
    }
}
