use super::super::constants::{MUTATION_ROOT, QUERY_ROOT, SUBSCRIPTION_ROOT};
use super::super::{CodegenContext, type_builder};
use crate::error::{MearieError, Result};
use crate::graphql::ast::*;
use crate::schema::{DocumentIndex, SchemaIndex};
use oxc_ast::AstBuilder;
use oxc_ast::ast::{Statement, TSType};
use oxc_span::SPAN;
use rustc_hash::{FxHashMap, FxHashSet};

pub struct OperationsGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> OperationsGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            schema,
            document,
        }
    }

    pub fn generate(&self) -> Result<Vec<Statement<'b>>> {
        let mut statements = Vec::new();

        for fragment in self.document.fragments() {
            let stmts = self.generate_fragment(fragment)?;
            for stmt in stmts {
                statements.push(stmt);
            }
        }

        for operation in self.document.operations() {
            if let Some(stmts) = self.generate_operation(operation)? {
                for stmt in stmts {
                    statements.push(stmt);
                }
            }
        }

        Ok(statements)
    }

    pub fn generate_operation(&self, operation: &OperationDefinition<'b>) -> Result<Option<Vec<Statement<'b>>>> {
        let Some(operation_name) = operation.name else {
            return Ok(None);
        };

        let operation_name_str = operation_name.as_str();
        let root_type = self.get_root_type(operation.operation_type);

        let data_type_name = format!("{}$data", operation_name_str);
        let ts_type = self.generate_selection_set(&operation.selection_set, root_type)?;
        let data_stmt = type_builder::export_type_alias(&self.ast, &data_type_name, ts_type);

        let vars_type_name = format!("{}$vars", operation_name_str);
        let vars_type = self.generate_variables(&operation.variable_definitions);
        let vars_stmt = type_builder::export_type_alias(&self.ast, &vars_type_name, vars_type);

        let data_type_name_str = self.ast.allocator.alloc_str(&data_type_name);
        let data_type_ref = type_builder::create_type_reference(&self.ast, data_type_name_str);

        let vars_type_name_str = self.ast.allocator.alloc_str(&vars_type_name);
        let vars_type_ref = type_builder::create_type_reference(&self.ast, vars_type_name_str);

        let kind = match operation.operation_type {
            OperationType::Query => "query",
            OperationType::Mutation => "mutation",
            OperationType::Subscription => "subscription",
        };

        let artifact_type = self.create_document_node_type(kind, operation_name_str, data_type_ref, vars_type_ref);
        let artifact_stmt = type_builder::export_type_alias(&self.ast, operation_name_str, artifact_type);

        Ok(Some(vec![data_stmt, vars_stmt, artifact_stmt]))
    }

    pub fn generate_fragment(&self, fragment: &FragmentDefinition<'b>) -> Result<Vec<Statement<'b>>> {
        let fragment_name = fragment.name.as_str();
        let type_condition = fragment.type_condition.as_str();

        let data_type_name = format!("{}$data", fragment_name);
        let ts_type = self.generate_selection_set(&fragment.selection_set, type_condition)?;
        let data_stmt = type_builder::export_type_alias(&self.ast, &data_type_name, ts_type);

        let key_type_name = format!("{}$key", fragment_name);
        let key_type = type_builder::create_fragment_refs_type(&self.ast, vec![fragment_name]);
        let key_stmt = type_builder::export_type_alias(&self.ast, &key_type_name, key_type);

        let data_type_name_str = self.ast.allocator.alloc_str(&data_type_name);
        let data_type_ref = type_builder::create_type_reference(&self.ast, data_type_name_str);
        let artifact_type = self.create_fragment_document_node_type("fragment", fragment_name, data_type_ref);
        let artifact_stmt = type_builder::export_type_alias(&self.ast, fragment_name, artifact_type);

        Ok(vec![data_stmt, key_stmt, artifact_stmt])
    }

    pub fn generate_selection_set(&self, selection_set: &SelectionSet<'b>, parent_type: &'b str) -> Result<TSType<'b>> {
        if selection_set.is_empty() {
            return Ok(type_builder::create_empty_object(&self.ast));
        }

        let mut field_map: FxHashMap<&'b str, (TSType<'b>, bool)> = FxHashMap::default();
        let mut inline_fragment_types: Vec<TSType<'b>> = Vec::new();
        let mut fragment_refs: Vec<&'b str> = Vec::new();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    let (field_name, field_type, is_optional) = self.generate_field(field, parent_type)?;
                    field_map.insert(field_name, (field_type, is_optional));
                }
                Selection::FragmentSpread(spread) => {
                    let fragment_name = spread.fragment_name.as_str();
                    self.document
                        .get_fragment(fragment_name)
                        .ok_or_else(|| MearieError::codegen(format!("Fragment '{}' not found", fragment_name)))?;
                    fragment_refs.push(fragment_name);
                }
                Selection::InlineFragment(inline_fragment) => {
                    let fragment_type = self.generate_inline_fragment(inline_fragment, parent_type)?;
                    inline_fragment_types.push(fragment_type);
                }
            }
        }

        let base_type = if !field_map.is_empty() {
            type_builder::create_type_literal_from_map_with_optional(&self.ast, field_map)
        } else {
            type_builder::create_empty_object(&self.ast)
        };

        let mut all_types = vec![base_type];
        all_types.extend(inline_fragment_types);

        if !fragment_refs.is_empty() {
            let fragment_refs_type = type_builder::create_fragment_refs_type(&self.ast, fragment_refs);
            all_types.push(fragment_refs_type);
        }

        if all_types.len() == 1 {
            Ok(all_types.into_iter().next().unwrap())
        } else {
            Ok(type_builder::create_intersection_type(&self.ast, all_types))
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

    fn create_document_node_type(
        &self,
        kind: &'b str,
        name: &'b str,
        data_type: TSType<'b>,
        vars_type: TSType<'b>,
    ) -> TSType<'b> {
        use oxc_span::Atom;

        let mut type_params = self.ast.vec();

        let kind_literal = self.ast.ts_literal_string_literal(SPAN, kind, None::<Atom>);
        let kind_type = self.ast.ts_type_literal_type(SPAN, kind_literal);
        type_params.push(kind_type);

        let name_literal = self.ast.ts_literal_string_literal(SPAN, name, None::<Atom>);
        let name_type = self.ast.ts_type_literal_type(SPAN, name_literal);
        type_params.push(name_type);

        type_params.push(data_type);
        type_params.push(vars_type);

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "Artifact"),
            Some(self.ast.ts_type_parameter_instantiation(SPAN, type_params)),
        )
    }

    fn create_fragment_document_node_type(&self, kind: &'b str, name: &'b str, data_type: TSType<'b>) -> TSType<'b> {
        use oxc_span::Atom;

        let mut type_params = self.ast.vec();

        let kind_literal = self.ast.ts_literal_string_literal(SPAN, kind, None::<Atom>);
        let kind_type = self.ast.ts_type_literal_type(SPAN, kind_literal);
        type_params.push(kind_type);

        let name_literal = self.ast.ts_literal_string_literal(SPAN, name, None::<Atom>);
        let name_type = self.ast.ts_type_literal_type(SPAN, name_literal);
        type_params.push(name_type);

        type_params.push(data_type);

        let never_type = self.ast.ts_type_never_keyword(SPAN);
        type_params.push(never_type);

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, "Artifact"),
            Some(self.ast.ts_type_parameter_instantiation(SPAN, type_params)),
        )
    }

    fn get_root_type(&self, operation_type: OperationType) -> &'b str {
        match operation_type {
            OperationType::Query => QUERY_ROOT,
            OperationType::Mutation => MUTATION_ROOT,
            OperationType::Subscription => SUBSCRIPTION_ROOT,
        }
    }

    fn generate_field(&self, field: &Field<'b>, parent_type: &'b str) -> Result<(&'b str, TSType<'b>, bool)> {
        let field_name = field.alias_or_name().as_str();
        let actual_field_name = field.name.as_str();

        self.validate_field_arguments(field, parent_type)?;

        let field_def = self.schema.get_field(parent_type, actual_field_name).ok_or_else(|| {
            MearieError::codegen(format!(
                "Field '{}' not found on type '{}'",
                actual_field_name, parent_type
            ))
        })?;
        let graphql_type = &field_def.typ;
        let is_optional = Self::is_nullable_type(graphql_type);

        let field_type = if !field.selection_set.is_empty() {
            let base_type = type_builder::map_type(&self.ast, graphql_type);
            let inner_type_name = Self::get_inner_type_name(graphql_type);
            let selection_type = self.generate_selection_set(&field.selection_set, inner_type_name)?;
            self.replace_innermost_type(&base_type, selection_type)
        } else {
            self.map_type_direct_scalar(graphql_type)
        };

        Ok((field_name, field_type, is_optional))
    }

    fn generate_inline_fragment(
        &self,
        inline_fragment: &InlineFragment<'b>,
        parent_type: &'b str,
    ) -> Result<TSType<'b>> {
        let type_condition = inline_fragment
            .type_condition
            .map(|name| name.as_str())
            .unwrap_or(parent_type);

        self.generate_selection_set(&inline_fragment.selection_set, type_condition)
    }

    fn get_inner_type_name(graphql_type: &Type<'b>) -> &'b str {
        match graphql_type {
            Type::Named(named) => named.name.as_str(),
            Type::List(inner) => Self::get_inner_type_name(inner),
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => named.name.as_str(),
                NonNullType::List(inner) => Self::get_inner_type_name(inner),
            },
        }
    }

    fn replace_innermost_type(&self, wrapper_type: &TSType<'b>, replacement: TSType<'b>) -> TSType<'b> {
        match wrapper_type {
            TSType::TSTypeReference(type_ref) => {
                let type_name = match &type_ref.type_name {
                    oxc_ast::ast::TSTypeName::IdentifierReference(ident) => ident.name.as_str(),
                    _ => return replacement,
                };

                match type_name {
                    "Nullable" => {
                        if let Some(ref params) = type_ref.type_arguments
                            && let Some(inner) = params.params.first()
                        {
                            let replaced_inner = self.replace_innermost_type(inner, replacement);
                            return type_builder::wrap_nullable(&self.ast, replaced_inner);
                        }
                        type_builder::wrap_nullable(&self.ast, replacement)
                    }
                    "List" => {
                        if let Some(ref params) = type_ref.type_arguments
                            && let Some(inner) = params.params.first()
                        {
                            let replaced_inner = self.replace_innermost_type(inner, replacement);
                            return type_builder::wrap_list(&self.ast, replaced_inner);
                        }
                        type_builder::wrap_list(&self.ast, replacement)
                    }
                    _ => replacement,
                }
            }
            _ => replacement,
        }
    }

    fn map_type_direct_scalar(&self, graphql_type: &Type<'b>) -> TSType<'b> {
        match graphql_type {
            Type::Named(named) => {
                let inner = self.map_named_type_direct(named);
                type_builder::wrap_nullable(&self.ast, inner)
            }
            Type::List(inner_type) => {
                let inner = self.map_type_direct_scalar(inner_type);
                let list = type_builder::wrap_list(&self.ast, inner);
                type_builder::wrap_nullable(&self.ast, list)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => self.map_named_type_direct(named),
                NonNullType::List(inner_type) => {
                    let inner = self.map_type_direct_scalar(inner_type);
                    type_builder::wrap_list(&self.ast, inner)
                }
            },
        }
    }

    fn map_named_type_direct(&self, named_type: &NamedType<'b>) -> TSType<'b> {
        if self.schema.is_scalar(named_type.name.as_str()) {
            type_builder::create_scalar_reference(&self.ast, named_type.name.as_str())
        } else {
            type_builder::create_type_reference(&self.ast, named_type.name.as_str())
        }
    }

    fn validate_field_arguments(&self, field: &Field<'b>, parent_type: &'b str) -> Result<()> {
        let field_name = field.name.as_str();
        let field_def = self.schema.get_field(parent_type, field_name).ok_or_else(|| {
            MearieError::codegen(format!("Field '{}' not found on type '{}'", field_name, parent_type))
        })?;

        let provided_args: FxHashSet<&str> = field.arguments.iter().map(|arg| arg.name.as_str()).collect();

        for provided_arg in &field.arguments {
            let arg_name = provided_arg.name.as_str();
            let arg_exists = field_def
                .arguments
                .iter()
                .any(|def_arg| def_arg.name.as_str() == arg_name);

            if !arg_exists {
                return Err(MearieError::codegen(format!(
                    "Unknown argument '{}' on field '{}' of type '{}'",
                    arg_name, field_name, parent_type
                )));
            }
        }

        for def_arg in &field_def.arguments {
            let arg_name = def_arg.name.as_str();
            let is_required = Self::is_non_null_type(&def_arg.typ);

            if is_required && !provided_args.contains(arg_name) {
                return Err(MearieError::codegen(format!(
                    "Missing required argument '{}' on field '{}' of type '{}'",
                    arg_name, field_name, parent_type
                )));
            }
        }

        Ok(())
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
        if self.schema.is_scalar(named_type.name.as_str()) {
            type_builder::create_scalar_reference(&self.ast, named_type.name.as_str())
        } else {
            type_builder::create_type_reference(&self.ast, named_type.name.as_str())
        }
    }

    fn is_non_null_type(typ: &Type<'b>) -> bool {
        matches!(typ, Type::NonNull(_))
    }

    fn is_nullable_type(typ: &Type<'b>) -> bool {
        !Self::is_non_null_type(typ)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup_codegen;
    use assertables::*;

    #[test]
    fn test_generate_simple_operation() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"type Query { user(id: ID!): User } type User { id: ID! name: String! }"#,
            r#"query GetUser($id: ID!) { user(id: $id) { id name } }"#
        );

        let generator = OperationsGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let statements = result.unwrap();
        assert_eq!(statements.len(), 3);
    }

    #[test]
    fn test_generate_fragment() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"type User { id: ID! name: String! email: String }"#,
            r#"fragment UserFields on User { id name email }"#
        );

        let generator = OperationsGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_ok!(&result);
        let statements = result.unwrap();
        assert_eq!(statements.len(), 3);
    }

    #[test]
    fn test_unknown_argument_error() {
        let (ctx, schema_index, document_index) = setup_codegen!(
            r#"type Query { user(id: ID!): User } type User { id: ID! name: String! }"#,
            r#"query GetUser { user(id: "123", unknownArg: "value") { id name } }"#
        );

        let generator = OperationsGenerator::new(&ctx, &schema_index, &document_index);
        let result = generator.generate();

        assert_err!(&result);
    }
}
