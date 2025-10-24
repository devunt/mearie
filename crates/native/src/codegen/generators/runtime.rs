use super::super::CodegenContext;
use crate::error::Result;
use crate::graphql::ast::{self as graphql_ast, *};
use crate::schema::{DocumentIndex, SchemaIndex};
use oxc_allocator::Box as OxcBox;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_codegen::Codegen;
use oxc_span::{Atom, SPAN, SourceType};

pub struct RuntimeGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a: 'b, 'b> RuntimeGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            schema,
            document,
        }
    }

    pub fn generate_document_nodes(&self) -> Result<Vec<Statement<'b>>> {
        let mut statements = Vec::new();
        let mut documents_info = Vec::new();

        for operation in self.document.operations() {
            if let Some(name) = operation.name {
                let original_source = self.get_operation_document_source(operation)?;
                let var_name = format!("{}$node", name.as_str());

                let stmt = self.generate_operation_document_node(name.as_str(), operation)?;
                statements.push(stmt);

                documents_info.push((var_name, original_source));
            }
        }

        for fragment in self.document.fragments() {
            let original_source = self.get_fragment_document_source(fragment)?;
            let var_name = format!("{}$node", fragment.name.as_str());

            let stmt = self.generate_fragment_document_node(fragment)?;
            statements.push(stmt);

            documents_info.push((var_name, original_source));
        }

        let document_map_stmt = self.create_document_map(&documents_info);
        statements.push(document_map_stmt);

        Ok(statements)
    }

    pub fn generate_module_augmentation(
        &self,
        enum_statements: oxc_allocator::Vec<'b, Statement<'b>>,
        public_statements: oxc_allocator::Vec<'b, Statement<'b>>,
    ) -> Result<String> {
        let mut outside_statements = self.ast.vec();

        for operation in self.document.operations() {
            if let Some(stmt) = self.create_type_alias(operation) {
                outside_statements.push(stmt);
            }
        }

        for fragment in self.document.fragments() {
            if let Some(stmt) = self.create_type_alias_for_fragment(fragment) {
                outside_statements.push(stmt);
            }
        }

        let mut module_statements = self.ast.vec();

        for enum_stmt in enum_statements {
            module_statements.push(enum_stmt);
        }

        for public_stmt in public_statements {
            module_statements.push(public_stmt);
        }

        for operation in self.document.operations() {
            if let Some(stmt) = self.create_function_overload(operation) {
                module_statements.push(stmt);
            }
        }

        for fragment in self.document.fragments() {
            if let Some(stmt) = self.create_function_overload_for_fragment(fragment) {
                module_statements.push(stmt);
            }
        }

        let module_body = self
            .ast
            .ts_module_declaration_body_module_block(SPAN, self.ast.vec(), module_statements);

        let module_name = self
            .ast
            .ts_module_declaration_name_string_literal(SPAN, "~graphql", None::<Atom>);

        let module_decl = self.ast.ts_module_declaration(
            SPAN,
            module_name,
            Some(module_body),
            TSModuleDeclarationKind::Module,
            true,
        );

        let declare_stmt = Statement::from(Declaration::TSModuleDeclaration(self.ast.alloc(module_decl)));

        let mut all_statements = self.ast.vec();
        for stmt in outside_statements {
            all_statements.push(stmt);
        }
        all_statements.push(declare_stmt);

        let program = self.ast.program(
            SPAN,
            SourceType::default(),
            "",
            self.ast.vec(),
            None,
            self.ast.vec(),
            all_statements,
        );

        Ok(Codegen::new().build(&program).code)
    }

    fn generate_operation_document_node(
        &self,
        name: &str,
        operation: &'b OperationDefinition<'b>,
    ) -> Result<Statement<'b>> {
        let body = self.get_operation_body(operation)?;
        let kind = match operation.operation_type {
            OperationType::Query => "query",
            OperationType::Mutation => "mutation",
            OperationType::Subscription => "subscription",
        };

        let root_type = self.get_root_type(operation.operation_type);
        let selections = self.flatten_selections(&operation.selection_set, root_type, vec![])?;

        let obj_expr = self.create_document_node_object(name, &body, kind, &selections);

        let var_name = format!("{}$node", name);
        Ok(self.create_export_const_statement(&var_name, obj_expr))
    }

    fn generate_fragment_document_node(&self, fragment: &'b FragmentDefinition<'b>) -> Result<Statement<'b>> {
        let body = self.get_fragment_body(fragment)?;
        let name = fragment.name.as_str();

        let selections = self.flatten_selections(&fragment.selection_set, fragment.type_condition.as_str(), vec![])?;

        let obj_expr = self.create_document_node_object(name, &body, "fragment", &selections);

        let var_name = format!("{}$node", name);
        Ok(self.create_export_const_statement(&var_name, obj_expr))
    }

    fn create_document_node_object(
        &self,
        name: &str,
        body: &str,
        kind: &str,
        selections: &[SelectionNodeData<'b>],
    ) -> Expression<'b> {
        let mut properties = self.ast.vec();

        properties.push(self.create_object_property("name", self.create_string_literal(name)));
        properties.push(self.create_object_property("body", self.create_string_literal(body)));
        properties.push(self.create_object_property("kind", self.create_string_literal(kind)));
        properties.push(self.create_object_property("selections", self.create_selections_array(selections)));

        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
    }

    fn create_export_const_statement(&self, name: &str, init: Expression<'b>) -> Statement<'b> {
        let name_str = self.ast.allocator.alloc_str(name);
        let id = self.ast.binding_pattern(
            self.ast.binding_pattern_kind_binding_identifier(SPAN, name_str),
            None::<OxcBox<TSTypeAnnotation>>,
            false,
        );

        let declarator = self
            .ast
            .variable_declarator(SPAN, VariableDeclarationKind::Const, id, Some(init), false);
        let mut declarators = self.ast.vec();
        declarators.push(declarator);

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

    fn create_object_property(&self, key: &str, value: Expression<'b>) -> ObjectPropertyKind<'b> {
        let key_str = self.ast.allocator.alloc_str(key);
        let property_key = PropertyKey::StaticIdentifier(self.ast.alloc(self.ast.identifier_name(SPAN, key_str)));

        let property = self
            .ast
            .object_property(SPAN, PropertyKind::Init, property_key, value, false, false, false);

        ObjectPropertyKind::ObjectProperty(self.ast.alloc(property))
    }

    fn create_string_key_property(&self, key: &str, value: Expression<'b>) -> ObjectPropertyKind<'b> {
        let key_str = self.ast.allocator.alloc_str(key);
        let string_literal = self.ast.string_literal(SPAN, key_str, None::<Atom>);
        let property_key = PropertyKey::StringLiteral(self.ast.alloc(string_literal));

        let property = self
            .ast
            .object_property(SPAN, PropertyKind::Init, property_key, value, false, false, false);

        ObjectPropertyKind::ObjectProperty(self.ast.alloc(property))
    }

    fn create_document_map(&self, documents_info: &[(String, String)]) -> Statement<'b> {
        let mut properties = self.ast.vec();

        for (var_name, body) in documents_info {
            let var_name_str = self.ast.allocator.alloc_str(var_name);
            let var_ref = Expression::Identifier(self.ast.alloc(self.ast.identifier_reference(SPAN, var_name_str)));

            let property = self.create_string_key_property(body, var_ref);
            properties.push(property);
        }

        let obj_expr = Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)));

        self.create_export_const_statement("documentMap", obj_expr)
    }

    fn create_string_literal(&self, value: &str) -> Expression<'b> {
        let value_str = self.ast.allocator.alloc_str(value);
        Expression::StringLiteral(self.ast.alloc(self.ast.string_literal(SPAN, value_str, None::<Atom>)))
    }

    fn create_number_literal(&self, value: f64) -> Expression<'b> {
        Expression::NumericLiteral(self.ast.alloc(self.ast.numeric_literal(
            SPAN,
            value,
            None::<Atom>,
            NumberBase::Decimal,
        )))
    }

    fn create_boolean_literal(&self, value: bool) -> Expression<'b> {
        Expression::BooleanLiteral(self.ast.alloc(self.ast.boolean_literal(SPAN, value)))
    }

    fn create_null_literal(&self) -> Expression<'b> {
        Expression::NullLiteral(self.ast.alloc(self.ast.null_literal(SPAN)))
    }

    fn create_selections_array(&self, selections: &[SelectionNodeData<'b>]) -> Expression<'b> {
        let mut elements = self.ast.vec();

        for selection in selections {
            let expr = self.selection_node_to_expression(selection);
            elements.push(ArrayExpressionElement::from(expr));
        }

        Expression::ArrayExpression(self.ast.alloc(self.ast.array_expression(SPAN, elements)))
    }

    fn selection_node_to_expression(&self, node: &SelectionNodeData<'b>) -> Expression<'b> {
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

                properties.push(self.create_object_property("kind", self.create_string_literal("Field")));
                properties.push(self.create_object_property("name", self.create_string_literal(name)));

                if let Some(type_name) = type_name {
                    properties.push(self.create_object_property("type", self.create_string_literal(type_name)));
                }

                if let Some(true) = array {
                    properties.push(self.create_object_property("array", self.create_boolean_literal(true)));
                }

                if let Some(alias) = alias {
                    properties.push(self.create_object_property("alias", self.create_string_literal(alias)));
                }

                if let Some(args) = args {
                    let mut args_props = self.ast.vec();
                    for arg in *args {
                        let arg_value_expr = self.graphql_value_to_arg_value_expression(&arg.value);
                        args_props.push(self.create_object_property(arg.name.as_str(), arg_value_expr));
                    }
                    let args_expr =
                        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, args_props)));
                    properties.push(self.create_object_property("args", args_expr));
                }

                if let Some(selections) = selections {
                    properties
                        .push(self.create_object_property("selections", self.create_selections_array(selections)));
                }

                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
            SelectionNodeData::FragmentSpread { name, selections } => {
                let mut properties = self.ast.vec();

                properties.push(self.create_object_property("kind", self.create_string_literal("FragmentSpread")));
                properties.push(self.create_object_property("name", self.create_string_literal(name)));
                properties.push(self.create_object_property("selections", self.create_selections_array(selections)));

                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
            SelectionNodeData::InlineFragment { on, selections } => {
                let mut properties = self.ast.vec();

                properties.push(self.create_object_property("kind", self.create_string_literal("InlineFragment")));
                properties.push(self.create_object_property("on", self.create_string_literal(on)));
                properties.push(self.create_object_property("selections", self.create_selections_array(selections)));

                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
        }
    }

    fn graphql_value_to_arg_value_expression(&self, value: &Value<'b>) -> Expression<'b> {
        let mut properties = self.ast.vec();

        match value {
            Value::Variable(name) => {
                properties.push(self.create_object_property("kind", self.create_string_literal("variable")));
                properties.push(self.create_object_property("name", self.create_string_literal(name.as_str())));
            }
            _ => {
                properties.push(self.create_object_property("kind", self.create_string_literal("literal")));
                properties.push(self.create_object_property("value", self.graphql_value_to_expression(value)));
            }
        }

        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
    }

    fn graphql_value_to_expression(&self, value: &Value<'b>) -> Expression<'b> {
        match value {
            Value::Variable(name) => {
                let mut properties = self.ast.vec();
                properties.push(self.create_object_property("kind", self.create_string_literal("variable")));
                properties.push(self.create_object_property("name", self.create_string_literal(name.as_str())));
                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
            Value::Int(s) => {
                let num = s.parse::<i64>().unwrap_or(0) as f64;
                self.create_number_literal(num)
            }
            Value::Float(s) => {
                let num = s.parse::<f64>().unwrap_or(0.0);
                self.create_number_literal(num)
            }
            Value::String(s) => self.create_string_literal(s),
            Value::Boolean(b) => self.create_boolean_literal(*b),
            Value::Null => self.create_null_literal(),
            Value::Enum(name) => self.create_string_literal(name.as_str()),
            Value::List(items) => {
                let mut elements = self.ast.vec();
                for item in items {
                    elements.push(ArrayExpressionElement::from(self.graphql_value_to_expression(item)));
                }
                Expression::ArrayExpression(self.ast.alloc(self.ast.array_expression(SPAN, elements)))
            }
            Value::Object(fields) => {
                let mut properties = self.ast.vec();
                for field in fields.iter() {
                    let field_value = self.graphql_value_to_expression(&field.value);
                    properties.push(self.create_object_property(field.name.as_str(), field_value));
                }
                Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
            }
        }
    }

    fn flatten_selections(
        &self,
        selection_set: &'b SelectionSet<'b>,
        parent_type: &str,
        _type_conditions: Vec<&str>,
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
        let name = field.name.as_str().to_string();
        let alias = field.alias.map(|a| a.as_str().to_string());

        let (type_name, array) = self.get_field_type_info(parent_type, field.name.as_str())?;

        let args = if field.arguments.is_empty() {
            None
        } else {
            Some(&field.arguments[..])
        };

        let selections = if field.selection_set.is_empty() {
            None
        } else {
            let field_type = self.get_named_type(&type_name);
            let nested = self.flatten_selections(&field.selection_set, &field_type, vec![])?;
            Some(nested)
        };

        Ok(SelectionNodeData::Field {
            name,
            type_name: Some(type_name),
            array: Some(array),
            alias,
            args,
            selections,
        })
    }

    fn process_fragment_spread(&self, spread: &'b FragmentSpread<'b>) -> Result<SelectionNodeData<'b>> {
        let fragment = self
            .document
            .get_fragment(spread.fragment_name.as_str())
            .ok_or_else(|| {
                crate::error::MearieError::codegen(format!("Fragment '{}' not found", spread.fragment_name.as_str()))
            })?;

        let selections = self.flatten_selections(&fragment.selection_set, fragment.type_condition.as_str(), vec![])?;

        Ok(SelectionNodeData::FragmentSpread {
            name: spread.fragment_name.as_str().to_string(),
            selections,
        })
    }

    fn process_inline_fragment(
        &self,
        inline: &'b InlineFragment<'b>,
        parent_type: &str,
    ) -> Result<SelectionNodeData<'b>> {
        let type_condition = inline.type_condition.map(|t| t.as_str()).unwrap_or(parent_type);

        let selections = self.flatten_selections(&inline.selection_set, type_condition, vec![])?;

        Ok(SelectionNodeData::InlineFragment {
            on: type_condition.to_string(),
            selections,
        })
    }

    fn get_field_type_info(&self, parent_type: &str, field_name: &str) -> Result<(String, bool)> {
        let field_def = self.schema.get_field(parent_type, field_name).ok_or_else(|| {
            crate::error::MearieError::codegen(format!("Field '{}' not found on type '{}'", field_name, parent_type))
        })?;
        let (type_name, is_array) = self.analyze_type(&field_def.typ);
        Ok((type_name.to_string(), is_array))
    }

    fn analyze_type(&self, typ: &Type<'b>) -> (&str, bool) {
        match typ {
            Type::Named(named) => (named.name.as_str(), false),
            Type::List(inner) => {
                let (name, _) = self.analyze_type(inner);
                (name, true)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => (named.name.as_str(), false),
                NonNullType::List(inner) => {
                    let (name, _) = self.analyze_type(inner);
                    (name, true)
                }
            },
        }
    }

    fn get_named_type(&self, type_name: &str) -> String {
        type_name.to_string()
    }

    fn get_root_type(&self, operation_type: OperationType) -> &str {
        match operation_type {
            OperationType::Query => "Query",
            OperationType::Mutation => "Mutation",
            OperationType::Subscription => "Subscription",
        }
    }

    fn get_operation_body(&self, operation: &OperationDefinition<'b>) -> Result<String> {
        let operation_source = self.get_operation_source(operation)?.trim().to_string();

        let mut fragment_names = std::collections::HashSet::new();
        self.collect_fragment_names(&operation.selection_set, &mut fragment_names);

        let mut all_fragment_names = fragment_names.clone();
        for fragment_name in &fragment_names {
            if let Some(fragment) = self.document.get_fragment(fragment_name) {
                self.collect_fragment_names(&fragment.selection_set, &mut all_fragment_names);
            }
        }

        let mut fragments_source = String::new();
        for fragment_name in &all_fragment_names {
            if let Some(fragment) = self.document.get_fragment(fragment_name) {
                let fragment_src = self.get_fragment_source(fragment)?.trim().to_string();
                if !fragments_source.is_empty() {
                    fragments_source.push_str("\n\n");
                }
                fragments_source.push_str(&fragment_src);
            }
        }

        if fragments_source.is_empty() {
            Ok(operation_source)
        } else {
            Ok(format!("{}\n\n{}", operation_source, fragments_source))
        }
    }

    fn get_operation_source(&self, operation: &OperationDefinition<'b>) -> Result<String> {
        for doc in self.document.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Operation(op)) = definition
                    && std::ptr::eq(op as *const _, operation as *const _)
                {
                    let source = self
                        .document
                        .get_source_for_document(doc)
                        .ok_or_else(|| crate::error::MearieError::codegen("Document source not found"))?;
                    return Ok(source.code.to_string());
                }
            }
        }
        Err(crate::error::MearieError::codegen("Operation source not found"))
    }

    fn get_operation_document_source(&self, operation: &OperationDefinition<'b>) -> Result<String> {
        for doc in self.document.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Operation(op)) = definition
                    && std::ptr::eq(op as *const _, operation as *const _)
                {
                    let source = self
                        .document
                        .get_source_for_document(doc)
                        .ok_or_else(|| crate::error::MearieError::codegen("Document source not found"))?;
                    return Ok(source.code.to_string());
                }
            }
        }
        Err(crate::error::MearieError::codegen(
            "Operation document source not found",
        ))
    }

    fn get_fragment_source(&self, fragment: &FragmentDefinition<'b>) -> Result<String> {
        for doc in self.document.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = definition
                    && std::ptr::eq(frag as *const _, fragment as *const _)
                {
                    let source = self
                        .document
                        .get_source_for_document(doc)
                        .ok_or_else(|| crate::error::MearieError::codegen("Document source not found"))?;
                    return Ok(source.code.to_string());
                }
            }
        }
        Err(crate::error::MearieError::codegen("Fragment source not found"))
    }

    fn get_fragment_document_source(&self, fragment: &FragmentDefinition<'b>) -> Result<String> {
        for doc in self.document.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = definition
                    && std::ptr::eq(frag as *const _, fragment as *const _)
                {
                    let source = self
                        .document
                        .get_source_for_document(doc)
                        .ok_or_else(|| crate::error::MearieError::codegen("Document source not found"))?;
                    return Ok(source.code.to_string());
                }
            }
        }
        Err(crate::error::MearieError::codegen("Fragment document source not found"))
    }

    fn collect_fragment_names(&self, selection_set: &SelectionSet<'b>, names: &mut std::collections::HashSet<String>) {
        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    if !field.selection_set.is_empty() {
                        self.collect_fragment_names(&field.selection_set, names);
                    }
                }
                Selection::FragmentSpread(spread) => {
                    names.insert(spread.fragment_name.as_str().to_string());
                }
                Selection::InlineFragment(inline) => {
                    self.collect_fragment_names(&inline.selection_set, names);
                }
            }
        }
    }

    fn get_fragment_body(&self, fragment: &FragmentDefinition<'b>) -> Result<String> {
        let fragment_source = self.get_fragment_source(fragment)?.trim().to_string();

        let mut fragment_names = std::collections::HashSet::new();
        self.collect_fragment_names(&fragment.selection_set, &mut fragment_names);

        let mut all_fragment_names = fragment_names.clone();
        for fragment_name in &fragment_names {
            if let Some(frag) = self.document.get_fragment(fragment_name) {
                self.collect_fragment_names(&frag.selection_set, &mut all_fragment_names);
            }
        }

        let mut other_fragments_source = String::new();
        for fragment_name in &all_fragment_names {
            if let Some(frag) = self.document.get_fragment(fragment_name) {
                let frag_src = self.get_fragment_source(frag)?.trim().to_string();
                if !other_fragments_source.is_empty() {
                    other_fragments_source.push_str("\n\n");
                }
                other_fragments_source.push_str(&frag_src);
            }
        }

        if other_fragments_source.is_empty() {
            Ok(fragment_source)
        } else {
            Ok(format!("{}\n\n{}", fragment_source, other_fragments_source))
        }
    }

    fn create_type_alias(&self, operation: &OperationDefinition<'b>) -> Option<Statement<'b>> {
        let operation_name = operation.name.as_ref()?.as_str();
        let operation_name_str = self.ast.allocator.alloc_str(operation_name);

        let import_type = self.create_import_type(operation_name);

        let ts_type_alias = self.ast.ts_type_alias_declaration(
            SPAN,
            self.ast.binding_identifier(SPAN, operation_name_str),
            None::<OxcBox<oxc_ast::ast::TSTypeParameterDeclaration>>,
            import_type,
            false,
        );

        Some(Statement::from(Declaration::TSTypeAliasDeclaration(
            self.ast.alloc(ts_type_alias),
        )))
    }

    fn create_type_alias_for_fragment(&self, fragment: &FragmentDefinition<'b>) -> Option<Statement<'b>> {
        let fragment_name = fragment.name.as_str();
        let fragment_name_str = self.ast.allocator.alloc_str(fragment_name);

        let import_type = self.create_import_type(fragment_name);

        let ts_type_alias = self.ast.ts_type_alias_declaration(
            SPAN,
            self.ast.binding_identifier(SPAN, fragment_name_str),
            None::<OxcBox<oxc_ast::ast::TSTypeParameterDeclaration>>,
            import_type,
            false,
        );

        Some(Statement::from(Declaration::TSTypeAliasDeclaration(
            self.ast.alloc(ts_type_alias),
        )))
    }

    fn create_function_overload(&self, operation: &OperationDefinition<'b>) -> Option<Statement<'b>> {
        let operation_name = operation.name.as_ref()?.as_str();
        let source = self.get_operation_source_for_module(operation)?;

        let return_type = self.create_simple_return_type(operation_name);
        let return_type_annotation = self.ast.ts_type_annotation(SPAN, return_type);

        let string_literal_type = self
            .ast
            .ts_type_literal_type(SPAN, self.ast.ts_literal_string_literal(SPAN, source, None::<Atom>));

        let type_annotation = self.ast.ts_type_annotation(SPAN, string_literal_type);

        let param_pattern = self.ast.binding_pattern(
            self.ast
                .binding_pattern_kind_binding_identifier(SPAN, Atom::from("document")),
            Some(type_annotation),
            false,
        );

        let param = self
            .ast
            .formal_parameter(SPAN, self.ast.vec(), param_pattern, None, false, false);

        let mut params = self.ast.vec();
        params.push(param);

        use oxc_ast::ast::{BindingRestElement, WithClause};

        let formal_params = self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::Signature,
            params,
            None::<OxcBox<BindingRestElement>>,
        );

        let function_id = self.ast.binding_identifier(SPAN, Atom::from("graphql"));

        let function = Function {
            span: SPAN,
            r#type: FunctionType::FunctionDeclaration,
            id: Some(function_id),
            generator: false,
            r#async: false,
            declare: false,
            type_parameters: None,
            this_param: None,
            params: self.ast.alloc(formal_params),
            return_type: Some(self.ast.alloc(return_type_annotation)),
            body: None,
            scope_id: std::cell::Cell::new(None),
            pife: false,
            pure: false,
        };

        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::FunctionDeclaration(self.ast.alloc(function))),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Some(Statement::ExportNamedDeclaration(self.ast.alloc(export_decl)))
    }

    fn create_function_overload_for_fragment(&self, fragment: &FragmentDefinition<'b>) -> Option<Statement<'b>> {
        let fragment_name = fragment.name.as_str();
        let source = self.get_fragment_source_for_module(fragment)?;

        let return_type = self.create_simple_fragment_return_type(fragment_name);
        let return_type_annotation = self.ast.ts_type_annotation(SPAN, return_type);

        let string_literal_type = self
            .ast
            .ts_type_literal_type(SPAN, self.ast.ts_literal_string_literal(SPAN, source, None::<Atom>));

        let type_annotation = self.ast.ts_type_annotation(SPAN, string_literal_type);

        let param_pattern = self.ast.binding_pattern(
            self.ast
                .binding_pattern_kind_binding_identifier(SPAN, Atom::from("document")),
            Some(type_annotation),
            false,
        );

        let param = self
            .ast
            .formal_parameter(SPAN, self.ast.vec(), param_pattern, None, false, false);

        let mut params = self.ast.vec();
        params.push(param);

        use oxc_ast::ast::{BindingRestElement, WithClause};

        let formal_params = self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::Signature,
            params,
            None::<OxcBox<BindingRestElement>>,
        );

        let function_id = self.ast.binding_identifier(SPAN, Atom::from("graphql"));

        let function = Function {
            span: SPAN,
            r#type: FunctionType::FunctionDeclaration,
            id: Some(function_id),
            generator: false,
            r#async: false,
            declare: false,
            type_parameters: None,
            this_param: None,
            params: self.ast.alloc(formal_params),
            return_type: Some(self.ast.alloc(return_type_annotation)),
            body: None,
            scope_id: std::cell::Cell::new(None),
            pife: false,
            pure: false,
        };

        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(Declaration::FunctionDeclaration(self.ast.alloc(function))),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );

        Some(Statement::ExportNamedDeclaration(self.ast.alloc(export_decl)))
    }

    fn get_operation_source_for_module(&self, operation: &OperationDefinition<'b>) -> Option<&'b str> {
        for doc in self.document.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Operation(op)) = definition
                    && std::ptr::eq(op as *const _, operation as *const _)
                {
                    return self.document.get_source_for_document(doc).map(|s| s.code);
                }
            }
        }
        None
    }

    fn get_fragment_source_for_module(&self, fragment: &FragmentDefinition<'b>) -> Option<&'b str> {
        for doc in self.document.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = definition
                    && std::ptr::eq(frag as *const _, fragment as *const _)
                {
                    return self.document.get_source_for_document(doc).map(|s| s.code);
                }
            }
        }
        None
    }

    fn create_import_type(&self, type_name: &str) -> oxc_ast::ast::TSType<'b> {
        use oxc_ast::ast::{ObjectExpression, TSTypeParameterInstantiation};

        let type_name_str = self.ast.allocator.alloc_str(type_name);
        let qualifier = self.ast.ts_import_type_qualifier_identifier(SPAN, type_name_str);

        self.ast.ts_type_import_type(
            SPAN,
            self.ast.ts_type_literal_type(
                SPAN,
                self.ast.ts_literal_string_literal(SPAN, "./types.d.ts", None::<Atom>),
            ),
            None::<OxcBox<ObjectExpression>>,
            Some(qualifier),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn create_simple_return_type(&self, operation_name: &str) -> oxc_ast::ast::TSType<'b> {
        use oxc_ast::ast::TSTypeParameterInstantiation;

        let operation_name_str = self.ast.allocator.alloc_str(operation_name);

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, operation_name_str),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn create_simple_fragment_return_type(&self, fragment_name: &str) -> oxc_ast::ast::TSType<'b> {
        use oxc_ast::ast::TSTypeParameterInstantiation;

        let fragment_name_str = self.ast.allocator.alloc_str(fragment_name);

        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, fragment_name_str),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }
}

enum SelectionNodeData<'b> {
    Field {
        name: String,
        type_name: Option<String>,
        array: Option<bool>,
        alias: Option<String>,
        args: Option<&'b [graphql_ast::Argument<'b>]>,
        selections: Option<Vec<SelectionNodeData<'b>>>,
    },
    FragmentSpread {
        name: String,
        selections: Vec<SelectionNodeData<'b>>,
    },
    InlineFragment {
        on: String,
        selections: Vec<SelectionNodeData<'b>>,
    },
}
