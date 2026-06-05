use crate::error::MearieError;
use crate::error::location::Location;
use crate::source::SourceBuf;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ExtractResult {
    pub sources: Vec<SourceBuf>,
    pub errors: Vec<MearieError>,
}

struct Extractor<'a> {
    source: &'a SourceBuf,
    fragment_bindings: HashMap<String, String>,
    unresolved_fragment_imports: HashMap<String, String>,
    sources: Vec<SourceBuf>,
    errors: Vec<MearieError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TypedGraphqlKind {
    Query,
    Mutation,
    Subscription,
    Fragment,
}

impl TypedGraphqlKind {
    fn from_method(method: &str) -> Option<Self> {
        match method {
            "query" => Some(Self::Query),
            "mutation" => Some(Self::Mutation),
            "subscription" => Some(Self::Subscription),
            "fragment" => Some(Self::Fragment),
            _ => None,
        }
    }

    fn as_graphql_keyword(self) -> &'static str {
        match self {
            Self::Query => "query",
            Self::Mutation => "mutation",
            Self::Subscription => "subscription",
            Self::Fragment => "fragment",
        }
    }
}

struct TypedGraphqlVariableDefinition {
    name: String,
    type_ref: String,
    default_value: Option<String>,
    directives: Vec<String>,
}

struct TypedGraphqlVariableType {
    type_ref: String,
    default_value: Option<String>,
    directives: Vec<String>,
    state: TypedGraphqlVariableTypeState,
    has_directives: bool,
}

struct TypedGraphqlCallbackObject<'a> {
    object: &'a ObjectExpression<'a>,
    variable_reference_parameter: Option<&'a str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TypedGraphqlVariableTypeState {
    Base,
    NonNullNamed,
    List,
    NonNullList,
    Optional,
    Terminal,
}

impl TypedGraphqlVariableTypeState {
    fn is_final(self) -> bool {
        !matches!(self, Self::Base)
    }
}

#[derive(Debug, Default, Clone)]
struct TypedGraphqlLocalExport {
    local_name: String,
    exported_name: String,
}

#[derive(Debug, Default, Clone)]
struct TypedGraphqlImportBinding {
    source: String,
    imported_name: String,
    local_name: String,
}

#[derive(Debug, Default, Clone)]
struct TypedGraphqlReExport {
    source: String,
    imported_name: String,
    exported_name: String,
}

#[derive(Debug, Default, Clone)]
struct TypedGraphqlFileFragmentRegistry {
    local_fragment_bindings: HashMap<String, String>,
    local_exports: Vec<TypedGraphqlLocalExport>,
    import_bindings: Vec<TypedGraphqlImportBinding>,
    re_exports: Vec<TypedGraphqlReExport>,
    export_all_sources: Vec<String>,
}

impl TypedGraphqlFileFragmentRegistry {
    fn merge(&mut self, other: Self) {
        self.local_fragment_bindings.extend(other.local_fragment_bindings);
        self.local_exports.extend(other.local_exports);
        self.import_bindings.extend(other.import_bindings);
        self.re_exports.extend(other.re_exports);
        self.export_all_sources.extend(other.export_all_sources);
    }
}

#[derive(Debug, Default, Clone)]
struct TypedGraphqlResolvedFragmentBindings {
    fragment_bindings: HashMap<String, String>,
    unresolved_fragment_imports: HashMap<String, String>,
}

struct TypedGraphqlFragmentBindingCollector {
    registry: TypedGraphqlFileFragmentRegistry,
}

impl TypedGraphqlFragmentBindingCollector {
    fn new() -> Self {
        Self {
            registry: TypedGraphqlFileFragmentRegistry::default(),
        }
    }

    fn into_registry(self) -> TypedGraphqlFileFragmentRegistry {
        self.registry
    }

    fn binding_identifier_name<'b>(&self, pattern: &'b BindingPattern<'b>) -> Option<&'b str> {
        match pattern {
            BindingPattern::BindingIdentifier(identifier) => Some(identifier.name.as_str()),
            _ => None,
        }
    }

    fn typed_fragment_call_name<'b>(&self, expr: &'b Expression<'b>) -> Option<&'b str> {
        let Expression::CallExpression(call) = self.strip_expression_wrappers(expr) else {
            return None;
        };

        let Expression::StaticMemberExpression(member) = self.strip_expression_wrappers(&call.callee) else {
            return None;
        };

        if !matches!(self.strip_expression_wrappers(&member.object), Expression::Identifier(identifier) if identifier.name == "graphql")
            || member.property.name != "fragment"
        {
            return None;
        }

        call.arguments
            .first()
            .and_then(Argument::as_expression)
            .and_then(|argument| match self.strip_expression_wrappers(argument) {
                Expression::StringLiteral(value) => Some(value.value.as_str()),
                _ => None,
            })
    }

    fn module_export_name<'b>(&self, name: &ModuleExportName<'b>) -> &'b str {
        match name {
            ModuleExportName::IdentifierName(identifier) => identifier.name.as_str(),
            ModuleExportName::IdentifierReference(identifier) => identifier.name.as_str(),
            ModuleExportName::StringLiteral(literal) => literal.value.as_str(),
        }
    }

    fn collect_exported_declaration_bindings(&mut self, declaration: &Declaration) {
        let Declaration::VariableDeclaration(declaration) = declaration else {
            return;
        };

        for declarator in &declaration.declarations {
            if let Some(binding_name) = self.binding_identifier_name(&declarator.id) {
                self.registry.local_exports.push(TypedGraphqlLocalExport {
                    local_name: binding_name.to_string(),
                    exported_name: binding_name.to_string(),
                });
            }
        }
    }

    fn strip_expression_wrappers<'b>(&self, expr: &'b Expression<'b>) -> &'b Expression<'b> {
        match expr.without_parentheses() {
            Expression::TSAsExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSSatisfiesExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSTypeAssertion(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSNonNullExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSInstantiationExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            expr => expr,
        }
    }
}

impl<'a> Visit<'a> for TypedGraphqlFragmentBindingCollector {
    fn visit_import_declaration(&mut self, node: &ImportDeclaration<'a>) {
        if node.import_kind.is_type() {
            return;
        }

        let Some(specifiers) = &node.specifiers else {
            return;
        };

        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };

            if specifier.import_kind.is_type() {
                continue;
            }

            self.registry.import_bindings.push(TypedGraphqlImportBinding {
                source: node.source.value.as_str().to_string(),
                imported_name: self.module_export_name(&specifier.imported).to_string(),
                local_name: specifier.local.name.as_str().to_string(),
            });
        }

        walk::walk_import_declaration(self, node);
    }

    fn visit_export_named_declaration(&mut self, node: &ExportNamedDeclaration<'a>) {
        if node.export_kind.is_type() {
            return;
        }

        if let Some(declaration) = &node.declaration {
            self.collect_exported_declaration_bindings(declaration);
        }

        if let Some(source) = &node.source {
            for specifier in &node.specifiers {
                if specifier.export_kind.is_type() {
                    continue;
                }

                self.registry.re_exports.push(TypedGraphqlReExport {
                    source: source.value.as_str().to_string(),
                    imported_name: self.module_export_name(&specifier.local).to_string(),
                    exported_name: self.module_export_name(&specifier.exported).to_string(),
                });
            }
        } else {
            for specifier in &node.specifiers {
                if specifier.export_kind.is_type() {
                    continue;
                }

                self.registry.local_exports.push(TypedGraphqlLocalExport {
                    local_name: self.module_export_name(&specifier.local).to_string(),
                    exported_name: self.module_export_name(&specifier.exported).to_string(),
                });
            }
        }

        walk::walk_export_named_declaration(self, node);
    }

    fn visit_export_all_declaration(&mut self, node: &ExportAllDeclaration<'a>) {
        if node.export_kind.is_type() || node.exported.is_some() {
            return;
        }

        self.registry
            .export_all_sources
            .push(node.source.value.as_str().to_string());

        walk::walk_export_all_declaration(self, node);
    }

    fn visit_variable_declarator(&mut self, node: &VariableDeclarator<'a>) {
        if node.kind == VariableDeclarationKind::Const
            && let Some(binding_name) = self.binding_identifier_name(&node.id)
            && let Some(init) = &node.init
            && let Some(fragment_name) = self.typed_fragment_call_name(init)
        {
            self.registry
                .local_fragment_bindings
                .insert(binding_name.to_string(), fragment_name.to_string());
        }

        walk::walk_variable_declarator(self, node);
    }
}

struct TypedGraphqlCrossFileFragmentResolver<'a> {
    files: &'a HashMap<String, TypedGraphqlFileFragmentRegistry>,
}

impl<'a> TypedGraphqlCrossFileFragmentResolver<'a> {
    fn new(files: &'a HashMap<String, TypedGraphqlFileFragmentRegistry>) -> Self {
        Self { files }
    }

    fn resolve_file_bindings(&self, file_path: &str) -> TypedGraphqlResolvedFragmentBindings {
        let Some(file) = self.files.get(file_path) else {
            return TypedGraphqlResolvedFragmentBindings::default();
        };

        let mut resolved = TypedGraphqlResolvedFragmentBindings {
            fragment_bindings: file.local_fragment_bindings.clone(),
            unresolved_fragment_imports: HashMap::new(),
        };

        for import in &file.import_bindings {
            match self.resolve_imported_fragment(file_path, import) {
                Ok(fragment_name) => {
                    resolved
                        .fragment_bindings
                        .insert(import.local_name.clone(), fragment_name);
                }
                Err(message) => {
                    resolved
                        .unresolved_fragment_imports
                        .insert(import.local_name.clone(), message);
                }
            }
        }

        resolved
    }

    fn resolve_imported_fragment(&self, file_path: &str, import: &TypedGraphqlImportBinding) -> Result<String, String> {
        let Some(resolved_path) = self.resolve_module_path(file_path, &import.source) else {
            return Err(format!(
                "import '{{ {} }}' from '{}' did not match any document file in the cross-file typed GraphQL fragment registry",
                import.imported_name, import.source
            ));
        };

        let mut seen = HashSet::new();
        self.resolve_exported_fragment(&resolved_path, &import.imported_name, &mut seen)
            .ok_or_else(|| {
                format!(
                    "module '{}' does not export a typed GraphQL fragment binding named '{}'",
                    import.source, import.imported_name
                )
            })
    }

    fn resolve_exported_fragment(
        &self,
        file_path: &str,
        export_name: &str,
        seen: &mut HashSet<(String, String)>,
    ) -> Option<String> {
        if !seen.insert((file_path.to_string(), export_name.to_string())) {
            return None;
        }

        let file = self.files.get(file_path)?;

        for local_export in &file.local_exports {
            if local_export.exported_name == export_name
                && let Some(fragment_name) =
                    self.resolve_local_fragment_binding(file_path, &local_export.local_name, seen)
            {
                return Some(fragment_name);
            }
        }

        for re_export in &file.re_exports {
            if re_export.exported_name != export_name {
                continue;
            }

            let Some(resolved_path) = self.resolve_module_path(file_path, &re_export.source) else {
                continue;
            };

            if let Some(fragment_name) = self.resolve_exported_fragment(&resolved_path, &re_export.imported_name, seen)
            {
                return Some(fragment_name);
            }
        }

        for source in &file.export_all_sources {
            let Some(resolved_path) = self.resolve_module_path(file_path, source) else {
                continue;
            };

            if let Some(fragment_name) = self.resolve_exported_fragment(&resolved_path, export_name, seen) {
                return Some(fragment_name);
            }
        }

        None
    }

    fn resolve_local_fragment_binding(
        &self,
        file_path: &str,
        local_name: &str,
        seen: &mut HashSet<(String, String)>,
    ) -> Option<String> {
        let file = self.files.get(file_path)?;

        if let Some(fragment_name) = file.local_fragment_bindings.get(local_name) {
            return Some(fragment_name.clone());
        }

        for import in &file.import_bindings {
            if import.local_name != local_name {
                continue;
            }

            let Some(resolved_path) = self.resolve_module_path(file_path, &import.source) else {
                continue;
            };

            if let Some(fragment_name) = self.resolve_exported_fragment(&resolved_path, &import.imported_name, seen) {
                return Some(fragment_name);
            }
        }

        None
    }

    fn resolve_module_path(&self, file_path: &str, module_source: &str) -> Option<String> {
        module_resolution_candidates(file_path, module_source)?
            .into_iter()
            .find(|candidate| self.files.contains_key(candidate))
    }
}

const TYPED_GRAPHQL_MODULE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs", "vue", "svelte", "astro",
];

fn module_resolution_candidates(file_path: &str, module_source: &str) -> Option<Vec<String>> {
    if !module_source.starts_with('.') && !module_source.starts_with('/') {
        return None;
    }

    let base = if module_source.starts_with('/') {
        normalize_file_path(module_source)
    } else {
        let parent = Path::new(file_path).parent().unwrap_or_else(|| Path::new(""));
        normalize_file_path(parent.join(module_source).to_string_lossy().as_ref())
    };

    let mut candidates = Vec::new();
    push_unique_candidate(&mut candidates, base.clone());

    let extension = Path::new(&base).extension().and_then(|extension| extension.to_str());
    if extension.is_none() {
        for extension in TYPED_GRAPHQL_MODULE_EXTENSIONS {
            push_unique_candidate(&mut candidates, format!("{}.{}", base, extension));
        }
    } else if matches!(extension, Some("js" | "jsx" | "mjs" | "cjs"))
        && let Some((stem, _)) = base.rsplit_once('.')
    {
        for extension in ["ts", "tsx", "mts", "cts"] {
            push_unique_candidate(&mut candidates, format!("{}.{}", stem, extension));
        }
    }

    for extension in TYPED_GRAPHQL_MODULE_EXTENSIONS {
        push_unique_candidate(&mut candidates, format!("{}/index.{}", base, extension));
    }

    Some(candidates)
}

fn push_unique_candidate(candidates: &mut Vec<String>, candidate: String) {
    if !candidates.iter().any(|existing| existing == &candidate) {
        candidates.push(candidate);
    }
}

fn normalize_file_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let is_absolute = path.starts_with('/');
    let mut parts = Vec::new();

    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if matches!(parts.last(), Some(previous) if *previous != "..") {
                    parts.pop();
                } else if !is_absolute {
                    parts.push(part);
                }
            }
            part => parts.push(part),
        }
    }

    let normalized = parts.join("/");
    if is_absolute {
        format!("/{}", normalized)
    } else if normalized.is_empty() {
        ".".to_string()
    } else {
        normalized
    }
}

fn registry_file_path(source: &SourceBuf) -> String {
    normalize_file_path(source.importable_file_path.as_deref().unwrap_or(&source.file_path))
}

impl<'a> Extractor<'a> {
    fn new(source: &'a SourceBuf, resolved_fragment_bindings: TypedGraphqlResolvedFragmentBindings) -> Self {
        Self {
            source,
            fragment_bindings: resolved_fragment_bindings.fragment_bindings,
            unresolved_fragment_imports: resolved_fragment_bindings.unresolved_fragment_imports,
            sources: Vec::new(),
            errors: Vec::new(),
        }
    }

    fn calculate_line_number(&self, offset: u32) -> u32 {
        let offset = offset as usize;
        if offset > self.source.code.len() {
            return 1;
        }

        self.source.code[..offset].bytes().filter(|&b| b == b'\n').count() as u32 + 1
    }

    fn extract_template_literal(&self, template: &TemplateLiteral, line: u32) -> Result<String, MearieError> {
        if !template.expressions.is_empty() {
            return Err(MearieError::extraction(
                "Template literal contains interpolation which is not allowed in GraphQL",
            )
            .at(Location {
                file_path: self.source.file_path.clone(),
                line,
                column: None,
            }));
        }

        let mut result = String::new();
        for quasi in &template.quasis {
            result.push_str(&quasi.value.raw);
        }

        Ok(result)
    }

    fn extraction_error(&self, line: u32, message: impl Into<String>) -> MearieError {
        MearieError::extraction(message).at(Location {
            file_path: self.source.file_path.clone(),
            line,
            column: None,
        })
    }

    fn lower_typed_graphql_call(
        &self,
        node: &CallExpression,
        kind: TypedGraphqlKind,
        line: u32,
    ) -> Result<String, MearieError> {
        match kind {
            TypedGraphqlKind::Fragment => self.lower_typed_graphql_fragment(node, line),
            TypedGraphqlKind::Query | TypedGraphqlKind::Mutation | TypedGraphqlKind::Subscription => {
                self.lower_typed_graphql_operation(node, kind, line)
            }
        }
    }

    fn lower_typed_graphql_operation(
        &self,
        node: &CallExpression,
        kind: TypedGraphqlKind,
        line: u32,
    ) -> Result<String, MearieError> {
        if node.arguments.len() != 2 {
            return Err(self.extraction_error(
                line,
                "graphql operation helpers must be called as graphql.query(name, spec)",
            ));
        }

        let name = self.expect_string_argument(&node.arguments[0], line, "Operation name must be a string literal")?;
        let spec = self.expect_object_argument(&node.arguments[1], line, "Operation spec must be an object literal")?;
        let variables = self.lower_variables(self.object_property(spec, "variables")?, line)?;
        let directives = self.lower_directives_callback(self.object_property(spec, "directives")?, line)?;
        let select = self
            .object_property(spec, "select")?
            .ok_or_else(|| self.extraction_error(line, "Operation spec must include a select callback"))?;
        let selection = self.expect_selection_callback(select, line)?;

        let mut out = String::new();
        write!(out, "{} {}", kind.as_graphql_keyword(), name).unwrap();
        self.write_variable_definitions(&mut out, &variables);
        self.write_directives(&mut out, &directives);
        writeln!(out, " {{").unwrap();
        self.write_selection_set(
            &mut out,
            selection.object,
            1,
            line,
            selection.variable_reference_parameter,
        )?;
        writeln!(out, "}}").unwrap();

        Ok(out)
    }

    fn lower_typed_graphql_fragment(&self, node: &CallExpression, line: u32) -> Result<String, MearieError> {
        if node.arguments.len() != 3 {
            return Err(self.extraction_error(
                line,
                "graphql.fragment must be called as graphql.fragment(name, typeName, spec)",
            ));
        }

        let name = self.expect_string_argument(&node.arguments[0], line, "Fragment name must be a string literal")?;
        let type_name = self.expect_string_argument(
            &node.arguments[1],
            line,
            "Fragment type condition must be a string literal",
        )?;
        let spec = self.expect_object_argument(&node.arguments[2], line, "Fragment spec must be an object literal")?;
        let variables = self.lower_variables(self.object_property(spec, "variables")?, line)?;
        let directives = self.lower_directives_callback(self.object_property(spec, "directives")?, line)?;
        let select = self
            .object_property(spec, "select")?
            .ok_or_else(|| self.extraction_error(line, "Fragment spec must include a select callback"))?;
        let selection = self.expect_selection_callback(select, line)?;

        let mut out = String::new();
        write!(out, "fragment {}", name).unwrap();
        self.write_variable_definitions(&mut out, &variables);
        write!(out, " on {}", type_name).unwrap();
        self.write_directives(&mut out, &directives);
        writeln!(out, " {{").unwrap();
        self.write_selection_set(
            &mut out,
            selection.object,
            1,
            line,
            selection.variable_reference_parameter,
        )?;
        writeln!(out, "}}").unwrap();

        Ok(out)
    }

    fn expect_string_argument<'b>(
        &self,
        argument: &'b Argument,
        line: u32,
        message: &str,
    ) -> Result<&'b str, MearieError> {
        let Some(expr) = argument.as_expression() else {
            return Err(self.extraction_error(line, message));
        };

        self.expect_string_expr(expr, line, message)
    }

    fn expect_string_expr<'b>(&self, expr: &'b Expression, line: u32, message: &str) -> Result<&'b str, MearieError> {
        match self.strip_expression_wrappers(expr) {
            Expression::StringLiteral(value) => Ok(value.value.as_str()),
            _ => Err(self.extraction_error(line, message)),
        }
    }

    fn expect_object_argument<'b>(
        &self,
        argument: &'b Argument,
        line: u32,
        message: &str,
    ) -> Result<&'b ObjectExpression<'b>, MearieError> {
        let Some(expr) = argument.as_expression() else {
            return Err(self.extraction_error(line, message));
        };

        self.expect_object_expr(expr, line, message)
    }

    fn expect_object_expr<'b>(
        &self,
        expr: &'b Expression,
        line: u32,
        message: &str,
    ) -> Result<&'b ObjectExpression<'b>, MearieError> {
        match self.strip_expression_wrappers(expr) {
            Expression::ObjectExpression(object) => Ok(object),
            _ => Err(self.extraction_error(line, message)),
        }
    }

    fn expect_array_expr<'b>(
        &self,
        expr: &'b Expression,
        line: u32,
        message: &str,
    ) -> Result<&'b ArrayExpression<'b>, MearieError> {
        match self.strip_expression_wrappers(expr) {
            Expression::ArrayExpression(array) => Ok(array),
            _ => Err(self.extraction_error(line, message)),
        }
    }

    fn array_items<'b>(
        &self,
        array: &'b ArrayExpression<'b>,
        line: u32,
        message: &str,
    ) -> Result<Vec<&'b Expression<'b>>, MearieError> {
        let mut items = Vec::new();

        for item in &array.elements {
            let Some(item) = item.as_expression() else {
                return Err(self.extraction_error(line, message));
            };
            items.push(item);
        }

        Ok(items)
    }

    fn strip_expression_wrappers<'b>(&self, expr: &'b Expression<'b>) -> &'b Expression<'b> {
        match expr.without_parentheses() {
            Expression::TSAsExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSSatisfiesExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSTypeAssertion(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSNonNullExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            Expression::TSInstantiationExpression(expr) => self.strip_expression_wrappers(&expr.expression),
            expr => expr,
        }
    }

    fn object_property<'b>(
        &self,
        object: &'b ObjectExpression<'b>,
        name: &str,
    ) -> Result<Option<&'b Expression<'b>>, MearieError> {
        for property in &object.properties {
            let property = match property {
                ObjectPropertyKind::ObjectProperty(property) => property,
                ObjectPropertyKind::SpreadProperty(spread) => {
                    return Err(self.extraction_error(
                        self.calculate_line_number(spread.span.start),
                        "Object spreads in typed GraphQL selections are not supported",
                    ));
                }
            };

            if property.computed {
                return Err(self.extraction_error(
                    self.calculate_line_number(property.span.start),
                    "Computed keys in typed GraphQL objects are not supported",
                ));
            }

            if self.property_key_name(&property.key) == Some(name) {
                return Ok(Some(&property.value));
            }
        }

        Ok(None)
    }

    fn object_properties<'b>(
        &self,
        object: &'b ObjectExpression<'b>,
        line: u32,
    ) -> Result<Vec<(&'b str, &'b Expression<'b>)>, MearieError> {
        let mut properties = Vec::new();

        for property in &object.properties {
            let property = match property {
                ObjectPropertyKind::ObjectProperty(property) => property,
                ObjectPropertyKind::SpreadProperty(_) => {
                    return Err(
                        self.extraction_error(line, "Object spreads in typed GraphQL selections are not supported")
                    );
                }
            };

            if property.computed {
                return Err(self.extraction_error(line, "Computed keys in typed GraphQL selections are not supported"));
            }

            let key = self.property_key_name(&property.key).ok_or_else(|| {
                self.extraction_error(line, "Typed GraphQL object keys must be identifiers or string literals")
            })?;
            properties.push((key, &property.value));
        }

        Ok(properties)
    }

    fn property_key_name<'b>(&self, key: &'b PropertyKey<'b>) -> Option<&'b str> {
        match key {
            PropertyKey::StaticIdentifier(ident) => Some(ident.name.as_str()),
            PropertyKey::StringLiteral(value) => Some(value.value.as_str()),
            _ => None,
        }
    }

    fn lower_variables(
        &self,
        variables: Option<&Expression>,
        line: u32,
    ) -> Result<Vec<TypedGraphqlVariableDefinition>, MearieError> {
        let Some(variables) = variables else {
            return Ok(Vec::new());
        };

        let variables = self.expect_callback_object(
            variables,
            line,
            "Variables must be defined as a callback returning an object literal",
        )?;
        let mut defs = Vec::new();

        for (name, value) in self.object_properties(variables, line)? {
            let variable_type = self.lower_variable_type(value, line)?;
            if !variable_type.state.is_final() {
                return Err(self.extraction_error(
                    line,
                    "Variable definitions must call nonNull(), optional(), default(), or list()",
                ));
            }
            defs.push(TypedGraphqlVariableDefinition {
                name: name.to_string(),
                type_ref: variable_type.type_ref,
                default_value: variable_type.default_value,
                directives: variable_type.directives,
            });
        }

        Ok(defs)
    }

    fn lower_variable_type(&self, expr: &Expression, line: u32) -> Result<TypedGraphqlVariableType, MearieError> {
        match self.strip_expression_wrappers(expr) {
            Expression::StaticMemberExpression(member) => match self.strip_expression_wrappers(&member.object) {
                Expression::Identifier(_) => Ok(TypedGraphqlVariableType {
                    type_ref: member.property.name.as_str().to_string(),
                    default_value: None,
                    directives: Vec::new(),
                    state: TypedGraphqlVariableTypeState::Base,
                    has_directives: false,
                }),
                _ => Err(self.extraction_error(line, "Variable definitions must use the generated variable builder")),
            },
            Expression::CallExpression(call) => {
                let Expression::StaticMemberExpression(member) = self.strip_expression_wrappers(&call.callee) else {
                    return Err(self.extraction_error(line, "Variable definitions must use variable builder methods"));
                };

                let mut base = self.lower_variable_type(&member.object, line)?;
                match member.property.name.as_str() {
                    "nonNull" => {
                        self.expect_variable_builder_arg_count(call, line, "nonNull", 0)?;
                        base.state = match base.state {
                            TypedGraphqlVariableTypeState::Base => TypedGraphqlVariableTypeState::NonNullNamed,
                            TypedGraphqlVariableTypeState::List => TypedGraphqlVariableTypeState::NonNullList,
                            TypedGraphqlVariableTypeState::NonNullNamed
                            | TypedGraphqlVariableTypeState::NonNullList => {
                                return Err(
                                    self.extraction_error(line, "Variable nonNull() cannot be applied repeatedly")
                                );
                            }
                            TypedGraphqlVariableTypeState::Optional => {
                                return Err(self
                                    .extraction_error(line, "Variable nonNull() cannot be chained after optional()"));
                            }
                            TypedGraphqlVariableTypeState::Terminal => {
                                return Err(self.extraction_error(
                                    line,
                                    "Variable builder methods cannot be chained after default()",
                                ));
                            }
                        };
                        base.type_ref.push('!');
                        Ok(base)
                    }
                    "optional" => {
                        self.expect_variable_builder_arg_count(call, line, "optional", 0)?;
                        base.state = match base.state {
                            TypedGraphqlVariableTypeState::Base | TypedGraphqlVariableTypeState::List => {
                                TypedGraphqlVariableTypeState::Optional
                            }
                            TypedGraphqlVariableTypeState::NonNullNamed
                            | TypedGraphqlVariableTypeState::NonNullList => {
                                return Err(self
                                    .extraction_error(line, "Variable optional() cannot be applied after nonNull()"));
                            }
                            TypedGraphqlVariableTypeState::Optional => {
                                return Err(
                                    self.extraction_error(line, "Variable optional() cannot be applied repeatedly")
                                );
                            }
                            TypedGraphqlVariableTypeState::Terminal => {
                                return Err(self.extraction_error(
                                    line,
                                    "Variable builder methods cannot be chained after default()",
                                ));
                            }
                        };
                        Ok(base)
                    }
                    "list" => {
                        self.expect_variable_builder_arg_count(call, line, "list", 0)?;
                        base.state = match base.state {
                            TypedGraphqlVariableTypeState::Base | TypedGraphqlVariableTypeState::NonNullNamed => {
                                TypedGraphqlVariableTypeState::List
                            }
                            TypedGraphqlVariableTypeState::List | TypedGraphqlVariableTypeState::NonNullList => {
                                return Err(
                                    self.extraction_error(line, "Variable list() cannot be applied more than once")
                                );
                            }
                            TypedGraphqlVariableTypeState::Optional => {
                                return Err(
                                    self.extraction_error(line, "Variable list() cannot be chained after optional()")
                                );
                            }
                            TypedGraphqlVariableTypeState::Terminal => {
                                return Err(self.extraction_error(
                                    line,
                                    "Variable builder methods cannot be chained after default()",
                                ));
                            }
                        };
                        base.type_ref = format!("[{}]", base.type_ref);
                        Ok(base)
                    }
                    "default" => {
                        self.expect_variable_builder_arg_count(call, line, "default", 1)?;
                        if matches!(base.state, TypedGraphqlVariableTypeState::Terminal) {
                            return Err(
                                self.extraction_error(line, "Variable default() cannot be applied more than once")
                            );
                        }
                        let value = call.arguments.first().ok_or_else(|| {
                            self.extraction_error(line, "Variable default() must receive a default value")
                        })?;
                        let Some(value) = value.as_expression() else {
                            return Err(self.extraction_error(line, "Variable default value must be a literal"));
                        };
                        base.default_value = Some(self.lower_value(value, line, None)?);
                        base.state = TypedGraphqlVariableTypeState::Terminal;
                        Ok(base)
                    }
                    "directives" => {
                        self.expect_variable_builder_arg_count(call, line, "directives", 1)?;
                        if base.has_directives {
                            return Err(
                                self.extraction_error(line, "Variable directives() cannot be applied more than once")
                            );
                        }
                        let value = call.arguments.first().ok_or_else(|| {
                            self.extraction_error(line, "Variable directives() must receive a directive map")
                        })?;
                        let Some(value) = value.as_expression() else {
                            return Err(self
                                .extraction_error(line, "Variable directives() must receive a directive map object"));
                        };
                        base.directives.extend(self.lower_directive_map(value, line, None)?);
                        base.has_directives = true;
                        Ok(base)
                    }
                    method => {
                        Err(self.extraction_error(line, format!("Unsupported variable builder method '{}'", method)))
                    }
                }
            }
            _ => Err(self.extraction_error(line, "Variable definitions must use the generated variable builder")),
        }
    }

    fn expect_variable_builder_arg_count(
        &self,
        call: &CallExpression,
        line: u32,
        method: &str,
        count: usize,
    ) -> Result<(), MearieError> {
        if call.arguments.len() == count {
            return Ok(());
        }

        Err(self.extraction_error(line, format!("Variable {}() expects {} argument(s)", method, count)))
    }

    fn lower_directives_callback(
        &self,
        directives: Option<&Expression>,
        line: u32,
    ) -> Result<Vec<String>, MearieError> {
        let Some(directives) = directives else {
            return Ok(Vec::new());
        };

        let directives = self.expect_callback_object_with_parameter(
            directives,
            line,
            "Directives must be defined as a callback returning an object literal",
        )?;
        self.lower_directive_map_object(directives.object, line, directives.variable_reference_parameter)
    }

    fn lower_directive_map(
        &self,
        expr: &Expression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<Vec<String>, MearieError> {
        let object = self.expect_object_expr(expr, line, "Directive maps must be object literals")?;
        self.lower_directive_map_object(object, line, variable_reference_parameter)
    }

    fn lower_directive_map_object(
        &self,
        object: &ObjectExpression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<Vec<String>, MearieError> {
        let mut directives = Vec::new();

        for (name, value) in self.object_properties(object, line)? {
            match self.strip_expression_wrappers(value) {
                Expression::BooleanLiteral(value) if value.value => directives.push(format!("@{}", name)),
                Expression::ObjectExpression(args) => {
                    let args = self.lower_arguments_object(args, line, variable_reference_parameter)?;
                    if args.is_empty() {
                        directives.push(format!("@{}", name));
                    } else {
                        directives.push(format!("@{}({})", name, args.join(", ")));
                    }
                }
                _ => {
                    return Err(self.extraction_error(
                        line,
                        "Directive values must be object literals, or true for argument-less directives",
                    ));
                }
            }
        }

        Ok(directives)
    }

    fn expect_selection_callback<'b>(
        &self,
        expr: &'b Expression<'b>,
        line: u32,
    ) -> Result<TypedGraphqlCallbackObject<'b>, MearieError> {
        self.expect_callback_object_with_parameter(expr, line, "Selection callbacks must return an object literal")
    }

    fn expect_callback_object<'b>(
        &self,
        expr: &'b Expression<'b>,
        line: u32,
        message: &str,
    ) -> Result<&'b ObjectExpression<'b>, MearieError> {
        let Expression::ArrowFunctionExpression(callback) = self.strip_expression_wrappers(expr) else {
            return Err(self.extraction_error(line, message));
        };

        let return_expr = self.arrow_return_expression(callback, line, message)?;
        self.expect_object_expr(return_expr, line, message)
    }

    fn expect_callback_object_with_parameter<'b>(
        &self,
        expr: &'b Expression<'b>,
        line: u32,
        message: &str,
    ) -> Result<TypedGraphqlCallbackObject<'b>, MearieError> {
        let Expression::ArrowFunctionExpression(callback) = self.strip_expression_wrappers(expr) else {
            return Err(self.extraction_error(line, message));
        };

        let variable_reference_parameter = self.callback_parameter_name(callback, line)?;
        let return_expr = self.arrow_return_expression(callback, line, message)?;
        let object = self.expect_object_expr(return_expr, line, message)?;

        Ok(TypedGraphqlCallbackObject {
            object,
            variable_reference_parameter,
        })
    }

    fn callback_parameter_name<'b>(
        &self,
        callback: &'b ArrowFunctionExpression<'b>,
        line: u32,
    ) -> Result<Option<&'b str>, MearieError> {
        if callback.params.items.is_empty() {
            return Ok(None);
        }

        let [parameter] = callback.params.items.as_slice() else {
            return Err(self.extraction_error(line, "Typed GraphQL callbacks may only declare one parameter"));
        };

        match &parameter.pattern {
            BindingPattern::BindingIdentifier(identifier) => Ok(Some(identifier.name.as_str())),
            _ => Err(self.extraction_error(line, "Typed GraphQL callback parameters must be identifiers")),
        }
    }

    fn arrow_return_expression<'b>(
        &self,
        callback: &'b ArrowFunctionExpression<'b>,
        line: u32,
        message: &str,
    ) -> Result<&'b Expression<'b>, MearieError> {
        if callback.expression {
            let Some(Statement::ExpressionStatement(statement)) = callback.body.statements.first() else {
                return Err(self.extraction_error(line, message));
            };
            return Ok(&statement.expression);
        }

        for statement in &callback.body.statements {
            if let Statement::ReturnStatement(statement) = statement
                && let Some(argument) = &statement.argument
            {
                return Ok(argument);
            }
        }

        Err(self.extraction_error(line, message))
    }

    fn write_variable_definitions(&self, out: &mut String, variables: &[TypedGraphqlVariableDefinition]) {
        if variables.is_empty() {
            return;
        }

        out.push('(');
        for (index, variable) in variables.iter().enumerate() {
            if index > 0 {
                out.push_str(", ");
            }
            write!(out, "${}: {}", variable.name, variable.type_ref).unwrap();
            if let Some(default_value) = &variable.default_value {
                write!(out, " = {}", default_value).unwrap();
            }
            self.write_directives(out, &variable.directives);
        }
        out.push(')');
    }

    fn write_directives(&self, out: &mut String, directives: &[String]) {
        for directive in directives {
            out.push(' ');
            out.push_str(directive);
        }
    }

    fn write_selection_set(
        &self,
        out: &mut String,
        selection: &ObjectExpression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        for (key, value) in self.object_properties(selection, line)? {
            if key == "$" {
                self.write_fragment_items(out, value, indent, line, variable_reference_parameter)?;
            } else {
                self.write_field_selection(out, key, value, indent, line, variable_reference_parameter)?;
            }
        }

        Ok(())
    }

    fn write_field_selection(
        &self,
        out: &mut String,
        field_name: &str,
        value: &Expression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        match self.strip_expression_wrappers(value) {
            Expression::BooleanLiteral(value) if value.value => {
                self.write_indent(out, indent);
                writeln!(out, "{}", field_name).unwrap();
                Ok(())
            }
            Expression::ArrayExpression(array) => {
                self.write_field_tuple(out, field_name, array, indent, line, variable_reference_parameter)
            }
            Expression::ObjectExpression(object) => {
                self.write_indent(out, indent);
                writeln!(out, "{} {{", field_name).unwrap();
                self.write_selection_set(out, object, indent + 1, line, variable_reference_parameter)?;
                self.write_indent(out, indent);
                writeln!(out, "}}").unwrap();
                Ok(())
            }
            _ => Err(self.extraction_error(
                line,
                "Field selections must be true, a nested selection object, or a field tuple",
            )),
        }
    }

    fn write_field_tuple(
        &self,
        out: &mut String,
        field_name: &str,
        tuple: &ArrayExpression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let items = self.array_items(tuple, line, "Field tuples cannot contain holes or spread elements")?;

        match items.as_slice() {
            [config] => {
                let config = self.expect_field_config_object(config, line)?;
                self.write_scalar_config_field(out, field_name, config, indent, line, variable_reference_parameter)
            }
            [config, selection] => {
                let config = self.expect_field_config_object(config, line)?;
                self.write_configured_field(
                    out,
                    field_name,
                    config,
                    selection,
                    indent,
                    line,
                    variable_reference_parameter,
                )
            }
            _ => Err(self.extraction_error(
                line,
                "Field tuples must be [config] for scalar fields or [config, selection] for composite fields",
            )),
        }
    }

    fn expect_field_config_object<'b>(
        &self,
        expr: &'b Expression<'b>,
        line: u32,
    ) -> Result<&'b ObjectExpression<'b>, MearieError> {
        let object = self.expect_object_expr(expr, line, "Field tuple config must be an object literal")?;
        if self.is_field_config_object(object, line)? {
            Ok(object)
        } else {
            Err(self.extraction_error(line, "Field tuple config may only contain alias, args, and directives"))
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn write_configured_field(
        &self,
        out: &mut String,
        field_name: &str,
        config: &ObjectExpression,
        select: &Expression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let select = self.expect_object_expr(select, line, "Field tuple selection must be an object literal")?;
        let alias = self.lower_alias(config, line)?;
        let args = self.lower_args_property(config, line, variable_reference_parameter)?;
        let directives = self.lower_directives_property(config, line, variable_reference_parameter)?;

        self.write_indent(out, indent);
        if let Some(alias) = alias {
            write!(out, "{}: ", alias).unwrap();
        }
        write!(out, "{}", field_name).unwrap();
        if !args.is_empty() {
            write!(out, "({})", args.join(", ")).unwrap();
        }
        self.write_directives(out, &directives);
        writeln!(out, " {{").unwrap();
        self.write_selection_set(out, select, indent + 1, line, variable_reference_parameter)?;
        self.write_indent(out, indent);
        writeln!(out, "}}").unwrap();

        Ok(())
    }

    fn write_scalar_config_field(
        &self,
        out: &mut String,
        field_name: &str,
        config: &ObjectExpression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let alias = self.lower_alias(config, line)?;
        let args = self.lower_args_property(config, line, variable_reference_parameter)?;
        let directives = self.lower_directives_property(config, line, variable_reference_parameter)?;

        self.write_indent(out, indent);
        if let Some(alias) = alias {
            write!(out, "{}: ", alias).unwrap();
        }
        write!(out, "{}", field_name).unwrap();
        if !args.is_empty() {
            write!(out, "({})", args.join(", ")).unwrap();
        }
        self.write_directives(out, &directives);
        writeln!(out).unwrap();

        Ok(())
    }

    fn is_field_config_object(&self, object: &ObjectExpression, line: u32) -> Result<bool, MearieError> {
        let properties = self.object_properties(object, line)?;
        Ok(properties
            .iter()
            .all(|(key, _)| matches!(*key, "alias" | "args" | "directives")))
    }

    fn lower_alias(&self, object: &ObjectExpression, line: u32) -> Result<Option<String>, MearieError> {
        self.object_property(object, "alias")?
            .map(|alias| {
                self.expect_string_expr(alias, line, "Field alias must be a string literal")
                    .map(str::to_string)
            })
            .transpose()
    }

    fn lower_args_property(
        &self,
        object: &ObjectExpression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<Vec<String>, MearieError> {
        self.object_property(object, "args")?
            .map(|args| self.lower_arguments(args, line, variable_reference_parameter))
            .transpose()
            .map(Option::unwrap_or_default)
    }

    fn lower_directives_property(
        &self,
        object: &ObjectExpression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<Vec<String>, MearieError> {
        self.object_property(object, "directives")?
            .map(|directives| self.lower_directive_map(directives, line, variable_reference_parameter))
            .transpose()
            .map(Option::unwrap_or_default)
    }

    fn lower_arguments(
        &self,
        expr: &Expression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<Vec<String>, MearieError> {
        let object = self.expect_object_expr(expr, line, "Arguments must be object literals")?;
        self.lower_arguments_object(object, line, variable_reference_parameter)
    }

    fn lower_arguments_object(
        &self,
        object: &ObjectExpression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<Vec<String>, MearieError> {
        self.object_properties(object, line)?
            .into_iter()
            .map(|(name, value)| {
                Ok(format!(
                    "{}: {}",
                    name,
                    self.lower_value(value, line, variable_reference_parameter)?
                ))
            })
            .collect()
    }

    fn write_fragment_items(
        &self,
        out: &mut String,
        value: &Expression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let items = self.expect_array_expr(value, line, "The $ selection property must be an array literal")?;

        for item in self.array_items(
            items,
            line,
            "Fragment spread arrays cannot contain holes or spread elements",
        )? {
            self.write_fragment_item(out, item, indent, line, variable_reference_parameter)?;
        }

        Ok(())
    }

    fn write_fragment_item(
        &self,
        out: &mut String,
        item: &Expression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        match self.strip_expression_wrappers(item) {
            Expression::Identifier(identifier) => {
                let fragment_name = self.fragment_name_from_identifier(identifier.name.as_str(), line)?;
                self.write_indent(out, indent);
                writeln!(out, "...{}", fragment_name).unwrap();
                Ok(())
            }
            Expression::ObjectExpression(object) => {
                self.write_indent(out, indent);
                writeln!(out, "... {{").unwrap();
                self.write_selection_set(out, object, indent + 1, line, variable_reference_parameter)?;
                self.write_indent(out, indent);
                writeln!(out, "}}").unwrap();
                Ok(())
            }
            Expression::ArrayExpression(tuple) => {
                self.write_fragment_tuple(out, tuple, indent, line, variable_reference_parameter)
            }
            _ => Err(self.extraction_error(
                line,
                "Fragment entries must be fragment identifiers, selection objects, or fragment tuples",
            )),
        }
    }

    fn write_fragment_tuple(
        &self,
        out: &mut String,
        tuple: &ArrayExpression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let items = self.array_items(tuple, line, "Fragment tuples cannot contain holes or spread elements")?;

        let [config, payload] = items.as_slice() else {
            return Err(self.extraction_error(
                line,
                "Fragment tuples must be [config, fragment] or [config, selection]",
            ));
        };

        match self.strip_expression_wrappers(payload) {
            Expression::Identifier(identifier) => {
                let config =
                    self.expect_fragment_config_object(config, line, "Fragment spread", &["args", "directives"])?;
                let fragment_name = self.fragment_name_from_identifier(identifier.name.as_str(), line)?;
                self.write_configured_fragment_spread(
                    out,
                    config,
                    fragment_name,
                    indent,
                    line,
                    variable_reference_parameter,
                )
            }
            Expression::ObjectExpression(selection) => {
                let config =
                    self.expect_fragment_config_object(config, line, "Inline fragment", &["on", "directives"])?;
                self.write_inline_fragment(out, config, selection, indent, line, variable_reference_parameter)
            }
            _ => Err(self.extraction_error(
                line,
                "Fragment tuple payloads must be a fragment artifact identifier or an object literal",
            )),
        }
    }

    fn expect_fragment_config_object<'b>(
        &self,
        expr: &'b Expression<'b>,
        line: u32,
        tuple_kind: &str,
        allowed_keys: &[&str],
    ) -> Result<&'b ObjectExpression<'b>, MearieError> {
        let object = self.expect_object_expr(expr, line, "Fragment tuple config must be an object literal")?;
        let properties = self.object_properties(object, line)?;

        if let Some((unsupported_key, _)) = properties.iter().find(|(key, _)| !allowed_keys.contains(key)) {
            return Err(self.extraction_error(
                line,
                format!(
                    "{} tuple config may only contain {}; unsupported key '{}'",
                    tuple_kind,
                    allowed_keys.join(" and "),
                    unsupported_key
                ),
            ));
        }

        Ok(object)
    }

    fn write_configured_fragment_spread(
        &self,
        out: &mut String,
        config: &ObjectExpression,
        fragment_name: &str,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let args = self.lower_args_property(config, line, variable_reference_parameter)?;
        let directives = self.lower_directives_property(config, line, variable_reference_parameter)?;

        self.write_indent(out, indent);
        write!(out, "...{}", fragment_name).unwrap();
        if !args.is_empty() {
            write!(out, "({})", args.join(", ")).unwrap();
        }
        self.write_directives(out, &directives);
        writeln!(out).unwrap();

        Ok(())
    }

    fn write_inline_fragment(
        &self,
        out: &mut String,
        config: &ObjectExpression,
        selection: &ObjectExpression,
        indent: usize,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<(), MearieError> {
        let on = self
            .object_property(config, "on")?
            .map(|on| self.expect_string_expr(on, line, "Inline fragment type conditions must be string literals"))
            .transpose()?;
        let directives = self.lower_directives_property(config, line, variable_reference_parameter)?;

        self.write_indent(out, indent);
        out.push_str("...");
        if let Some(on) = on {
            write!(out, " on {}", on).unwrap();
        }
        self.write_directives(out, &directives);
        writeln!(out, " {{").unwrap();
        self.write_selection_set(out, selection, indent + 1, line, variable_reference_parameter)?;
        self.write_indent(out, indent);
        writeln!(out, "}}").unwrap();

        Ok(())
    }

    fn fragment_name_from_identifier<'b>(&'b self, identifier: &str, line: u32) -> Result<&'b str, MearieError> {
        self.fragment_bindings
            .get(identifier)
            .map(String::as_str)
            .ok_or_else(|| {
                let detail = self.unresolved_fragment_imports.get(identifier).map_or_else(
                    || {
                        "it was not found in a local graphql.fragment declaration or the cross-file exported fragment registry"
                            .to_string()
                    },
                    |message| message.clone(),
                );

                self.extraction_error(
                    line,
                    format!(
                        "Unable to resolve typed GraphQL fragment identifier '{}': {}",
                        identifier, detail
                    ),
                )
            })
    }

    fn lower_value(
        &self,
        expr: &Expression,
        line: u32,
        variable_reference_parameter: Option<&str>,
    ) -> Result<String, MearieError> {
        match self.strip_expression_wrappers(expr) {
            Expression::CallExpression(call) if self.is_graphql_enum_literal_call(call) => {
                self.lower_graphql_enum_literal_call(call, line)
            }
            Expression::StringLiteral(value) => Ok(self.graphql_string(value.value.as_str())),
            Expression::BooleanLiteral(value) => Ok(value.value.to_string()),
            Expression::NullLiteral(_) => Ok("null".to_string()),
            Expression::NumericLiteral(value) => Ok(value
                .raw
                .as_ref()
                .map(|raw| raw.as_str().to_string())
                .unwrap_or_else(|| value.value.to_string())),
            Expression::Identifier(_) => Err(self.extraction_error(
                line,
                "Typed GraphQL values must be static literals, graphql.enum() calls, or variable references",
            )),
            Expression::StaticMemberExpression(member) => {
                if matches!(
                    (self.strip_expression_wrappers(&member.object), variable_reference_parameter),
                    (Expression::Identifier(identifier), Some(parameter)) if identifier.name.as_str() == parameter
                ) {
                    Ok(format!("${}", member.property.name.as_str()))
                } else {
                    Err(self.extraction_error(
                        line,
                        "Typed GraphQL values must be static literals, graphql.enum() calls, or variable references",
                    ))
                }
            }
            Expression::ArrayExpression(array) => {
                let mut values = Vec::new();
                for item in &array.elements {
                    let Some(item) = item.as_expression() else {
                        return Err(self.extraction_error(line, "Input arrays cannot contain holes or spread elements"));
                    };
                    values.push(self.lower_value(item, line, variable_reference_parameter)?);
                }
                Ok(format!("[{}]", values.join(", ")))
            }
            Expression::ObjectExpression(object) => {
                let values = self.lower_arguments_object(object, line, variable_reference_parameter)?;
                Ok(format!("{{ {} }}", values.join(", ")))
            }
            _ => Err(self.extraction_error(
                line,
                "Typed GraphQL values must be static literals, graphql.enum() calls, or variable references",
            )),
        }
    }

    fn is_graphql_enum_literal_call(&self, call: &CallExpression) -> bool {
        let Expression::StaticMemberExpression(member) = self.strip_expression_wrappers(&call.callee) else {
            return false;
        };

        member.property.name == "enum"
            && matches!(
                self.strip_expression_wrappers(&member.object),
                Expression::Identifier(identifier) if identifier.name == "graphql"
            )
    }

    fn lower_graphql_enum_literal_call(&self, call: &CallExpression, line: u32) -> Result<String, MearieError> {
        if call.arguments.len() != 1 {
            return Err(self.extraction_error(line, "graphql.enum() expects exactly one string literal argument"));
        }

        let Some(argument) = call.arguments.first().and_then(Argument::as_expression) else {
            return Err(self.extraction_error(line, "graphql.enum() expects a string literal argument"));
        };

        match self.strip_expression_wrappers(argument) {
            Expression::StringLiteral(value) => Ok(value.value.as_str().to_string()),
            _ => Err(self.extraction_error(line, "graphql.enum() expects a string literal argument")),
        }
    }

    fn graphql_string(&self, value: &str) -> String {
        let mut result = String::with_capacity(value.len() + 2);
        result.push('"');
        for ch in value.chars() {
            match ch {
                '"' => result.push_str("\\\""),
                '\\' => result.push_str("\\\\"),
                '\n' => result.push_str("\\n"),
                '\r' => result.push_str("\\r"),
                '\t' => result.push_str("\\t"),
                ch => result.push(ch),
            }
        }
        result.push('"');
        result
    }

    fn write_indent(&self, out: &mut String, indent: usize) {
        for _ in 0..indent {
            out.push_str("  ");
        }
    }
}

impl<'a> Visit<'_> for Extractor<'a> {
    fn visit_call_expression(&mut self, node: &CallExpression) {
        if let Expression::Identifier(ident) = &node.callee
            && ident.name == "graphql"
        {
            let offset = node.span.start;
            let line = self.calculate_line_number(offset);

            if node.arguments.len() != 1 {
                walk::walk_call_expression(self, node);
                return;
            }

            match &node.arguments[0] {
                Argument::TemplateLiteral(template) => match self.extract_template_literal(template, line) {
                    Ok(code) => {
                        self.sources.push(SourceBuf {
                            code,
                            file_path: self.source.file_path.clone(),
                            importable_file_path: None,
                            start_line: line,
                        });
                    }
                    Err(e) => {
                        self.errors.push(e);
                    }
                },
                Argument::StringLiteral(_) => {
                    self.errors.push(
                        MearieError::extraction(
                            "graphql() function must use template literal (backticks), not string literal (quotes)",
                        )
                        .at(Location {
                            file_path: self.source.file_path.clone(),
                            line,
                            column: None,
                        }),
                    );
                }
                _ => {}
            }
        } else if let Expression::StaticMemberExpression(member) = self.strip_expression_wrappers(&node.callee)
            && matches!(self.strip_expression_wrappers(&member.object), Expression::Identifier(ident) if ident.name == "graphql")
            && let Some(kind) = TypedGraphqlKind::from_method(member.property.name.as_str())
        {
            let offset = node.span.start;
            let line = self.calculate_line_number(offset);

            match self.lower_typed_graphql_call(node, kind, line) {
                Ok(code) => {
                    self.sources.push(SourceBuf {
                        code,
                        file_path: self.source.file_path.clone(),
                        importable_file_path: None,
                        start_line: line,
                    });
                }
                Err(e) => {
                    self.errors.push(e);
                }
            }
        }

        walk::walk_call_expression(self, node);
    }
}

fn collect_typed_graphql_fragment_registry(
    source: &SourceBuf,
) -> Result<TypedGraphqlFileFragmentRegistry, Vec<MearieError>> {
    let allocator = Allocator::default();
    let source_type = SourceType::tsx();

    let parser = Parser::new(&allocator, &source.code, source_type);
    let result = parser.parse();

    if !result.errors.is_empty() {
        let errors = result
            .errors
            .iter()
            .map(|e| {
                let line = e
                    .labels
                    .as_ref()
                    .and_then(|labels| labels.first())
                    .map(|l| l.offset() as u32)
                    .unwrap_or(1);

                MearieError::extraction(format!("Failed to parse JavaScript/TypeScript: {}", e)).at(Location {
                    file_path: source.file_path.clone(),
                    line,
                    column: None,
                })
            })
            .collect();

        return Err(errors);
    }

    let mut fragment_collector = TypedGraphqlFragmentBindingCollector::new();
    fragment_collector.visit_program(&result.program);

    Ok(fragment_collector.into_registry())
}

fn extract_graphql_sources_with_fragment_bindings(
    source: &SourceBuf,
    resolved_fragment_bindings: TypedGraphqlResolvedFragmentBindings,
) -> ExtractResult {
    let allocator = Allocator::default();
    let source_type = SourceType::tsx();

    let parser = Parser::new(&allocator, &source.code, source_type);
    let result = parser.parse();

    if !result.errors.is_empty() {
        let errors = result
            .errors
            .iter()
            .map(|e| {
                let line = e
                    .labels
                    .as_ref()
                    .and_then(|labels| labels.first())
                    .map(|l| l.offset() as u32)
                    .unwrap_or(1);

                MearieError::extraction(format!("Failed to parse JavaScript/TypeScript: {}", e)).at(Location {
                    file_path: source.file_path.clone(),
                    line,
                    column: None,
                })
            })
            .collect();

        return ExtractResult {
            sources: Vec::new(),
            errors,
        };
    }

    let mut extractor = Extractor::new(source, resolved_fragment_bindings);
    extractor.visit_program(&result.program);

    ExtractResult {
        sources: extractor.sources,
        errors: extractor.errors,
    }
}

pub fn extract_graphql_sources(source: SourceBuf) -> ExtractResult {
    extract_graphql_sources_from_documents(vec![source])
}

pub fn extract_graphql_sources_from_documents(sources: Vec<SourceBuf>) -> ExtractResult {
    let mut registries: HashMap<String, TypedGraphqlFileFragmentRegistry> = HashMap::new();
    let mut errors = Vec::new();

    for source in &sources {
        match collect_typed_graphql_fragment_registry(source) {
            Ok(registry) => {
                registries
                    .entry(registry_file_path(source))
                    .or_default()
                    .merge(registry);
            }
            Err(source_errors) => {
                errors.extend(source_errors);
            }
        }
    }

    if !errors.is_empty() {
        return ExtractResult {
            sources: Vec::new(),
            errors,
        };
    }

    let resolver = TypedGraphqlCrossFileFragmentResolver::new(&registries);
    let mut extracted_sources = Vec::new();
    let mut extraction_errors = Vec::new();

    for source in &sources {
        let file_path = registry_file_path(source);
        let resolved_fragment_bindings = resolver.resolve_file_bindings(&file_path);
        let result = extract_graphql_sources_with_fragment_bindings(source, resolved_fragment_bindings);
        extracted_sources.extend(result.sources);
        extraction_errors.extend(result.errors);
    }

    ExtractResult {
        sources: extracted_sources,
        errors: extraction_errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assertables::*;

    fn create_source(code: &str) -> SourceBuf {
        create_source_with_path("test.js", code)
    }

    fn create_source_with_path(file_path: &str, code: &str) -> SourceBuf {
        SourceBuf {
            code: code.to_string(),
            file_path: file_path.to_string(),
            importable_file_path: None,
            start_line: 1,
        }
    }

    fn create_source_block(file_path: &str, importable_file_path: &str, code: &str) -> SourceBuf {
        SourceBuf {
            code: code.to_string(),
            file_path: file_path.to_string(),
            importable_file_path: Some(importable_file_path.to_string()),
            start_line: 1,
        }
    }

    fn source_code_containing<'a>(result: &'a ExtractResult, text: &str) -> &'a str {
        result
            .sources
            .iter()
            .find(|source| source.code.contains(text))
            .map(|source| source.code.as_str())
            .unwrap_or_else(|| panic!("missing extracted source containing {text:?}"))
    }

    #[test]
    fn test_extract_single_graphql_function() {
        let source = r#"
            const query = graphql(`
                query GetUser {
                    user {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_eq!(result.sources[0].file_path, "test.js");
        assert_gt!(result.sources[0].start_line, 0);
    }

    #[test]
    fn test_extract_multiple_graphql_functions() {
        let source = r#"
            const query1 = graphql(`query GetUser { user { id } }`);
            const query2 = graphql(`query GetPost { post { title } }`);
            const mutation = graphql(`mutation CreateUser { createUser { id } }`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 3);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_contains!(&result.sources[1].code, "GetPost");
        assert_contains!(&result.sources[2].code, "CreateUser");
    }

    #[test]
    fn test_graphql_with_string_literal_error() {
        let source = r#"
            const query = graphql("query GetUser { user { id } }");
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
    }

    #[test]
    fn test_graphql_with_single_quote_string_literal_error() {
        let source = r#"
            const query = graphql('query GetUser { user { id } }');
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
    }

    #[test]
    fn test_graphql_with_comment_inside_template() {
        let source = r#"
            const query = graphql(`
                # This is a comment
                query GetUser {
                    user { id }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_contains!(&result.sources[0].code, "# This is a comment");
    }

    #[test]
    fn test_extract_with_variable_interpolation() {
        let source = r#"
            const query = graphql(`
                query GetUser($id: ID!) {
                    user(id: ${userId}) {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
    }

    #[test]
    fn test_extract_fragment() {
        let source = r#"
            const fragment = graphql(`
                fragment UserFields on User {
                    id
                    name
                    email
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "UserFields");
        assert_contains!(&result.sources[0].code, "fragment");
    }

    #[test]
    fn test_extract_mutation() {
        let source = r#"
            const mutation = graphql(`
                mutation CreateUser($name: String!) {
                    createUser(name: $name) {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "CreateUser");
        assert_contains!(&result.sources[0].code, "mutation");
    }

    #[test]
    fn test_extract_subscription() {
        let source = r#"
            const subscription = graphql(`
                subscription OnMessageAdded {
                    messageAdded {
                        id
                        content
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "OnMessageAdded");
        assert_contains!(&result.sources[0].code, "subscription");
    }

    #[test]
    fn test_extract_from_typescript() {
        let source = r#"
            interface User {
                id: string;
            }

            const query: DocumentNode = graphql(`
                query GetUser {
                    user {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = SourceBuf {
            code: source.to_string(),
            file_path: "test.ts".to_string(),
            importable_file_path: None,
            start_line: 1,
        };

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
    }

    #[test]
    fn test_extract_from_tsx() {
        let source = r#"
            export const UserQuery = () => {
                const { data } = useQuery(graphql(`
                    query GetUser {
                        user { id name }
                    }
                `));
                return <div>{data.user.name}</div>;
            };
        "#;

        let source = SourceBuf {
            code: source.to_string(),
            file_path: "test.tsx".to_string(),
            importable_file_path: None,
            start_line: 1,
        };

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
    }

    #[test]
    fn test_extract_no_graphql() {
        let source = r#"
            const foo = "bar";
            const template = `hello ${world}`;
            function test() {
                return 42;
            }
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_extract_typed_graphql_query() {
        let source = r#"
            const UserFieldsFragment = graphql.fragment('UserFields', 'User', {
                select: () => ({
                    id: true,
                    name: [{ alias: 'displayName' }],
                }),
            });

            const query = graphql.query('GetUser', {
                variables: (t) => ({
                    id: t.ID.nonNull(),
                    first: t.Int.optional().default(10).directives({ defaulted: true }),
                    tags: t.String.nonNull().list().optional().directives({ tagList: true }),
                    names: t.String.nonNull().list().nonNull().default([]),
                }),
                directives: ($) => ({
                    cache: { ttl: 60 },
                }),
                select: ($) => ({
                    user: [{ args: { id: $.id } }, {
                            id: true,
                            email: [{ directives: { include: { if: true } } }],
                            friends: [{ args: { first: $.first, tags: $.tags } }, {
                                    id: true,
                                    $: [
                                        UserFieldsFragment,
                                        [
                                            { on: 'Admin', directives: { include: { if: true } } },
                                            {
                                                role: true,
                                            },
                                        ],
                                    ],
                            }],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
        assert_contains!(
            &result.sources[0].code,
            "fragment UserFields on User {\n  id\n  displayName: name\n}"
        );
        assert_contains!(
            &result.sources[1].code,
            "query GetUser($id: ID!, $first: Int = 10 @defaulted, $tags: [String!] @tagList, $names: [String!]! = []) @cache(ttl: 60)"
        );
        assert_contains!(&result.sources[1].code, "user(id: $id)");
        assert_contains!(&result.sources[1].code, "email @include(if: true)");
        assert_contains!(&result.sources[1].code, "friends(first: $first, tags: $tags)");
        assert_contains!(&result.sources[1].code, "...UserFields");
        assert_contains!(&result.sources[1].code, "... on Admin @include(if: true)");
    }

    #[test]
    fn test_extract_typed_graphql_uses_callback_parameter_for_variable_references() {
        let source = r#"
            const query = graphql.query('GetUser', {
                variables: (types) => ({
                    id: types.ID.nonNull(),
                    includeEmail: types.Boolean.optional(),
                    status: types.Status.optional(),
                }),
                directives: (vars) => ({
                    cache: { key: vars.id },
                }),
                select: (vars) => ({
                    user: [{ args: { id: vars.id, status: vars.status }, directives: { include: { if: vars.includeEmail } } }, {
                        id: true,
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(
            &result.sources[0].code,
            "query GetUser($id: ID!, $includeEmail: Boolean, $status: Status) @cache(key: $id)"
        );
        assert_contains!(
            &result.sources[0].code,
            "user(id: $id, status: $status) @include(if: $includeEmail)"
        );
    }

    #[test]
    fn test_extract_typed_graphql_lowers_enum_literal_wrapper() {
        let source = r#"
            const query = graphql.query('FindUsers', {
                variables: (t) => ({
                    fallbackStatus: t.Status.default(graphql.enum('ACTIVE')),
                }),
                directives: () => ({
                    cache: { mode: graphql.enum('FRESH') },
                }),
                select: () => ({
                    users: [{ args: {
                        status: graphql.enum('ACTIVE'),
                        filter: {
                            statuses: [graphql.enum('ACTIVE'), graphql.enum('INACTIVE')],
                        },
                    }, directives: { priority: { level: graphql.enum('HIGH') } } }, {
                        id: true,
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(
            &result.sources[0].code,
            "query FindUsers($fallbackStatus: Status = ACTIVE) @cache(mode: FRESH)"
        );
        assert_contains!(
            &result.sources[0].code,
            "users(status: ACTIVE, filter: { statuses: [ACTIVE, INACTIVE] }) @priority(level: HIGH)"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_dynamic_enum_literal_wrapper_argument() {
        let source = r#"
            const status = 'ACTIVE';
            const query = graphql.query('FindUsers', {
                select: () => ({
                    users: [{ args: { status: graphql.enum(status) } }, {
                        id: true,
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "graphql.enum() expects a string literal argument"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_identifier_values() {
        let cases = [
            r#"
                const query = graphql.query('FindUsers', {
                    select: () => ({
                        users: [{ args: { status: ACTIVE } }, {
                            id: true,
                        }],
                    }),
                });
            "#,
            r#"
                const status = 'ACTIVE';
                const query = graphql.query('FindUsers', {
                    select: () => ({
                        users: [{ args: { status } }, {
                            id: true,
                        }],
                    }),
                });
            "#,
        ];

        for source in cases {
            let result = extract_graphql_sources(create_source(source));

            assert_is_empty!(&result.sources);
            assert_len_eq_x!(&result.errors, 1);
            assert_contains!(
                &format!("{:?}", result.errors[0]),
                "Typed GraphQL values must be static literals, graphql.enum() calls, or variable references"
            );
        }
    }

    #[test]
    fn test_extract_typed_graphql_rejects_non_variable_member_values() {
        let source = r#"
            const Status = { ACTIVE: 'ACTIVE' };
            const query = graphql.query('FindUsers', {
                select: () => ({
                    users: [{ args: { status: Status.ACTIVE } }, {
                        id: true,
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Typed GraphQL values must be static literals, graphql.enum() calls, or variable references"
        );
    }

    #[test]
    fn test_extract_typed_graphql_resolves_fragment_name_from_local_binding() {
        let source = r#"
            const LocalMovieCardArtifact = graphql.fragment('MovieCard', 'Movie', {
                select: () => ({
                    title: true,
                }),
            });

            const query = graphql.query('GetMovies', {
                select: () => ({
                    movies: [{}, {
                        $: [LocalMovieCardArtifact],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "fragment MovieCard on Movie {\n  title\n}");
        assert_contains!(&result.sources[1].code, "...MovieCard");
        assert_not_contains!(&result.sources[1].code, "...LocalMovieCardArtifact");
    }

    #[test]
    fn test_extract_typed_graphql_resolves_imported_fragment_name_from_cross_file_registry() {
        let fragment_source = r#"
            export const LocalMovieCardArtifact = graphql.fragment('MovieCard', 'Movie', {
                select: () => ({
                    title: true,
                }),
            });
        "#;

        let query_source = r#"
            import { LocalMovieCardArtifact as ImportedMovieCard } from './movie-card';

            const query = graphql.query('GetMovies', {
                select: () => ({
                    movies: [{}, {
                        $: [ImportedMovieCard],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources_from_documents(vec![
            create_source_with_path("/project/movie-card.ts", fragment_source),
            create_source_with_path("/project/query.ts", query_source),
        ]);

        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
        let query = source_code_containing(&result, "query GetMovies");
        assert_contains!(query, "...MovieCard");
        assert_not_contains!(query, "...ImportedMovieCard");
    }

    #[test]
    fn test_extract_typed_graphql_resolves_imported_fragment_from_importable_block_path() {
        let fragment_source = r#"
            export const UserCardFragment = graphql.fragment('UserCard', 'User', {
                select: () => ({
                    name: true,
                }),
            });
        "#;

        let query_source = r#"
            import { UserCardFragment } from './UserCard.svelte';

            const query = graphql.query('GetUsers', {
                select: () => ({
                    users: {
                        $: [UserCardFragment],
                    },
                }),
            });
        "#;

        let result = extract_graphql_sources_from_documents(vec![
            create_source_block(
                "/project/UserCard.svelte.instance.ts",
                "/project/UserCard.svelte",
                fragment_source,
            ),
            create_source_with_path("/project/query.ts", query_source),
        ]);

        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
        let query = source_code_containing(&result, "query GetUsers");
        assert_contains!(query, "...UserCard");
        assert_not_contains!(query, "...UserCardFragment");
    }

    #[test]
    fn test_extract_typed_graphql_merges_fragment_registry_blocks_by_importable_path() {
        let fragment_block = r#"
            const LocalUserCardFragment = graphql.fragment('UserCard', 'User', {
                select: () => ({
                    name: true,
                }),
            });
        "#;

        let export_block = r#"
            export { LocalUserCardFragment as UserCardFragment };
        "#;

        let query_source = r#"
            import { UserCardFragment } from './UserCard.vue';

            const query = graphql.query('GetUsers', {
                select: () => ({
                    users: {
                        $: [UserCardFragment],
                    },
                }),
            });
        "#;

        let result = extract_graphql_sources_from_documents(vec![
            create_source_block(
                "/project/UserCard.vue.script.ts",
                "/project/UserCard.vue",
                fragment_block,
            ),
            create_source_block(
                "/project/UserCard.vue.scriptSetup.ts",
                "/project/UserCard.vue",
                export_block,
            ),
            create_source_with_path("/project/query.ts", query_source),
        ]);

        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
        let query = source_code_containing(&result, "query GetUsers");
        assert_contains!(query, "...UserCard");
        assert_not_contains!(query, "...UserCardFragment");
    }

    #[test]
    fn test_extract_typed_graphql_resolves_configured_fragment_tuple_through_re_export() {
        let fragment_source = r#"
            export const LocalMovieCardArtifact = graphql.fragment('MovieCard', 'Movie', {
                select: () => ({
                    title: true,
                }),
            });
        "#;

        let barrel_source = r#"
            export { LocalMovieCardArtifact as CardFragment } from '../movie-card';
        "#;

        let query_source = r#"
            import { CardFragment as Card } from './fragments';

            const query = graphql.query('GetMovies', {
                select: () => ({
                    movies: [{}, {
                        $: [
                            [{ directives: { include: { if: true } } }, Card],
                        ],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources_from_documents(vec![
            create_source_with_path("/project/movie-card.ts", fragment_source),
            create_source_with_path("/project/fragments/index.ts", barrel_source),
            create_source_with_path("/project/query.ts", query_source),
        ]);

        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
        let query = source_code_containing(&result, "query GetMovies");
        assert_contains!(query, "...MovieCard @include(if: true)");
        assert_not_contains!(query, "...Card");
    }

    #[test]
    fn test_extract_typed_graphql_rejects_on_in_configured_fragment_spread() {
        let source = r#"
            const UserFieldsFragment = graphql.fragment('UserFields', 'User', {
                select: () => ({
                    id: true,
                }),
            });

            const query = graphql.query('GetUsers', {
                select: () => ({
                    users: [{}, {
                        $: [
                            [{ on: 'Admin' }, UserFieldsFragment],
                        ],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Fragment spread tuple config may only contain args and directives; unsupported key 'on'"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_args_in_inline_fragment() {
        let source = r#"
            const query = graphql.query('GetUsers', {
                select: () => ({
                    users: [{}, {
                        $: [
                            [{ args: { id: '1' } }, {
                                id: true,
                            }],
                        ],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Inline fragment tuple config may only contain on and directives; unsupported key 'args'"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_unresolved_fragment_identifier() {
        let fragment_source = r#"
            export const MovieCardFragment = {};
        "#;

        let query_source = r#"
            import { MovieCardFragment as ImportedMovieCard } from './movie-card';

            const query = graphql.query('GetMovies', {
                select: () => ({
                    movies: [{}, {
                        $: [ImportedMovieCard],
                    }],
                }),
            });
        "#;

        let result = extract_graphql_sources_from_documents(vec![
            create_source_with_path("/project/movie-card.ts", fragment_source),
            create_source_with_path("/project/query.ts", query_source),
        ]);

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "module './movie-card' does not export a typed GraphQL fragment binding named 'MovieCardFragment'"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_repeated_variable_list() {
        let source = r#"
            const query = graphql.query('GetUser', {
                variables: (t) => ({
                    tags: t.String.list().list(),
                }),
                select: () => ({
                    __typename: true,
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Variable list() cannot be applied more than once"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_repeated_variable_non_null() {
        let source = r#"
            const query = graphql.query('GetUser', {
                variables: (t) => ({
                    id: t.ID.nonNull().nonNull(),
                }),
                select: () => ({
                    __typename: true,
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Variable nonNull() cannot be applied repeatedly"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_optional_after_non_null_variable() {
        let source = r#"
            const query = graphql.query('GetUser', {
                variables: (t) => ({
                    id: t.ID.nonNull().optional(),
                }),
                select: () => ({
                    __typename: true,
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Variable optional() cannot be applied after nonNull()"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_repeated_variable_directives() {
        let source = r#"
            const query = graphql.query('GetUser', {
                variables: (t) => ({
                    id: t.ID.nonNull().directives({ foo: true }).directives({ bar: true }),
                }),
                select: () => ({
                    __typename: true,
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Variable directives() cannot be applied more than once"
        );
    }

    #[test]
    fn test_extract_typed_graphql_rejects_legacy_variable_directive_config() {
        let source = r#"
            const query = graphql.query('GetUser', {
                variables: (t) => ({
                    id: t.ID.nonNull({ directives: { foo: true } }),
                }),
                select: () => ({
                    __typename: true,
                }),
            });
        "#;

        let result = extract_graphql_sources(create_source(source));

        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
        assert_contains!(
            &format!("{:?}", result.errors[0]),
            "Variable nonNull() expects 0 argument(s)"
        );
    }

    #[test]
    fn test_extract_invalid_javascript() {
        let source = r#"
            const query = graphql(`
                query GetUser {
                    user { id }
                }
            `);
            this is invalid syntax !!!
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_not_empty!(result.errors);
    }

    #[test]
    fn test_extract_nested_template_expressions() {
        let source = r#"
            const queries = [
                graphql(`query A { a { id } }`),
                graphql(`query B { b { id } }`),
            ];
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_extract_multiline_query() {
        let source = r#"
            const query = graphql(`
                query GetUserWithPosts {
                    user {
                        id
                        name
                        posts {
                            id
                            title
                            comments {
                                id
                                content
                            }
                        }
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUserWithPosts");
        assert_contains!(&result.sources[0].code, "comments");
    }

    #[test]
    fn test_extract_query_with_directives() {
        let source = r#"
            const query = graphql(`
                query GetUser($includeEmail: Boolean!) {
                    user {
                        id
                        name
                        email @include(if: $includeEmail)
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "@include");
    }

    #[test]
    fn test_extract_query_with_aliases() {
        let source = r#"
            const query = graphql(`
                query GetUsers {
                    admin: user(role: "admin") { id }
                    guest: user(role: "guest") { id }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "admin:");
        assert_contains!(&result.sources[0].code, "guest:");
    }

    #[test]
    fn test_extract_inline_fragments() {
        let source = r#"
            const query = graphql(`
                query GetSearchResults {
                    search {
                        ... on User { name }
                        ... on Post { title }
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "... on User");
    }

    #[test]
    fn test_extract_with_fragment_spread() {
        let source = r#"
            const query = graphql(`
                query GetUser {
                    user {
                        ...UserFields
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "...UserFields");
    }

    #[test]
    fn test_file_path_preserved() {
        let source = r#"const q = graphql(`query { user { id } }`);"#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);

        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_eq!(result.sources[0].file_path, "test.js");
    }

    #[test]
    fn test_line_number_tracking() {
        let source = r#"
            const a = 1;
            const b = 2;
            const query = graphql(`query { user { id } }`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_gt!(result.sources[0].start_line, 0);
    }

    #[test]
    fn test_regular_template_literal_not_extracted() {
        let source = r#"
            const regular = `This is just a regular template literal`;
            const html = `<div>Hello World</div>`;
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_other_function_calls_ignored() {
        let source = r#"
            const styled = css(`color: red;`);
            const html = htmlTemplate(`<div>Test</div>`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_mixed_valid_and_invalid() {
        let source = r#"
            const query1 = graphql(`query GetUser { user { id } }`);
            const query2 = graphql(`query GetPost($id: ID!) { post(id: ${id}) { title } }`);
            const query3 = graphql(`query GetComment { comment { text } }`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 2usize);
        assert_len_eq_x!(&result.errors, 1usize);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_contains!(&result.sources[1].code, "GetComment");
    }
}
