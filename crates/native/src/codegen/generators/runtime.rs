use super::super::CodegenContext;
use crate::error::{MearieError, Result};
use crate::graphql::ast::*;
use crate::schema::{DocumentIndex, SchemaIndex, TypeInfo};
use crate::source::SourceBuf;
use itertools::chain;
use oxc_allocator::Box as OxcBox;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_codegen::Codegen;
use oxc_span::{Atom, SPAN, SourceType};
use rustc_hash::FxHashSet;

type StmtVec<'b> = oxc_allocator::Vec<'b, Statement<'b>>;

pub struct RuntimeGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> RuntimeGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            schema,
            document,
        }
    }

    pub fn generate(&self) -> Result<SourceBuf> {
        let statements = self.ast.vec_from_iter(chain![
            self.gen_artifacts()?,
            std::iter::once(self.gen_schema()?),
            std::iter::once(self.stmt_graphql_function()),
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
            file_path: "graphql.js".to_string(),
            start_line: 1,
        })
    }

    fn gen_artifacts(&self) -> Result<StmtVec<'b>> {
        let operations: Result<Vec<_>> = self
            .document
            .operations()
            .filter_map(|operation| operation.name.map(|name| (name.as_str(), operation)))
            .map(|(name, operation)| self.create_operation_artifact(name, operation))
            .collect();

        let fragments: Result<Vec<_>> = self
            .document
            .fragments()
            .map(|fragment| self.create_fragment_artifact(fragment))
            .collect();

        let artifacts: Vec<_> = chain![operations?, fragments?].collect();
        let (statements, artifact_map): (Vec<_>, Vec<_>) = artifacts.into_iter().unzip();
        let artifact_map_stmt = self.stmt_artifact_map(&artifact_map);

        Ok(self
            .ast
            .vec_from_iter(chain![statements, std::iter::once(artifact_map_stmt)]))
    }

    fn create_operation_artifact(
        &self,
        name: &'b str,
        operation: &'b OperationDefinition<'b>,
    ) -> Result<(Statement<'b>, (&str, &str))> {
        let source = self
            .document
            .get_operation_source(operation)
            .ok_or_else(|| MearieError::codegen("Operation source not found"))?;

        let stmt = self.stmt_operation_artifact(name, operation)?;

        Ok((stmt, (name, source)))
    }

    fn create_fragment_artifact(&self, fragment: &'b FragmentDefinition<'b>) -> Result<(Statement<'b>, (&str, &str))> {
        let name = fragment.name.as_str();
        let source = self
            .document
            .get_fragment_source(fragment)
            .ok_or_else(|| MearieError::codegen("Fragment source not found"))?;

        let stmt = self.stmt_fragment_artifact(fragment)?;

        Ok((stmt, (name, source)))
    }

    fn stmt_operation_artifact(&self, name: &str, operation: &'b OperationDefinition<'b>) -> Result<Statement<'b>> {
        let body = self.get_operation_body(operation)?;

        let (kind, root_type) = match operation.operation_type {
            OperationType::Query => ("query", "Query"),
            OperationType::Mutation => ("mutation", "Mutation"),
            OperationType::Subscription => ("subscription", "Subscription"),
        };

        let selections = self.flatten_selections(&operation.selection_set, root_type)?;
        let obj_expr = self.expr_artifact(name, &body, kind, &selections);

        let var_name = format!("${}", name);

        Ok(self.stmt_export_const(&var_name, obj_expr))
    }

    fn stmt_fragment_artifact(&self, fragment: &'b FragmentDefinition<'b>) -> Result<Statement<'b>> {
        let body = self.get_fragment_body(fragment)?;
        let name = fragment.name.as_str();

        let selections = self.flatten_selections(&fragment.selection_set, fragment.type_condition.as_str())?;
        let obj_expr = self.expr_artifact(name, &body, "fragment", &selections);

        let var_name = format!("${}", name);

        Ok(self.stmt_export_const(&var_name, obj_expr))
    }

    fn expr_artifact(
        &self,
        name: &str,
        body: &str,
        kind: &str,
        selections: &[SelectionNodeData<'b>],
    ) -> Expression<'b> {
        let properties = self.ast.vec_from_array([
            self.prop_object("name", self.expr_string(name)),
            self.prop_object("body", self.expr_string(body)),
            self.prop_object("kind", self.expr_string(kind)),
            self.prop_object("selections", self.expr_selections_array(selections)),
        ]);

        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
    }

    fn stmt_export_const(&self, name: &str, init: Expression<'b>) -> Statement<'b> {
        let id = self.ast.binding_pattern(
            self.ast
                .binding_pattern_kind_binding_identifier(SPAN, self.ast.atom(name)),
            None::<OxcBox<TSTypeAnnotation>>,
            false,
        );

        let declarator = self
            .ast
            .variable_declarator(SPAN, VariableDeclarationKind::Const, id, Some(init), false);
        let declarators = self.ast.vec1(declarator);

        let var_decl = self
            .ast
            .variable_declaration(SPAN, VariableDeclarationKind::Const, declarators, false);

        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::VariableDeclaration(self.ast.alloc(var_decl))),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Statement::ExportNamedDeclaration(self.ast.alloc(export_decl))
    }

    fn prop_object(&self, key: &str, value: Expression<'b>) -> ObjectPropertyKind<'b> {
        let property_key =
            PropertyKey::StaticIdentifier(self.ast.alloc(self.ast.identifier_name(SPAN, self.ast.atom(key))));

        let property = self
            .ast
            .object_property(SPAN, PropertyKind::Init, property_key, value, false, false, false);

        ObjectPropertyKind::ObjectProperty(self.ast.alloc(property))
    }

    fn stmt_artifact_map(&self, artifacts: &[(&str, &str)]) -> Statement<'b> {
        let properties = self.ast.vec_from_iter(artifacts.iter().map(|(name, source)| {
            let var_name = format!("${}", name);
            let var_ref = Expression::Identifier(
                self.ast
                    .alloc(self.ast.identifier_reference(SPAN, self.ast.atom(&var_name))),
            );

            let string_literal = self.ast.string_literal(SPAN, self.ast.atom(source), None::<Atom>);
            let property_key = PropertyKey::StringLiteral(self.ast.alloc(string_literal));

            let property =
                self.ast
                    .object_property(SPAN, PropertyKind::Init, property_key, var_ref, false, false, false);

            ObjectPropertyKind::ObjectProperty(self.ast.alloc(property))
        }));

        let obj_expr = Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)));

        self.stmt_export_const("artifactMap", obj_expr)
    }

    fn stmt_graphql_function(&self) -> Statement<'b> {
        let param_pattern = self.ast.binding_pattern(
            self.ast
                .binding_pattern_kind_binding_identifier(SPAN, Atom::from("artifact")),
            None::<OxcBox<TSTypeAnnotation>>,
            false,
        );
        let param = self
            .ast
            .formal_parameter(SPAN, self.ast.vec(), param_pattern, None, false, false);
        let formal_params = self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::ArrowFormalParameters,
            self.ast.vec1(param),
            None::<OxcBox<BindingRestElement>>,
        );

        let artifact_map_expr =
            Expression::Identifier(self.ast.alloc(self.ast.identifier_reference(SPAN, "artifactMap")));
        let artifact_expr = Expression::Identifier(self.ast.alloc(self.ast.identifier_reference(SPAN, "artifact")));
        let member_expr = self
            .ast
            .member_expression_computed(SPAN, artifact_map_expr, artifact_expr, false);

        let expression_body = member_expr.into();
        let function_body = FunctionBody {
            span: SPAN,
            directives: self.ast.vec(),
            statements: self.ast.vec1(Statement::ExpressionStatement(
                self.ast.alloc(self.ast.expression_statement(SPAN, expression_body)),
            )),
        };

        let arrow_function = self.ast.arrow_function_expression(
            SPAN,
            true,
            false,
            None::<OxcBox<TSTypeParameterDeclaration>>,
            self.ast.alloc(formal_params),
            None::<OxcBox<TSTypeAnnotation>>,
            self.ast.alloc(function_body),
        );

        let var_declarator = self.ast.variable_declarator(
            SPAN,
            VariableDeclarationKind::Const,
            self.ast.binding_pattern(
                self.ast
                    .binding_pattern_kind_binding_identifier(SPAN, Atom::from("graphql")),
                None::<OxcBox<TSTypeAnnotation>>,
                false,
            ),
            Some(Expression::ArrowFunctionExpression(self.ast.alloc(arrow_function))),
            false,
        );

        let var_decl = self.ast.variable_declaration(
            SPAN,
            VariableDeclarationKind::Const,
            self.ast.vec1(var_declarator),
            false,
        );

        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::VariableDeclaration(self.ast.alloc(var_decl))),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Statement::ExportNamedDeclaration(self.ast.alloc(export_decl))
    }

    fn gen_schema(&self) -> Result<Statement<'b>> {
        let mut entity_properties = self.ast.vec();

        for (type_name, type_info) in self.schema.types() {
            if !matches!(type_info, TypeInfo::Object(_)) {
                continue;
            }

            if Some(type_name) == self.schema.query_type()
                || Some(type_name) == self.schema.mutation_type()
                || Some(type_name) == self.schema.subscription_type()
            {
                continue;
            }

            if let Some(key_field) = self.determine_key_field(type_name) {
                let key_fields_array_elements =
                    self.ast.vec1(ArrayExpressionElement::from(self.expr_string(key_field)));
                let key_fields_array = Expression::ArrayExpression(
                    self.ast.alloc(self.ast.array_expression(SPAN, key_fields_array_elements)),
                );

                let entity_meta_props = self.ast.vec1(self.prop_object("keyFields", key_fields_array));
                let entity_meta_obj =
                    Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, entity_meta_props)));

                let type_name_literal = self.ast.string_literal(SPAN, self.ast.atom(type_name), None::<Atom>);
                let property_key = PropertyKey::StringLiteral(self.ast.alloc(type_name_literal));

                let property = self.ast.object_property(
                    SPAN,
                    PropertyKind::Init,
                    property_key,
                    entity_meta_obj,
                    false,
                    false,
                    false,
                );

                entity_properties.push(ObjectPropertyKind::ObjectProperty(self.ast.alloc(property)));
            }
        }

        let entities_obj = Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, entity_properties)));
        let schema_props = self.ast.vec1(self.prop_object("entities", entities_obj));
        let schema_obj = Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, schema_props)));

        Ok(self.stmt_export_const("schema", schema_obj))
    }

    fn expr_string(&self, value: &str) -> Expression<'b> {
        Expression::StringLiteral(
            self.ast
                .alloc(self.ast.string_literal(SPAN, self.ast.atom(value), None::<Atom>)),
        )
    }

    fn expr_number(&self, value: f64) -> Expression<'b> {
        Expression::NumericLiteral(self.ast.alloc(self.ast.numeric_literal(
            SPAN,
            value,
            None::<Atom>,
            NumberBase::Decimal,
        )))
    }

    fn expr_boolean(&self, value: bool) -> Expression<'b> {
        Expression::BooleanLiteral(self.ast.alloc(self.ast.boolean_literal(SPAN, value)))
    }

    fn expr_null(&self) -> Expression<'b> {
        Expression::NullLiteral(self.ast.alloc(self.ast.null_literal(SPAN)))
    }

    fn expr_selections_array(&self, selections: &[SelectionNodeData<'b>]) -> Expression<'b> {
        let elements = self.ast.vec_from_iter(
            selections
                .iter()
                .map(|selection| ArrayExpressionElement::from(self.expr_from_selection_node(selection))),
        );

        Expression::ArrayExpression(self.ast.alloc(self.ast.array_expression(SPAN, elements)))
    }

    fn expr_from_selection_node(&self, node: &SelectionNodeData<'b>) -> Expression<'b> {
        match node {
            SelectionNodeData::Field {
                name,
                type_name,
                array,
                alias,
                args,
                selections,
            } => {
                let mut properties = self.ast.vec();

                properties.push(self.prop_object("kind", self.expr_string("Field")));
                properties.push(self.prop_object("name", self.expr_string(name)));

                if let Some(type_name) = type_name {
                    properties.push(self.prop_object("type", self.expr_string(type_name)));
                }

                if array.unwrap_or(false) {
                    properties.push(self.prop_object("array", self.expr_boolean(true)));
                }

                if let Some(alias) = alias {
                    properties.push(self.prop_object("alias", self.expr_string(alias)));
                }

                if let Some(args) = args {
                    let args_props = self.ast.vec_from_iter(
                        args.iter()
                            .map(|arg| self.prop_object(arg.name.as_str(), self.expr_arg_value(&arg.value))),
                    );
                    let args_expr =
                        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, args_props)));
                    properties.push(self.prop_object("args", args_expr));
                }

                if let Some(selections) = selections {
                    properties.push(self.prop_object("selections", self.expr_selections_array(selections)));
                }

                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
            SelectionNodeData::FragmentSpread { name, selections } => {
                let properties = self.ast.vec_from_array([
                    self.prop_object("kind", self.expr_string("FragmentSpread")),
                    self.prop_object("name", self.expr_string(name)),
                    self.prop_object("selections", self.expr_selections_array(selections)),
                ]);

                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
            SelectionNodeData::InlineFragment { on, selections } => {
                let properties = self.ast.vec_from_array([
                    self.prop_object("kind", self.expr_string("InlineFragment")),
                    self.prop_object("on", self.expr_string(on)),
                    self.prop_object("selections", self.expr_selections_array(selections)),
                ]);

                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
        }
    }

    fn expr_variable_object(&self, name: &str) -> Expression<'b> {
        let properties = self.ast.vec_from_array([
            self.prop_object("kind", self.expr_string("variable")),
            self.prop_object("name", self.expr_string(name)),
        ]);
        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
    }

    fn expr_arg_value(&self, value: &Value<'b>) -> Expression<'b> {
        match value {
            Value::Variable(name) => self.expr_variable_object(name.as_str()),
            _ => {
                let properties = self.ast.vec_from_array([
                    self.prop_object("kind", self.expr_string("literal")),
                    self.prop_object("value", self.expr_from_graphql_value(value)),
                ]);
                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
        }
    }

    fn expr_from_graphql_value(&self, value: &Value<'b>) -> Expression<'b> {
        match value {
            Value::Variable(name) => self.expr_variable_object(name.as_str()),
            Value::Int(s) => {
                let num = s.parse::<i64>().unwrap_or(0) as f64;
                self.expr_number(num)
            }
            Value::Float(s) => {
                let num = s.parse::<f64>().unwrap_or(0.0);
                self.expr_number(num)
            }
            Value::String(s) => self.expr_string(s),
            Value::Boolean(b) => self.expr_boolean(*b),
            Value::Null => self.expr_null(),
            Value::Enum(name) => self.expr_string(name.as_str()),
            Value::List(items) => {
                let elements = self.ast.vec_from_iter(
                    items
                        .iter()
                        .map(|item| ArrayExpressionElement::from(self.expr_from_graphql_value(item))),
                );
                Expression::ArrayExpression(self.ast.alloc(self.ast.array_expression(SPAN, elements)))
            }
            Value::Object(fields) => {
                let properties =
                    self.ast.vec_from_iter(fields.iter().map(|field| {
                        self.prop_object(field.name.as_str(), self.expr_from_graphql_value(&field.value))
                    }));
                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
        }
    }

    fn flatten_selections(
        &self,
        selection_set: &'b SelectionSet<'b>,
        parent_type: &str,
    ) -> Result<Vec<SelectionNodeData<'b>>> {
        let mut result = Vec::new();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    let node = self.process_field(field, parent_type)?;
                    result.push(node);
                }
                Selection::FragmentSpread(spread) => {
                    let node = self.process_fragment_spread(spread)?;
                    result.push(node);
                }
                Selection::InlineFragment(inline) => {
                    let node = self.process_inline_fragment(inline, parent_type)?;
                    result.push(node);
                }
            }
        }

        Ok(result)
    }

    fn process_field(&self, field: &'b Field<'b>, parent_type: &str) -> Result<SelectionNodeData<'b>> {
        let name = field.name.as_str();
        let alias = field.alias.map(|a| a.as_str());

        if name.starts_with("__") {
            return Ok(SelectionNodeData::Field {
                name,
                type_name: None,
                array: None,
                alias,
                args: None,
                selections: None,
            });
        }

        let field_def = self
            .schema
            .get_field(parent_type, name)
            .ok_or_else(|| MearieError::codegen(format!("Field '{}' not found on type '{}'", name, parent_type)))?;

        let type_name = field_def.typ.innermost_type().to_string();
        let is_array = field_def.typ.is_list();

        let args = if field.arguments.is_empty() {
            None
        } else {
            Some(&field.arguments[..])
        };

        let selections = if field.selection_set.is_empty() {
            None
        } else {
            let nested = self.flatten_selections(&field.selection_set, &type_name)?;
            Some(nested)
        };

        Ok(SelectionNodeData::Field {
            name,
            type_name: Some(type_name),
            array: Some(is_array),
            alias,
            args,
            selections,
        })
    }

    fn process_fragment_spread(&self, spread: &'b FragmentSpread<'b>) -> Result<SelectionNodeData<'b>> {
        let fragment = self
            .document
            .get_fragment(spread.fragment_name.as_str())
            .ok_or_else(|| MearieError::codegen(format!("Fragment '{}' not found", spread.fragment_name.as_str())))?;

        let selections = self.flatten_selections(&fragment.selection_set, fragment.type_condition.as_str())?;

        Ok(SelectionNodeData::FragmentSpread {
            name: spread.fragment_name.as_str(),
            selections,
        })
    }

    fn process_inline_fragment(
        &self,
        inline: &'b InlineFragment<'b>,
        parent_type: &str,
    ) -> Result<SelectionNodeData<'b>> {
        let type_condition = inline.type_condition.map(|t| t.as_str()).unwrap_or(parent_type);

        let selections = self.flatten_selections(&inline.selection_set, type_condition)?;

        Ok(SelectionNodeData::InlineFragment {
            on: type_condition.to_string(),
            selections,
        })
    }

    fn get_operation_body(&self, operation: &OperationDefinition<'b>) -> Result<String> {
        let source = self
            .document
            .get_operation_source(operation)
            .ok_or_else(|| MearieError::codegen("Operation source not found"))?
            .trim();

        self.get_body_with_fragments(source, &operation.selection_set)
    }

    fn get_fragment_body(&self, fragment: &FragmentDefinition<'b>) -> Result<String> {
        let source = self
            .document
            .get_fragment_source(fragment)
            .ok_or_else(|| MearieError::codegen("Fragment source not found"))?
            .trim();

        self.get_body_with_fragments(source, &fragment.selection_set)
    }

    fn get_body_with_fragments(&self, source: &str, selection_set: &SelectionSet<'b>) -> Result<String> {
        let fragment_names = self.collect_fragment_names(selection_set);

        let mut fragment_sources = vec![source];

        for fragment_name in &fragment_names {
            if let Some(fragment) = self.document.get_fragment(fragment_name) {
                let fragment_source = self
                    .document
                    .get_fragment_source(fragment)
                    .ok_or_else(|| MearieError::codegen("Fragment source not found"))?
                    .trim();

                fragment_sources.push(fragment_source);
            }
        }

        Ok(fragment_sources.join("\n\n"))
    }

    fn collect_fragment_names(&self, selection_set: &SelectionSet<'b>) -> FxHashSet<&'b str> {
        let mut names = FxHashSet::default();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    if !field.selection_set.is_empty() {
                        names.extend(self.collect_fragment_names(&field.selection_set));
                    }
                }
                Selection::FragmentSpread(spread) => {
                    let fragment_name = spread.fragment_name.as_str();
                    if names.insert(fragment_name)
                        && let Some(fragment) = self.document.get_fragment(fragment_name)
                    {
                        names.extend(self.collect_fragment_names(&fragment.selection_set));
                    }
                }
                Selection::InlineFragment(inline) => {
                    names.extend(self.collect_fragment_names(&inline.selection_set));
                }
            }
        }

        names
    }

    fn determine_key_field(&self, type_name: &str) -> Option<&'static str> {
        const KEY_FIELD_NAMES: [&str; 3] = ["id", "_id", "uuid"];

        let fields = self.schema.get_object_fields(type_name)?;

        for &key_name in &KEY_FIELD_NAMES {
            if let Some(&field_def) = fields.get(key_name) {
                let is_nullable = field_def.typ.is_nullable();
                let is_list = field_def.typ.is_list();
                let innermost_type = field_def.typ.innermost_type().as_str();
                let is_scalar = self.schema.is_scalar(innermost_type);

                if !is_nullable && !is_list && is_scalar {
                    return Some(key_name);
                }
            }
        }

        None
    }
}

enum SelectionNodeData<'b> {
    Field {
        name: &'b str,
        type_name: Option<String>,
        array: Option<bool>,
        alias: Option<&'b str>,
        args: Option<&'b [crate::graphql::ast::Argument<'b>]>,
        selections: Option<Vec<SelectionNodeData<'b>>>,
    },
    FragmentSpread {
        name: &'b str,
        selections: Vec<SelectionNodeData<'b>>,
    },
    InlineFragment {
        on: String,
        selections: Vec<SelectionNodeData<'b>>,
    },
}
