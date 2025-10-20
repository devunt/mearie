use super::super::{CodegenContext, Registry, Result};
use crate::ast::{self as graphql_ast, *};
use oxc_allocator::Box as OxcBox;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_span::{Atom, SPAN};

pub struct DocumentNodeGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    registry: &'a Registry<'b>,
}

impl<'a: 'b, 'b> DocumentNodeGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, registry: &'a Registry<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            registry,
        }
    }

    pub fn generate(&self) -> Result<Vec<Statement<'b>>> {
        let mut statements = Vec::new();
        let mut documents_info = Vec::new();

        for operation in self.registry.operations() {
            if let Some(name) = operation.name {
                let original_source = self.get_operation_document_source(operation)?;
                let var_name = format!("{}$node", name.as_str());

                let stmt = self.generate_operation_document_node(name.as_str(), operation)?;
                statements.push(stmt);

                documents_info.push((var_name, original_source));
            }
        }

        for fragment in self.registry.fragments() {
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
        let mut properties = self.ast.vec();

        properties.push(self.create_object_property("name", self.create_string_literal(&node.name)));

        if let Some(ref type_name) = node.type_name {
            properties.push(self.create_object_property("type", self.create_string_literal(type_name)));
        }

        if let Some(true) = node.array {
            properties.push(self.create_object_property("array", self.create_boolean_literal(true)));
        }

        if let Some(ref on) = node.on {
            let mut on_elements = self.ast.vec();
            for type_cond in on {
                on_elements.push(ArrayExpressionElement::from(self.create_string_literal(type_cond)));
            }
            let on_array = Expression::ArrayExpression(self.ast.alloc(self.ast.array_expression(SPAN, on_elements)));
            properties.push(self.create_object_property("on", on_array));
        }

        if let Some(ref alias) = node.alias {
            properties.push(self.create_object_property("alias", self.create_string_literal(alias)));
        }

        if let Some(args) = node.args {
            let mut args_props = self.ast.vec();
            for arg in args {
                let arg_value_expr = self.graphql_value_to_arg_value_expression(&arg.value);
                args_props.push(self.create_object_property(arg.name.as_str(), arg_value_expr));
            }
            let args_expr = Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, args_props)));
            properties.push(self.create_object_property("args", args_expr));
        }

        if let Some(ref selections) = node.selections {
            properties.push(self.create_object_property("selections", self.create_selections_array(selections)));
        }

        Expression::ObjectExpression(self.ast.alloc(self.ast.object_expression(SPAN, properties)))
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
        type_conditions: Vec<&str>,
    ) -> Result<Vec<SelectionNodeData<'b>>> {
        let mut result = Vec::new();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    let node = self.process_field(field, parent_type, &type_conditions)?;
                    result.push(node);
                }
                Selection::FragmentSpread(spread) => {
                    let nodes = self.process_fragment_spread(spread, &type_conditions)?;
                    result.extend(nodes);
                }
                Selection::InlineFragment(inline) => {
                    let nodes = self.process_inline_fragment(inline, parent_type, &type_conditions)?;
                    result.extend(nodes);
                }
            }
        }

        Ok(Self::merge_duplicate_fields(result))
    }

    fn process_field(
        &self,
        field: &'b Field<'b>,
        parent_type: &str,
        type_conditions: &[&str],
    ) -> Result<SelectionNodeData<'b>> {
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

        let on = if type_conditions.is_empty() {
            None
        } else {
            Some(type_conditions.iter().map(|s| s.to_string()).collect())
        };

        Ok(SelectionNodeData {
            name,
            type_name: Some(type_name),
            array: Some(array),
            on,
            alias,
            args,
            selections,
        })
    }

    fn process_fragment_spread(
        &self,
        spread: &'b FragmentSpread<'b>,
        type_conditions: &[&str],
    ) -> Result<Vec<SelectionNodeData<'b>>> {
        let fragment = self
            .registry
            .get_fragment(spread.fragment_name.as_str())
            .ok_or_else(|| crate::error::MearieError {
                kind: crate::error::ErrorKind::InvalidType {
                    message: format!("Fragment '{}' not found", spread.fragment_name.as_str()),
                },
                location: None,
            })?;

        let mut new_conditions = type_conditions.to_vec();
        new_conditions.push(fragment.type_condition.as_str());

        self.flatten_selections(
            &fragment.selection_set,
            fragment.type_condition.as_str(),
            new_conditions,
        )
    }

    fn process_inline_fragment(
        &self,
        inline: &'b InlineFragment<'b>,
        parent_type: &str,
        type_conditions: &[&str],
    ) -> Result<Vec<SelectionNodeData<'b>>> {
        let type_condition = inline.type_condition.map(|t| t.as_str()).unwrap_or(parent_type);

        let mut new_conditions = type_conditions.to_vec();
        if inline.type_condition.is_some() {
            new_conditions.push(type_condition);
        }

        self.flatten_selections(&inline.selection_set, type_condition, new_conditions)
    }

    fn get_field_type_info(&self, parent_type: &str, field_name: &str) -> Result<(String, bool)> {
        let field_type = self.registry.get_field_type(parent_type, field_name)?;
        let (type_name, is_array) = self.analyze_type(field_type);
        Ok((type_name.to_string(), is_array))
    }

    fn analyze_type(&self, typ: &Type<'b>) -> (&str, bool) {
        match typ {
            Type::Named(named) => (named.name, false),
            Type::List(inner) => {
                let (name, _) = self.analyze_type(inner);
                (name, true)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => (named.name, false),
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
            if let Some(fragment) = self.registry.get_fragment(fragment_name) {
                self.collect_fragment_names(&fragment.selection_set, &mut all_fragment_names);
            }
        }

        let mut fragments_source = String::new();
        for fragment_name in &all_fragment_names {
            if let Some(fragment) = self.registry.get_fragment(fragment_name) {
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
        for doc in self.registry.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Operation(op)) = definition
                    && std::ptr::eq(op as *const _, operation as *const _)
                {
                    let span = &op.span;
                    let start = span.start;
                    let end = span.end;
                    return Ok(doc.source.code[start..end].to_string());
                }
            }
        }
        Err(crate::error::MearieError {
            kind: crate::error::ErrorKind::InvalidType {
                message: "Operation source not found".to_string(),
            },
            location: None,
        })
    }

    fn get_operation_document_source(&self, operation: &OperationDefinition<'b>) -> Result<String> {
        for doc in self.registry.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Operation(op)) = definition
                    && std::ptr::eq(op as *const _, operation as *const _)
                {
                    return Ok(doc.source.code.to_string());
                }
            }
        }
        Err(crate::error::MearieError {
            kind: crate::error::ErrorKind::InvalidType {
                message: "Operation document source not found".to_string(),
            },
            location: None,
        })
    }

    fn get_fragment_source(&self, fragment: &FragmentDefinition<'b>) -> Result<String> {
        for doc in self.registry.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = definition
                    && std::ptr::eq(frag as *const _, fragment as *const _)
                {
                    let span = &frag.span;
                    let start = span.start;
                    let end = span.end;
                    return Ok(doc.source.code[start..end].to_string());
                }
            }
        }
        Err(crate::error::MearieError {
            kind: crate::error::ErrorKind::InvalidType {
                message: "Fragment source not found".to_string(),
            },
            location: None,
        })
    }

    fn get_fragment_document_source(&self, fragment: &FragmentDefinition<'b>) -> Result<String> {
        for doc in self.registry.documents() {
            for definition in &doc.definitions {
                if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = definition
                    && std::ptr::eq(frag as *const _, fragment as *const _)
                {
                    return Ok(doc.source.code.to_string());
                }
            }
        }
        Err(crate::error::MearieError {
            kind: crate::error::ErrorKind::InvalidType {
                message: "Fragment document source not found".to_string(),
            },
            location: None,
        })
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
            if let Some(frag) = self.registry.get_fragment(fragment_name) {
                self.collect_fragment_names(&frag.selection_set, &mut all_fragment_names);
            }
        }

        let mut other_fragments_source = String::new();
        for fragment_name in &all_fragment_names {
            if let Some(frag) = self.registry.get_fragment(fragment_name) {
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

    fn merge_duplicate_fields(nodes: Vec<SelectionNodeData<'b>>) -> Vec<SelectionNodeData<'b>> {
        let mut merged: std::collections::HashMap<String, SelectionNodeData<'b>> = std::collections::HashMap::new();

        for node in nodes {
            let key = node.alias.clone().unwrap_or_else(|| node.name.clone());

            if let Some(existing) = merged.get_mut(&key) {
                if let (Some(existing_on), Some(node_on)) = (&mut existing.on, node.on) {
                    for condition in node_on {
                        if !existing_on.contains(&condition) {
                            existing_on.push(condition);
                        }
                    }
                }
            } else {
                merged.insert(key, node);
            }
        }

        merged.into_values().collect()
    }
}

struct SelectionNodeData<'b> {
    name: String,
    type_name: Option<String>,
    array: Option<bool>,
    on: Option<Vec<String>>,
    alias: Option<String>,
    args: Option<&'b [graphql_ast::Argument<'b>]>,
    selections: Option<Vec<SelectionNodeData<'b>>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::Document;
    use crate::codegen::{CodegenContext, Registry};
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
    fn test_generate_simple_query_document_node() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let statements = result.unwrap();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_iter(statements),
        );
        let code = Codegen::new().build(&program).code;

        assert_contains!(code, "export const GetUser$node");
        assert_contains!(code, "name: \"GetUser\"");
        assert_contains!(code, "kind: \"query\"");
        assert_contains!(code, "selections:");
    }

    #[test]
    fn test_flatten_selections_with_fragment() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
                email: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }

            query GetUser($id: ID!) {
                user(id: $id) {
                    ...UserFields
                    email
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let statements = result.unwrap();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_iter(statements),
        );
        let code = Codegen::new().build(&program).code;

        assert_contains!(code, "export const GetUser$node");
        assert_contains!(code, "export const UserFields");
        assert_contains!(code, "kind: \"fragment\"");
    }

    #[test]
    fn test_inline_fragment_handling() {
        let schema = r#"
            interface Node {
                id: ID!
            }
            type User implements Node {
                id: ID!
                name: String!
            }
            type Post implements Node {
                id: ID!
                title: String!
            }
            type Query {
                node(id: ID!): Node
            }
        "#;

        let operations = r#"
            query GetNode($id: ID!) {
                node(id: $id) {
                    id
                    ... on User {
                        name
                    }
                    ... on Post {
                        title
                    }
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let statements = result.unwrap();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_iter(statements),
        );
        let code = Codegen::new().build(&program).code;

        assert_contains!(code, "export const GetNode");
        assert_contains!(code, "name: \"id\"");
        assert_contains!(code, "name: \"name\"");
        assert_contains!(code, "on: [\"User\"]");
        assert_contains!(code, "name: \"title\"");
        assert_contains!(code, "on: [\"Post\"]");
    }

    #[test]
    fn test_arguments_conversion() {
        let schema = r#"
            type Query {
                user(id: ID!, active: Boolean): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!, $active: Boolean) {
                user(id: $id, active: $active) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let statements = result.unwrap();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_iter(statements),
        );
        let code = Codegen::new().build(&program).code;

        assert_contains!(code, "args:");
        assert_contains!(code, "kind: \"variable\"");
        assert_contains!(code, "name: \"id\"");
    }

    #[test]
    fn test_output_format() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let statements = result.unwrap();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_iter(statements),
        );
        let _code = Codegen::new().build(&program).code;
    }

    #[test]
    fn test_operation_body_includes_fragments() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
                email: String
            }
        "#;

        let operations = r#"query GetUser($id: ID!) {
  user(id: $id) {
    ...UserFields
  }
}

fragment UserFields on User {
  id
  name
  email
}"#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let operations: Vec<_> = registry.operations().iter().collect();
        assert_eq!(operations.len(), 1);

        let operation = operations[0];
        let body = generator.get_operation_body(operation).unwrap();

        assert_contains!(body, "query GetUser");
        assert_contains!(body, "...UserFields");
        assert_contains!(body, "fragment UserFields on User");
    }

    #[test]
    fn test_operation_body_includes_nested_fragments() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
                profile: Profile
            }
            type Profile {
                bio: String
                avatar: String
            }
        "#;

        let operations = r#"query GetUser($id: ID!) {
  user(id: $id) {
    ...UserWithProfile
  }
}

fragment UserWithProfile on User {
  id
  name
  profile {
    ...ProfileFields
  }
}

fragment ProfileFields on Profile {
  bio
  avatar
}"#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let operations: Vec<_> = registry.operations().iter().collect();
        assert_eq!(operations.len(), 1);

        let operation = operations[0];
        let body = generator.get_operation_body(operation).unwrap();

        assert_contains!(body, "query GetUser");
        assert_contains!(body, "...UserWithProfile");
        assert_contains!(body, "fragment UserWithProfile on User");
        assert_contains!(body, "fragment ProfileFields on Profile");
    }

    #[test]
    fn test_document_map_generation() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }

            fragment UserFields on User {
                id
                name
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_source = parse_source(operations);
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = CodegenContext::new();
        let generator = DocumentNodeGenerator::new(&ctx, &registry);

        let result = generator.generate();
        assert_ok!(&result);
        let statements = result.unwrap();

        let ast = ctx.ast();
        let program = ast.program(
            SPAN,
            oxc_span::SourceType::default(),
            "",
            ast.vec(),
            None,
            ast.vec(),
            ast.vec_from_iter(statements),
        );
        let code = Codegen::new().build(&program).code;

        assert_contains!(code, "export const documentMap");
        assert_contains!(code, "GetUser$node");
        assert_contains!(code, "UserFields$node");
    }
}
