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
    ctx: &'b CodegenContext,
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> TypesGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self {
            ctx,
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
                let typ = match self.ctx.config().scalar_map.get(*name) {
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
        let mut properties = self.ast.vec();

        let scalar_map = &self.ctx.config().scalar_map;
        let scalars_type_literal = if scalar_map.is_empty() {
            self.type_empty_object()
        } else {
            let scalars_properties = self
                .ast
                .vec_from_iter(scalar_map.iter().map(|(scalar_name, type_name)| {
                    let typ = self.type_ref(type_name);
                    self.ast.ts_signature_property_signature(
                        SPAN,
                        false,
                        false,
                        false,
                        self.ast.property_key_static_identifier(SPAN, scalar_name.as_str()),
                        Some(self.ast.ts_type_annotation(SPAN, typ)),
                    )
                }));

            self.ast.ts_type_type_literal(SPAN, scalars_properties)
        };

        properties.push(self.ast.ts_signature_property_signature(
            SPAN,
            false,
            false,
            false,
            self.ast.property_key_static_identifier(SPAN, "scalars"),
            Some(self.ast.ts_type_annotation(SPAN, scalars_type_literal)),
        ));

        let type_literal = self.ast.ts_type_type_literal(SPAN, properties);

        let params = self
            .ast
            .ts_type_parameter_instantiation(SPAN, self.ast.vec1(type_literal));

        let type_name_str = self.ast.allocator.alloc_str("$SchemaMeta");
        let schema_type = self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, type_name_str),
            Some(params),
        );

        self.stmt_export_type("$Schema", schema_type)
    }

    fn export_enum(&self, enum_def: &EnumTypeDefinition<'b>) -> Statement<'b> {
        let type_name = enum_def.name.as_str();

        let types: Vec<TSType<'b>> = enum_def
            .values
            .iter()
            .map(|value_def| {
                let value_name = value_def.value.as_str();
                let string_literal = self.ast.ts_literal_string_literal(SPAN, value_name, None);
                self.ast.ts_type_literal_type(SPAN, string_literal)
            })
            .collect();

        let union_type = self.create_union(types);
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

        let mut shared_fields: Vec<&Field<'b>> = Vec::new();
        let mut inline_fragments: Vec<(&'b str, &InlineFragment<'b>)> = Vec::new();
        let mut fragment_refs: Vec<&'b str> = Vec::new();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    shared_fields.push(field);
                }
                Selection::FragmentSpread(spread) => {
                    let fragment_name = spread.fragment_name.as_str();
                    self.document
                        .get_fragment(fragment_name)
                        .ok_or_else(|| MearieError::codegen(format!("Fragment '{}' not found", fragment_name)))?;
                    fragment_refs.push(fragment_name);
                }
                Selection::InlineFragment(inline) => {
                    let type_condition = inline.type_condition.map(|name| name.as_str()).unwrap_or(parent_type);
                    inline_fragments.push((type_condition, inline));
                }
            }
        }

        self.type_combine_selections(parent_type, shared_fields, inline_fragments, fragment_refs)
    }

    fn field_type_info(&self, field: &Field<'b>, parent_type: &'b str) -> Result<(&'b str, TSType<'b>, bool)> {
        let field_name = field.alias_or_name().as_str();
        let actual_field_name = field.name.as_str();

        if actual_field_name.starts_with("__") {
            let introspection_type = match actual_field_name {
                "__typename" => {
                    let literal = self.ast.ts_literal_string_literal(SPAN, parent_type, None);
                    self.ast.ts_type_literal_type(SPAN, literal)
                }
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

    fn build_fields_type(&self, fields: &[&Field<'b>], parent_type: &'b str) -> Result<TSType<'b>> {
        let mut field_map = FxHashMap::default();
        for field in fields {
            let (name, typ, optional) = self.field_type_info(field, parent_type)?;
            field_map.insert(name, (typ, optional));
        }
        Ok(self.type_object(field_map))
    }

    fn create_union(&self, types: Vec<TSType<'b>>) -> TSType<'b> {
        if types.is_empty() {
            self.ast.ts_type_never_keyword(SPAN)
        } else if types.len() == 1 {
            types.into_iter().next().unwrap()
        } else {
            self.ast.ts_type_union_type(SPAN, self.ast.vec_from_iter(types))
        }
    }

    fn create_intersection(&self, types: Vec<TSType<'b>>) -> TSType<'b> {
        if types.is_empty() {
            self.type_empty_object()
        } else if types.len() == 1 {
            types.into_iter().next().unwrap()
        } else {
            let parenthesized_types: Vec<TSType<'b>> = types
                .into_iter()
                .map(|typ| {
                    if matches!(typ, TSType::TSUnionType(_)) {
                        self.ast.ts_type_parenthesized_type(SPAN, typ)
                    } else {
                        typ
                    }
                })
                .collect();

            self.ast
                .ts_type_intersection_type(SPAN, self.ast.vec_from_iter(parenthesized_types))
        }
    }

    fn type_combine_selections(
        &self,
        parent_type: &'b str,
        shared_fields: Vec<&Field<'b>>,
        inline_fragments: Vec<(&'b str, &InlineFragment<'b>)>,
        fragment_refs: Vec<&'b str>,
    ) -> Result<TSType<'b>> {
        let possible_types: Vec<&'b str> = if self.schema.is_abstract(parent_type) {
            self.schema.get_possible_types(parent_type).collect()
        } else {
            vec![parent_type]
        };

        let branch_types: Result<Vec<TSType<'b>>> = possible_types
            .iter()
            .map(|&type_condition| {
                let mut branch_parts = Vec::new();

                if !shared_fields.is_empty() {
                    branch_parts.push(self.build_fields_type(&shared_fields, type_condition)?);
                }

                if let Some((_, inline_fragment)) = inline_fragments.iter().find(|(t, _)| *t == type_condition) {
                    branch_parts.push(self.type_selection_set(&inline_fragment.selection_set, type_condition)?);
                }

                Ok(self.create_intersection(branch_parts))
            })
            .collect();

        let union_type = self.create_union(branch_types?);

        let mut final_parts = vec![union_type];
        if !fragment_refs.is_empty() {
            final_parts.push(self.type_fragment_refs(fragment_refs));
        }

        Ok(self.create_intersection(final_parts))
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
        let union_types: Vec<TSType<'b>> = fragment_names
            .iter()
            .map(|name| {
                let literal = self.ast.ts_literal_string_literal(SPAN, *name, None::<Atom>);
                self.ast.ts_type_literal_type(SPAN, literal)
            })
            .collect();

        let value_type = self.create_union(union_types);

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
        assert_contains!(source_buf.code, "__typename: \"User\"");
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
        assert_contains!(source_buf.code, "__typename: \"User\"");
        assert_contains!(source_buf.code, "__typename: \"Post\"");
    }

    #[test]
    fn test_union_type_generates_union_operator() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { search: SearchResult }
                union SearchResult = Movie | Person
                type Movie { id: ID! title: String! }
                type Person { id: ID! name: String! }
            "#,
            r#"
                query Search {
                    search {
                        ... on Movie { __typename id title }
                        ... on Person { __typename id name }
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, " | ");
        assert_contains!(source_buf.code, "__typename: \"Movie\"");
        assert_contains!(source_buf.code, "__typename: \"Person\"");
    }

    #[test]
    fn test_union_with_shared_typename_field() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { search: SearchResult }
                union SearchResult = Movie | Person
                type Movie { id: ID! title: String! }
                type Person { id: ID! name: String! }
            "#,
            r#"
                query Search {
                    search {
                        __typename
                        ... on Movie { id title }
                        ... on Person { id name }
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();
        assert_contains!(source_buf.code, " | ");
        assert_contains!(source_buf.code, "\"Movie\"");
        assert_contains!(source_buf.code, "\"Person\"");
    }

    #[test]
    fn test_interface_with_inline_fragments_generates_union() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { node: Node }
                interface Node { id: ID! }
                type User implements Node { id: ID! name: String! }
                type Post implements Node { id: ID! title: String! }
            "#,
            r#"
                query GetNode {
                    node {
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
        assert_contains!(source_buf.code, " | ");
        assert_contains!(source_buf.code, "__typename: \"User\"");
        assert_contains!(source_buf.code, "__typename: \"Post\"");
    }

    #[test]
    fn test_union_with_top_level_typename_generates_discriminated_union() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { author: Author! }
                union Author = User | Anonymous
                type User { id: ID! name: String! email: String! }
                type Anonymous { id: ID! ipAddress: String! }
            "#,
            r#"
                query GetAuthor {
                    author {
                        __typename
                        ... on User { id name email }
                        ... on Anonymous { id ipAddress }
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();

        assert_contains!(source_buf.code, "__typename: \"User\"");
        assert_contains!(source_buf.code, "__typename: \"Anonymous\"");
        assert_contains!(source_buf.code, " | ");
    }

    #[test]
    fn test_union_with_typename_only_generates_all_branches() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { search: SearchResult! }
                union SearchResult = Movie | Person
                type Movie { id: ID! title: String! }
                type Person { id: ID! name: String! }
            "#,
            r#"
                query Search {
                    search {
                        __typename
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();

        assert_contains!(source_buf.code, "__typename: \"Movie\"");
        assert_contains!(source_buf.code, "__typename: \"Person\"");
        assert_contains!(source_buf.code, " | ");
    }

    #[test]
    fn test_union_with_partial_inline_fragment_generates_empty_branch() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { search: SearchResult! }
                union SearchResult = Movie | Person
                type Movie { id: ID! title: String! }
                type Person { id: ID! name: String! }
            "#,
            r#"
                query Search {
                    search {
                        ... on Movie { __typename }
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();

        assert_contains!(source_buf.code, "__typename: \"Movie\"");
        assert_contains!(source_buf.code, " | ");
        assert_contains!(source_buf.code, "{}");
    }

    #[test]
    fn test_union_with_fragment_refs_has_proper_precedence() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"
                type Query { search: SearchResult! }
                union SearchResult = Movie | Person
                type Movie { id: ID! }
                type Person { id: ID! }
            "#,
            r#"
                fragment MovieFields on Movie { id }

                query Search {
                    search {
                        __typename
                        ...MovieFields
                    }
                }
            "#
        );

        let generator = TypesGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let source_buf = result.unwrap();

        // Verify union is properly parenthesized when intersected with fragment refs
        assert_contains!(source_buf.code, "__typename: \"Movie\"");
        assert_contains!(source_buf.code, "__typename: \"Person\"");
        assert_contains!(source_buf.code, "$FragmentRefs<\"MovieFields\">");

        // Verify parentheses are present: (...) & $FragmentRefs
        assert_contains!(source_buf.code, "}) & $FragmentRefs");
    }
}
