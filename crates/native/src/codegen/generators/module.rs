use super::super::CodegenContext;
use crate::error::Result;
use crate::graphql::ast::*;
use crate::schema::{DocumentIndex, SchemaIndex};
use crate::source::SourceBuf;
use itertools::chain;
use oxc_allocator::Box as OxcBox;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_codegen::Codegen;
use oxc_span::{Atom, SPAN, SourceType};

type StmtVec<'b> = oxc_allocator::Vec<'b, Statement<'b>>;

pub struct ModuleGenerator<'a, 'b> {
    ast: AstBuilder<'b>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> ModuleGenerator<'a, 'b> {
    pub fn new(ctx: &'b CodegenContext, schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>) -> Self {
        Self {
            ast: ctx.ast(),
            schema,
            document,
        }
    }

    pub fn generate(&self) -> Result<SourceBuf> {
        let module_statements = self.gen_module();
        let module_declaration_statement = self.stmt_module_decl("~graphql", module_statements);

        let all_statements = self.ast.vec_from_iter(chain![
            self.gen_top_level(),
            std::iter::once(module_declaration_statement),
        ]);

        let program = self.ast.program(
            SPAN,
            SourceType::default(),
            "",
            self.ast.vec(),
            None,
            self.ast.vec(),
            all_statements,
        );

        let code = Codegen::new().build(&program).code;

        Ok(SourceBuf {
            code,
            file_path: "graphql.d.ts".to_string(),
            start_line: 1,
        })
    }

    fn gen_top_level(&self) -> StmtVec<'b> {
        self.ast
            .vec_from_iter(chain![self.gen_operation_aliases(), self.gen_fragment_aliases(),])
    }

    fn gen_module(&self) -> StmtVec<'b> {
        self.ast.vec_from_iter(chain![
            self.gen_enum_exports(),
            self.gen_artifact_exports(),
            self.gen_fragment_key_exports(),
            self.gen_overloads(),
            std::iter::once(self.stmt_schema_declaration()),
        ])
    }

    fn gen_operation_aliases(&self) -> StmtVec<'b> {
        self.ast.vec_from_iter(
            self.document
                .operations()
                .filter_map(|operation| self.stmt_operation_alias(operation)),
        )
    }

    fn gen_fragment_aliases(&self) -> StmtVec<'b> {
        self.ast.vec_from_iter(
            self.document
                .fragments()
                .filter_map(|fragment| self.stmt_fragment_alias(fragment)),
        )
    }

    fn gen_enum_exports(&self) -> StmtVec<'b> {
        self.gen_type_exports(self.schema.enums().map(|enum_def| enum_def.name.to_string()))
    }

    fn gen_artifact_exports(&self) -> StmtVec<'b> {
        let operations = self.gen_type_exports(
            self.document
                .operations()
                .filter_map(|operation| operation.name.map(|name| name.to_string())),
        );

        let fragments = self.gen_type_exports(self.document.fragments().map(|fragment| fragment.name.to_string()));

        self.ast.vec_from_iter(chain![operations, fragments])
    }

    fn gen_fragment_key_exports(&self) -> StmtVec<'b> {
        self.gen_type_exports(
            self.document
                .fragments()
                .map(|fragment| format!("{}$key", fragment.name.as_str())),
        )
    }

    fn gen_overloads(&self) -> StmtVec<'b> {
        let operations = self
            .document
            .operations()
            .filter_map(|operation| self.stmt_operation_overload(operation));

        let fragments = self
            .document
            .fragments()
            .filter_map(|fragment| self.stmt_fragment_overload(fragment));

        self.ast.vec_from_iter(chain![operations, fragments])
    }

    fn gen_type_exports(&self, items: impl Iterator<Item = String>) -> StmtVec<'b> {
        self.ast.vec_from_iter(items.map(|item| {
            let import_type = self.type_import(&item);
            let type_alias = self.decl_type_alias(&item, import_type);
            self.stmt_export_type(type_alias)
        }))
    }

    fn stmt_operation_alias(&self, operation: &OperationDefinition<'b>) -> Option<Statement<'b>> {
        let name = operation.name.as_ref()?.as_str();
        Some(self.stmt_type_alias(name, name))
    }

    fn stmt_fragment_alias(&self, fragment: &FragmentDefinition<'b>) -> Option<Statement<'b>> {
        let name = fragment.name.as_str();
        Some(self.stmt_type_alias(name, name))
    }

    fn stmt_operation_overload(&self, operation: &OperationDefinition<'b>) -> Option<Statement<'b>> {
        let operation_name = operation.name.as_ref()?.as_str();
        let source = self.document.get_operation_source(operation)?;
        Some(self.stmt_function_overload(source, operation_name))
    }

    fn stmt_fragment_overload(&self, fragment: &FragmentDefinition<'b>) -> Option<Statement<'b>> {
        let fragment_name = fragment.name.as_str();
        let source = self.document.get_fragment_source(fragment)?;
        Some(self.stmt_function_overload(source, fragment_name))
    }

    fn stmt_type_alias(&self, alias_name: &str, import_name: &str) -> Statement<'b> {
        let import_type = self.type_import(import_name);
        let declaration = self.decl_type_alias(alias_name, import_type);
        Statement::from(declaration)
    }

    fn stmt_function_overload(&self, document_source: &'b str, return_type_name: &str) -> Statement<'b> {
        let return_type = self.type_ref(return_type_name);
        let return_annotation = self.ast.ts_type_annotation(SPAN, return_type);

        let string_literal_type = self.ast.ts_type_literal_type(
            SPAN,
            self.ast.ts_literal_string_literal(SPAN, document_source, None::<Atom>),
        );
        let type_annotation = self.ast.ts_type_annotation(SPAN, string_literal_type);

        let param = self.create_formal_parameter("artifact", Some(type_annotation));
        let params = self.create_formal_parameters(param);

        let function = self.decl_function("graphql", params, return_annotation, None);

        self.stmt_export_value(function)
    }

    fn stmt_schema_declaration(&self) -> Statement<'b> {
        let schema_type = self.type_import("$Schema");
        let type_annotation = self.ast.ts_type_annotation(SPAN, schema_type);

        let id = self.ast.binding_pattern(
            self.ast.binding_pattern_kind_binding_identifier(SPAN, self.ast.atom("schema")),
            Some(self.ast.alloc(type_annotation)),
            false,
        );

        let declarator = self.ast.variable_declarator(
            SPAN,
            VariableDeclarationKind::Const,
            id,
            None,
            false,
        );

        let declarators = self.ast.vec1(declarator);
        let var_decl = self.ast.variable_declaration(
            SPAN,
            VariableDeclarationKind::Const,
            declarators,
            true,
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

    fn stmt_export_type(&self, declaration: Declaration<'b>) -> Statement<'b> {
        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(declaration),
            self.ast.vec(),
            None,
            ImportOrExportKind::Type,
            None::<OxcBox<WithClause>>,
        );
        Statement::ExportNamedDeclaration(self.ast.alloc(export_decl))
    }

    fn stmt_export_value(&self, declaration: Declaration<'b>) -> Statement<'b> {
        let export_decl = self.ast.export_named_declaration(
            SPAN,
            Some(declaration),
            self.ast.vec(),
            None,
            ImportOrExportKind::Value,
            None::<OxcBox<WithClause>>,
        );
        Statement::ExportNamedDeclaration(self.ast.alloc(export_decl))
    }

    fn stmt_module_decl(&self, name: &'b str, statements: StmtVec<'b>) -> Statement<'b> {
        let module_body = self
            .ast
            .ts_module_declaration_body_module_block(SPAN, self.ast.vec(), statements);

        let module_name = self
            .ast
            .ts_module_declaration_name_string_literal(SPAN, name, None::<Atom>);

        let module_decl = self.ast.ts_module_declaration(
            SPAN,
            module_name,
            Some(module_body),
            TSModuleDeclarationKind::Module,
            true,
        );

        Statement::from(Declaration::TSModuleDeclaration(self.ast.alloc(module_decl)))
    }

    fn decl_type_alias(&self, name: &str, ts_type: TSType<'b>) -> Declaration<'b> {
        let ts_type_alias = self.ast.ts_type_alias_declaration(
            SPAN,
            self.create_binding_identifier(name),
            None::<OxcBox<TSTypeParameterDeclaration>>,
            ts_type,
            false,
        );
        Declaration::TSTypeAliasDeclaration(self.ast.alloc(ts_type_alias))
    }

    fn decl_function(
        &self,
        name: &str,
        params: OxcBox<'b, FormalParameters<'b>>,
        return_type_annotation: TSTypeAnnotation<'b>,
        body: Option<OxcBox<'b, FunctionBody<'b>>>,
    ) -> Declaration<'b> {
        let function = Function {
            span: SPAN,
            r#type: FunctionType::FunctionDeclaration,
            id: Some(self.create_binding_identifier(name)),
            generator: false,
            r#async: false,
            declare: false,
            type_parameters: None,
            this_param: None,
            params,
            return_type: Some(self.ast.alloc(return_type_annotation)),
            body,
            scope_id: std::cell::Cell::new(None),
            pife: false,
            pure: false,
        };

        Declaration::FunctionDeclaration(self.ast.alloc(function))
    }

    fn type_import(&self, type_name: &str) -> TSType<'b> {
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

    fn type_ref(&self, type_name: &str) -> TSType<'b> {
        let type_name_str = self.ast.allocator.alloc_str(type_name);
        self.ast.ts_type_type_reference(
            SPAN,
            self.ast.ts_type_name_identifier_reference(SPAN, type_name_str),
            None::<OxcBox<TSTypeParameterInstantiation>>,
        )
    }

    fn create_binding_identifier(&self, name: &str) -> BindingIdentifier<'b> {
        let name_str = self.ast.allocator.alloc_str(name);
        self.ast.binding_identifier(SPAN, name_str)
    }

    fn create_binding_pattern(
        &self,
        name: &'b str,
        type_annotation: Option<TSTypeAnnotation<'b>>,
    ) -> BindingPattern<'b> {
        self.ast.binding_pattern(
            self.ast.binding_pattern_kind_binding_identifier(SPAN, Atom::from(name)),
            type_annotation.map(|t| self.ast.alloc(t)),
            false,
        )
    }

    fn create_formal_parameter(
        &self,
        name: &'b str,
        type_annotation: Option<TSTypeAnnotation<'b>>,
    ) -> FormalParameter<'b> {
        let pattern = self.create_binding_pattern(name, type_annotation);
        self.ast
            .formal_parameter(SPAN, self.ast.vec(), pattern, None, false, false)
    }

    fn create_formal_parameters(&self, param: FormalParameter<'b>) -> OxcBox<'b, FormalParameters<'b>> {
        let mut params = self.ast.vec();
        params.push(param);
        self.ast.alloc(self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::Signature,
            params,
            None::<OxcBox<BindingRestElement>>,
        ))
    }
}
