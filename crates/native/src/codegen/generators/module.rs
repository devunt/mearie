use super::super::CodegenContext;
use crate::error::Result;
use crate::graphql::ast::*;
use crate::schema::{DocumentIndex, SchemaIndex, TypeInfo};
use crate::source::SourceBuf;
use itertools::chain;
use oxc_allocator::Box as OxcBox;
use oxc_ast::AstBuilder;
use oxc_ast::ast::*;
use oxc_codegen::Codegen;
use oxc_span::{SPAN, SourceType};
use std::fmt::Write as _;

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
        let module_declaration_statement = self.stmt_module_decl("$mearie", module_statements);

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

        let mut code = Codegen::new().build(&program).code;
        code.push_str(&self.gen_typed_graphql_type_surface());

        Ok(SourceBuf {
            code,
            file_path: "graphql.d.ts".to_string(),
            importable_file_path: None,
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
            self.gen_fragment_vars_exports(),
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

    fn gen_fragment_vars_exports(&self) -> StmtVec<'b> {
        self.gen_type_exports(
            self.document
                .fragments()
                .filter(|fragment| !fragment.variable_definitions.is_empty())
                .map(|fragment| format!("{}$vars", fragment.name.as_str())),
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

    fn gen_typed_graphql_type_surface(&self) -> String {
        let mut out = String::new();
        out.push_str("\n\n");
        self.write_typed_graphql_prelude(&mut out);
        self.write_typed_graphql_input_object_types(&mut out);
        self.write_typed_graphql_variable_builder(&mut out);
        self.write_typed_graphql_directive_map(&mut out);
        self.write_typed_graphql_selection_types(&mut out);
        self.write_typed_graphql_fragment_types(&mut out);
        self.write_typed_graphql_specs(&mut out);
        self.write_typed_graphql_graphql_namespace(&mut out);
        out
    }

    fn write_typed_graphql_prelude(&self, out: &mut String) {
        out.push_str(
            r#"type $$Scalars = import("./types.d.ts").$Scalars;
type $$Nullable<T> = import("mearie/types").Nullable<T>;
type $$List<T> = import("mearie/types").List<T>;
type $$Artifact<Kind extends "query" | "mutation" | "subscription" | "fragment", Name extends string, Data = unknown, Variables = unknown> = import("mearie/types").Artifact<Kind, Name, Data, Variables>;
type $$FragmentRefs<Name extends string> = import("mearie/types").FragmentRefs<Name>;
type $$Depth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
type $$PrevDepth<Depth extends $$Depth> = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15][Depth];
type $$VariableDef<Value, Required extends boolean = false, Shape = $$Leaf<Value>, Default = never> = {
	readonly " $value"?: Value;
	readonly " $required"?: Required;
	readonly " $shape"?: Shape;
	readonly " $default": Default;
};
type $$Leaf<Value> = {
	readonly " $leaf": Value;
};
type $$EnumLeaf<Value extends string> = {
	readonly " $enumLeaf": Value;
};
type $$EnumLiteral<Value extends string = string> = {
	readonly " $enum": Value;
};
type $$StringLiteral<Value extends string> = string extends Value ? never : Value;
type $$OutputLeaf<Value> = {
	readonly " $output": Value;
};
type $$OutputComposite<TypeName extends string> = {
	readonly " $composite": TypeName;
};
type $$OutputList<Item> = {
	readonly " $list": Item;
};
type $$OutputNullable<Item> = {
	readonly " $nullable": Item;
};
type $$VariableDefinitions = Record<string, $$VariableDef<unknown, boolean, unknown, unknown>>;
type $$VariableValue<Def> = Def extends $$VariableDef<infer Value, boolean, unknown, unknown> ? Value : never;
type $$VariableShape<Def> = Def extends $$VariableDef<unknown, boolean, infer Shape, unknown> ? Shape : $$Leaf<$$VariableValue<Def>>;
type $$VariableDefault<Def> = Def extends $$VariableDef<unknown, boolean, unknown, infer Default> ? Default : never;
type $$VariableHasNonNullDefault<Def, Default = $$VariableDefault<Def>> =
	[Default] extends [never] ? false :
	null extends Default ? false :
	true;
type $$RequiredVariableKeys<Defs extends $$VariableDefinitions> = {
	[Key in keyof Defs]-?: Defs[Key] extends $$VariableDef<unknown, true, unknown, unknown> ? Key : never;
}[keyof Defs];
type $$VariablesOf<Defs extends $$VariableDefinitions> = {
	[Key in $$RequiredVariableKeys<Defs>]: $$VariableValue<Defs[Key]>;
} & {
	[Key in Exclude<keyof Defs, $$RequiredVariableKeys<Defs>>]?: $$VariableValue<Defs[Key]>;
};
type $$VariableArgsOf<Defs extends $$VariableDefinitions> = {
	[Key in $$RequiredVariableKeys<Defs>]: $$VariableShape<Defs[Key]>;
} & {
	[Key in Exclude<keyof Defs, $$RequiredVariableKeys<Defs>>]?: $$VariableShape<Defs[Key]>;
};
type $$VariableRef<Name extends string = string, Value = unknown> = {
	readonly " $variable": Name;
	readonly " $value"?: Value;
};
type $$VariableRefs<Defs extends $$VariableDefinitions> = {
	readonly [Key in keyof Defs]: $$VariableRef<Extract<Key, string>, $$VariableValue<Defs[Key]>>;
};
type $$VariableRefFor<Value, Defs extends $$VariableDefinitions> = {
	[Key in keyof Defs]: $$VariableValue<Defs[Key]> extends Value
		? $$VariableRef<Extract<Key, string>, $$VariableValue<Defs[Key]>>
		: $$VariableHasNonNullDefault<Defs[Key]> extends true
			? NonNullable<$$VariableValue<Defs[Key]>> extends Value
				? $$VariableRef<Extract<Key, string>, $$VariableValue<Defs[Key]>>
				: never
			: never;
}[keyof Defs];
type $$InputValue<Shape> =
	Shape extends $$EnumLeaf<infer Value extends string> ? Value :
	Shape extends $$Leaf<infer Value> ? Value :
	Shape extends readonly (infer Item)[] ? $$List<$$InputValue<Item>> :
	Shape extends object ? { [Key in keyof Shape]: $$InputValue<Shape[Key]> } :
	Shape;
type $$InputLiteral<Shape, Defs extends $$VariableDefinitions> =
	Shape extends $$EnumLeaf<infer Value extends string> ? $$EnumLiteral<Value> :
	Shape extends $$Leaf<infer Value> ? Value :
	Shape extends readonly (infer Item)[] ? readonly $$Input<Item, Defs>[] :
	Shape extends object ? { [Key in keyof Shape]: $$Input<Shape[Key], Defs> } :
	Shape;
type $$Input<Shape, Defs extends $$VariableDefinitions> =
	| $$VariableRefFor<$$InputValue<Shape>, Defs>
	| $$InputLiteral<Shape, Defs>;
type $$Args<Args, Defs extends $$VariableDefinitions> = {
	[Key in keyof Args]: $$Input<Args[Key], Defs>;
};
type $$RequiredKeys<Value> = {
	[Key in keyof Value]-?: {} extends Pick<Value, Key> ? never : Key;
}[keyof Value];
type $$ArgsConfig<Args, Defs extends $$VariableDefinitions> = [keyof Args] extends [never]
	? { args?: never }
	: $$RequiredKeys<Args> extends never
		? { args?: $$Args<Args, Defs> }
		: { args: $$Args<Args, Defs> };
type $$FieldBase<Defs extends $$VariableDefinitions> = {
	alias?: string;
	directives?: $$DirectiveMap<"FIELD", Defs>;
};
type $$VariableBuilderState = "base" | "nonNullNamed" | "list" | "nonNullList" | "optional" | "terminal";
type $$VariableBuilderFinal<Value, Required extends boolean, Shape, Default, Final extends boolean> =
	Final extends true ? $$VariableDef<Value, Required, Shape, Default> : {};
type $$VariableBuilderType<
	Value,
	Shape = $$Leaf<Value>,
	Required extends boolean = false,
	Final extends boolean = false,
	State extends $$VariableBuilderState = "base",
	HasDirectives extends boolean = false,
	Default = never
> =
	$$VariableBuilderFinal<Value, Required, Shape, Default, Final>
	& (HasDirectives extends true ? {} : {
		directives(directives: $$DirectiveMap<"VARIABLE_DEFINITION", {}>): $$VariableBuilderType<Value, Shape, Required, Final, State, true, Default>;
	}) & (State extends "base" ? {
		nonNull(): $$VariableBuilderType<NonNullable<Value>, NonNullable<Shape>, true, true, "nonNullNamed", HasDirectives>;
		default<const DefaultValue extends $$Input<Shape, {}>>(value: DefaultValue): $$VariableBuilderType<Value, Shape, false, true, "terminal", HasDirectives, DefaultValue>;
		optional(): $$VariableBuilderType<$$Nullable<Value>, $$Nullable<Shape>, false, true, "optional", HasDirectives>;
		list(): $$VariableBuilderType<$$Nullable<$$List<Value>>, $$Nullable<$$List<Shape>>, false, true, "list", HasDirectives>;
	} : State extends "nonNullNamed" ? {
		default<const DefaultValue extends $$Input<Shape, {}>>(value: DefaultValue): $$VariableBuilderType<Value, Shape, false, true, "terminal", HasDirectives, DefaultValue>;
		list(): $$VariableBuilderType<$$Nullable<$$List<Value>>, $$Nullable<$$List<Shape>>, false, true, "list", HasDirectives>;
	} : State extends "list" ? {
		nonNull(): $$VariableBuilderType<NonNullable<Value>, NonNullable<Shape>, true, true, "nonNullList", HasDirectives>;
		default<const DefaultValue extends $$Input<Shape, {}>>(value: DefaultValue): $$VariableBuilderType<Value, Shape, false, true, "terminal", HasDirectives, DefaultValue>;
		optional(): $$VariableBuilderType<$$Nullable<Value>, $$Nullable<Shape>, false, true, "optional", HasDirectives>;
	} : State extends "nonNullList" | "optional" ? {
		default<const DefaultValue extends $$Input<Shape, {}>>(value: DefaultValue): $$VariableBuilderType<Value, Shape, false, true, "terminal", HasDirectives, DefaultValue>;
	} : {
	});
type $$FieldConfig<Args, Defs extends $$VariableDefinitions> = $$FieldBase<Defs> & $$ArgsConfig<Args, Defs>;
type $$NoArgsFieldConfig<Defs extends $$VariableDefinitions> = $$FieldBase<Defs> & {
	args?: never;
};
type $$FragmentSpreadConfig<Args, Defs extends $$VariableDefinitions> = {
	directives?: $$DirectiveMap<"FRAGMENT_SPREAD", Defs>;
} & $$ArgsConfig<Args, Defs>;
type $$InlineFragmentConfig<Target extends string | never, Defs extends $$VariableDefinitions> = {
	on: Target;
	directives?: $$DirectiveMap<"INLINE_FRAGMENT", Defs>;
};
type $$AnonymousInlineFragmentConfig<Defs extends $$VariableDefinitions> = {
	on?: never;
	directives?: $$DirectiveMap<"INLINE_FRAGMENT", Defs>;
};
type $$ScalarField<Args, Defs extends $$VariableDefinitions> =
	| ($$RequiredKeys<Args> extends never ? true : never)
	| readonly [$$FieldConfig<Args, Defs>];
type $$ScalarFieldNoArgs<Defs extends $$VariableDefinitions> =
	| true
	| readonly [$$NoArgsFieldConfig<Defs>];
type $$CompositeField<TypeName extends string, Args, Defs extends $$VariableDefinitions, Depth extends $$Depth> =
	| ($$RequiredKeys<Args> extends never ? $$SelectionFor<TypeName, Defs, $$PrevDepth<Depth>> : never)
	| readonly [$$FieldConfig<Args, Defs>, $$SelectionFor<TypeName, Defs, $$PrevDepth<Depth>>];
type $$CompositeFieldNoArgs<TypeName extends string, Defs extends $$VariableDefinitions, Depth extends $$Depth> =
	| $$SelectionFor<TypeName, Defs, $$PrevDepth<Depth>>
	| readonly [$$NoArgsFieldConfig<Defs>, $$SelectionFor<TypeName, Defs, $$PrevDepth<Depth>>];
type $$LooseSelection = Record<string, unknown>;
type $$NoExtraSelectionKeys<Selection, Shape> = {
	[Key in Exclude<keyof Selection, keyof Shape>]: never;
};
type $$ExactSelectionFor<TypeName extends string, Defs extends $$VariableDefinitions, Selection, Depth extends $$Depth = 12> =
	Depth extends 0 ? Selection :
	$$SelectionFor<TypeName, Defs, Depth> extends infer Shape
		? Selection
			& $$NoExtraSelectionKeys<Selection, Shape>
			& $$ExactSelectionFields<TypeName, Defs, Selection, Depth>
		: Selection;
type $$ExactSelectionFields<TypeName extends string, Defs extends $$VariableDefinitions, Selection, Depth extends $$Depth, Fields = $$OutputFieldsFor<TypeName>> = {
	[Key in Extract<keyof Selection, keyof Fields>]: $$ExactSelectionField<Defs, Selection[Key], Fields[Key], Depth>;
} & ("$" extends keyof Selection ? {
	"$": $$ExactFragmentList<TypeName, Defs, Selection["$"], Depth>;
} : {});
type $$ExactSelectionField<Defs extends $$VariableDefinitions, Field, Shape, Depth extends $$Depth> =
	Shape extends $$OutputNullable<infer Item> ? $$ExactSelectionField<Defs, Field, Item, Depth> :
	Shape extends $$OutputList<infer Item> ? $$ExactSelectionField<Defs, Field, Item, Depth> :
	Shape extends $$OutputComposite<infer TypeName> ? $$ExactCompositeSelectionField<TypeName, Defs, Field, Depth> :
	Field;
type $$ExactCompositeSelectionField<TypeName extends string, Defs extends $$VariableDefinitions, Field, Depth extends $$Depth> =
	Field extends readonly [infer Config, infer Selection]
		? readonly [Config, $$ExactSelectionFor<TypeName, Defs, Selection, $$PrevDepth<Depth>>]
		: $$ExactSelectionFor<TypeName, Defs, Field, $$PrevDepth<Depth>>;
type $$ExactFragmentList<Parent extends string, Defs extends $$VariableDefinitions, Items, Depth extends $$Depth> =
	Items extends readonly [infer Head, ...infer Tail]
		? readonly [$$ExactFragmentLike<Parent, Defs, Head, Depth>, ...$$ExactFragmentTail<Parent, Defs, Tail, Depth>]
		: Items;
type $$ExactFragmentTail<Parent extends string, Defs extends $$VariableDefinitions, Items extends readonly unknown[], Depth extends $$Depth> =
	Items extends readonly [infer Head, ...infer Tail]
		? readonly [$$ExactFragmentLike<Parent, Defs, Head, Depth>, ...$$ExactFragmentTail<Parent, Defs, Tail, Depth>]
		: readonly [];
type $$ExactFragmentLike<Parent extends string, Defs extends $$VariableDefinitions, Item, Depth extends $$Depth> =
	Item extends $$Artifact<"fragment", any, unknown, unknown> ? Item :
	Item extends readonly [infer Config, infer Payload]
		? Payload extends $$Artifact<"fragment", any, unknown, unknown>
			? readonly [$$FragmentSpreadConfig<$$FragmentSpreadArgsOf<Payload>, Defs>, Payload]
			: Config extends { on: infer Target extends string }
				? readonly [Config, $$ExactSelectionFor<Target, Defs, Payload, $$PrevDepth<Depth>>]
				: readonly [Config, $$ExactSelectionFor<Parent, Defs, Payload, $$PrevDepth<Depth>>]
		: Item extends object ? $$ExactSelectionFor<Parent, Defs, Item, $$PrevDepth<Depth>> : Item;
type $$OutputIsNullable<Shape> = Shape extends $$OutputNullable<unknown> ? true : false;
type $$SelectionFieldValue<Field> = Field extends readonly [unknown, infer Selection] ? Selection : Field;
type $$SelectionFieldConfig<Field, Shape> =
	Shape extends $$OutputNullable<infer Item> ? $$SelectionFieldConfig<Field, Item> :
	Shape extends $$OutputList<infer Item> ? $$SelectionFieldConfig<Field, Item> :
	Shape extends $$OutputComposite<string> ? Field extends readonly [infer Config, unknown] ? Config : {} :
	Field extends readonly [infer Config] ? Config : Field extends true ? {} : Field;
type $$SelectionDataKey<Field, Shape, Fallback extends string> =
	$$SelectionFieldConfig<Field, Shape> extends { alias: infer Alias extends string } ? Alias : Fallback;
type $$SelectionFieldDirectives<Field, Shape> =
	$$SelectionFieldConfig<Field, Shape> extends { directives: infer Directives } ? Directives : {};
type $$DirectiveIfValue<Directive> = Directive extends { if: infer Value } ? Value : never;
type $$SkipDirectiveMakesFieldOptional<Directive> =
	$$DirectiveIfValue<Directive> extends false ? false : true;
type $$IncludeDirectiveMakesFieldOptional<Directive> =
	$$DirectiveIfValue<Directive> extends true ? false : true;
type $$DirectivesHaveConditionalDirective<Directives> =
	(Directives extends { skip: infer Directive } ? $$SkipDirectiveMakesFieldOptional<Directive> : false) extends true ? true :
	(Directives extends { include: infer Directive } ? $$IncludeDirectiveMakesFieldOptional<Directive> : false) extends true ? true :
	false;
type $$FieldHasConditionalDirective<Field, Shape, Directives = $$SelectionFieldDirectives<Field, Shape>> =
	$$DirectivesHaveConditionalDirective<Directives>;
type $$FieldHasRequiredDirective<Field, Shape> =
	$$SelectionFieldDirectives<Field, Shape> extends { required: unknown } ? true : false;
type $$DirectiveEnumValue<Value> = Value extends $$EnumLiteral<infer Literal extends string> ? Literal : Value;
type $$RequiredDirectiveAction<Directive> = Directive extends { action: infer Action } ? $$DirectiveEnumValue<Action> : never;
type $$FieldHasCascadeDirective<Field, Shape> =
	$$SelectionFieldDirectives<Field, Shape> extends { required: infer Directive }
		? $$RequiredDirectiveAction<Directive> extends "CASCADE" ? true : false
		: false;
type $$FieldIsRequiredDataKey<Field, Shape> =
	$$FieldHasConditionalDirective<Field, Shape> extends true ? false :
	$$OutputIsNullable<Shape> extends true ? $$FieldHasRequiredDirective<Field, Shape> : true;
type $$SelectedFieldKeys<Fields, Selection> = Extract<keyof Selection, keyof Fields>;
type $$FieldNestedCascadeEscapes<Field, Shape> =
	Shape extends $$OutputNullable<infer Item> ? $$FieldNestedCascadeEscapes<Field, Item> :
	Shape extends $$OutputList<infer Item> ? $$FieldNestedCascadeEscapes<Field, Item> :
	Shape extends $$OutputComposite<infer TypeName> ? $$SelectionSetHasEscapingCascade<TypeName, $$SelectionFieldValue<Field>> :
	false;
type $$FieldCascadeEscapes<Field, Shape> =
	$$FieldHasCascadeDirective<Field, Shape> extends true ? true :
	$$FieldNestedCascadeEscapes<Field, Shape> extends true
		? $$OutputIsNullable<Shape> extends true ? $$FieldHasRequiredDirective<Field, Shape> : true
		: false;
type $$FragmentItemHasEscapingCascade<Parent extends string, Item> =
	Item extends $$Artifact<"fragment", any, unknown, unknown> ? false :
	Item extends readonly [infer Config, infer Payload]
		? Payload extends $$Artifact<"fragment", any, unknown, unknown>
			? false
			: Config extends { on: infer Target extends string }
				? $$CanSpread<Parent, Target> extends never ? false : $$SelectionSetHasEscapingCascade<Target, Payload>
				: $$SelectionSetHasEscapingCascade<Parent, Payload>
		: Item extends object ? $$SelectionSetHasEscapingCascade<Parent, Item> : false;
type $$FragmentListHasEscapingCascade<Parent extends string, Items> =
	Items extends readonly (infer Item)[]
		? true extends (Item extends unknown ? $$FragmentItemHasEscapingCascade<Parent, Item> : never) ? true : false
		: false;
type $$SelectionFragmentsHaveEscapingCascade<TypeName extends string, Selection> =
	Selection extends { "$"?: infer Items } ? $$FragmentListHasEscapingCascade<TypeName, Items> : false;
type $$SelectionFieldsHaveEscapingCascade<TypeName extends string, Selection, Fields = $$OutputFieldsFor<TypeName>> =
	true extends {
		[Key in $$SelectedFieldKeys<Fields, Selection>]-?: $$FieldCascadeEscapes<Selection[Key], Fields[Key]>;
	}[$$SelectedFieldKeys<Fields, Selection>] ? true : false;
type $$SelectionSetHasEscapingCascade<TypeName extends string, Selection, Fields = $$OutputFieldsFor<TypeName>> =
	$$SelectionFieldsHaveEscapingCascade<TypeName, Selection, Fields> extends true ? true :
	$$SelectionFragmentsHaveEscapingCascade<TypeName, Selection> extends true ? true :
	false;
type $$RequiredSelectedFieldKeys<Fields, Selection> = {
	[Key in $$SelectedFieldKeys<Fields, Selection>]-?: $$FieldIsRequiredDataKey<Selection[Key], Fields[Key]> extends true ? Key : never;
}[$$SelectedFieldKeys<Fields, Selection>];
type $$OptionalSelectedFieldKeys<Fields, Selection> = Exclude<$$SelectedFieldKeys<Fields, Selection>, $$RequiredSelectedFieldKeys<Fields, Selection>>;
type $$OutputValue<Shape, Selection = never, Required extends boolean = false> =
	Shape extends $$OutputNullable<infer Item> ? Required extends true ? $$OutputValue<Item, Selection> : $$Nullable<$$OutputValue<Item, Selection>> :
	Shape extends $$OutputList<infer Item> ? $$List<$$OutputValue<Item, Selection>> :
	Shape extends $$OutputLeaf<infer Value> ? Value :
	Shape extends $$OutputComposite<infer TypeName> ? $$DataForSelection<TypeName, Selection> :
	never;
type $$FragmentArtifact<Name extends string, TypeName extends string, Data, Variables, Defs extends $$VariableDefinitions = {}> =
	$$Artifact<"fragment", Name, Data, Variables> & {
		readonly " $key"?: $$FragmentRefs<Name>;
		readonly " $fragmentType"?: TypeName;
		readonly " $fragmentVariables"?: Defs;
	};
type $$FragmentArtifactFor<Parent extends string> =
	$$FragmentArtifact<string, $$InlineTarget<Parent>, unknown, unknown, $$VariableDefinitions>;
type $$FragmentVariableDefinitions<Fragment> =
	Fragment extends $$FragmentArtifact<string, string, unknown, unknown, infer Defs> ? Defs : {};
type $$FragmentSpreadArgsOf<Payload> =
	Payload extends $$FragmentArtifact<string, string, unknown, unknown, infer Defs>
		? $$VariableArgsOf<Defs>
		: $$VariableArgsOf<$$VariableDefinitions>;
type $$ArtifactData<Artifact> = Artifact extends $$Artifact<any, any, infer Data, any> ? Data : never;
type $$ArtifactName<Artifact> = Artifact extends $$Artifact<any, infer Name, any, any> ? Name : never;
type $$UnionToIntersection<Union> =
	(Union extends unknown ? (value: Union) => void : never) extends (value: infer Intersection) => void ? Intersection : unknown;
type $$DistributivePartial<Data> = Data extends unknown ? Partial<Data> : never;
type $$FragmentConfigDirectives<Config> = Config extends { directives: infer Directives } ? Directives : {};
type $$FragmentConfigHasConditionalDirective<Config> =
	$$DirectivesHaveConditionalDirective<$$FragmentConfigDirectives<Config>>;
type $$DataForFragmentConfig<Config, Data> =
	$$FragmentConfigHasConditionalDirective<Config> extends true ? $$DistributivePartial<Data> : Data;
type $$FragmentArrayData<Parent extends string, Items> =
	Items extends readonly (infer Item)[] ? $$UnionToIntersection<$$FragmentItemData<Parent, Item>> : {};
type $$FragmentItemData<Parent extends string, Item> =
	Item extends $$Artifact<"fragment", any, unknown, unknown> ? $$FragmentRefs<$$ArtifactName<Item>> :
	Item extends readonly [infer Config, infer Payload]
		? Payload extends $$Artifact<"fragment", any, unknown, unknown>
			? $$DataForFragmentConfig<Config, $$FragmentRefs<$$ArtifactName<Payload>>>
			: Config extends { on: infer Target extends string }
				? $$CanSpread<Parent, Target> extends never ? {} : $$DataForFragmentConfig<Config, $$DataForSelection<Target, Payload>>
				: $$DataForFragmentConfig<Config, $$DataForSelection<Parent, Payload>>
		: Item extends object ? $$DataForSelection<Parent, Item> : {};
type $$FragmentDataForSelection<Parent extends string, Selection> =
	Selection extends { "$"?: infer Items } ? $$FragmentArrayData<Parent, Items> : {};
type $$DataForSelection<TypeName extends string, Selection> =
	$$DataForSelectionBody<TypeName, Selection> extends infer Data
		? $$SelectionSetHasEscapingCascade<TypeName, Selection> extends true ? $$Nullable<Data> : Data
		: never;
type $$DataForSelectionBody<TypeName extends string, Selection> =
	$$PossibleTypes<TypeName> extends infer Concrete
		? Concrete extends string
			? $$DataForConcreteSelection<Concrete, Selection>
			: never
		: never;
type $$DataForConcreteSelection<TypeName extends string, Selection, Fields = $$OutputFieldsFor<TypeName>> = {
	[Key in $$RequiredSelectedFieldKeys<Fields, Selection> as Key extends string ? $$SelectionDataKey<Selection[Key], Fields[Key], Key> : never]-?: $$OutputValue<Fields[Key], $$SelectionFieldValue<Selection[Key]>, $$FieldHasRequiredDirective<Selection[Key], Fields[Key]>>;
} & {
	[Key in $$OptionalSelectedFieldKeys<Fields, Selection> as Key extends string ? $$SelectionDataKey<Selection[Key], Fields[Key], Key> : never]?: $$OutputValue<Fields[Key], $$SelectionFieldValue<Selection[Key]>, $$FieldHasRequiredDirective<Selection[Key], Fields[Key]>>;
} & $$FragmentDataForSelection<TypeName, Selection>;
"#,
        );
    }

    fn write_typed_graphql_input_object_types(&self, out: &mut String) {
        for input_object in self.sorted_input_objects() {
            writeln!(
                out,
                "type {} = {};",
                self.ts_input_object_shape_name(input_object.name.as_str()),
                self.ts_input_object_shape(input_object)
            )
            .unwrap();
        }
    }

    fn write_typed_graphql_variable_builder(&self, out: &mut String) {
        writeln!(out, "type $$VariableBuilder = {{").unwrap();

        for (name, value_type, shape_type) in self.variable_builder_entries() {
            writeln!(
                out,
                "\t{}: $$VariableBuilderType<$$Nullable<{}>, $$Nullable<{}>>;",
                self.ts_key(name),
                value_type,
                shape_type
            )
            .unwrap();
        }

        writeln!(out, "}};").unwrap();
    }

    fn write_typed_graphql_directive_map(&self, out: &mut String) {
        let locations = [
            "QUERY",
            "MUTATION",
            "SUBSCRIPTION",
            "FIELD",
            "FRAGMENT_DEFINITION",
            "FRAGMENT_SPREAD",
            "INLINE_FRAGMENT",
            "VARIABLE_DEFINITION",
        ];

        writeln!(out, "type $$DirectiveLocation = {};", self.ts_string_union(&locations)).unwrap();
        writeln!(
            out,
            "type $$DirectiveMapByLocation<Defs extends $$VariableDefinitions> = {{"
        )
        .unwrap();

        for location in locations {
            let directives = self.directives_for_location(location);
            if directives.is_empty() {
                writeln!(out, "\t{}: Record<string, never>;", self.ts_key(location)).unwrap();
                continue;
            }

            writeln!(out, "\t{}: {{", self.ts_key(location)).unwrap();

            for directive in directives {
                writeln!(
                    out,
                    "\t\t{}?: {};",
                    self.ts_key(directive.name.as_str()),
                    self.ts_directive_args_type(directive)
                )
                .unwrap();
            }

            writeln!(out, "\t}};").unwrap();
        }

        writeln!(out, "}};").unwrap();
        writeln!(
            out,
            "type $$DirectiveMap<Location extends $$DirectiveLocation, Defs extends $$VariableDefinitions> = $$DirectiveMapByLocation<Defs>[Location];"
        )
        .unwrap();
    }

    fn write_typed_graphql_selection_types(&self, out: &mut String) {
        let composite_types = self.composite_type_names();

        for type_name in &composite_types {
            writeln!(
                out,
                "type $$Selection_{}<Defs extends $$VariableDefinitions, Depth extends $$Depth> = {{",
                type_name
            )
            .unwrap();
            writeln!(out, "\t{}?: $$ScalarFieldNoArgs<Defs>;", self.ts_key("__typename")).unwrap();

            for (field_name, field_def) in self.sorted_fields(type_name) {
                let field_type_name = field_def.typ.innermost_type().as_str();
                let has_args = !field_def.arguments.is_empty();
                let field_type = if self.schema.is_composite(field_type_name) {
                    if has_args {
                        let args_type = self.ts_args_object_type(&field_def.arguments);
                        format!("$$CompositeField<{:?}, {}, Defs, Depth>", field_type_name, args_type)
                    } else {
                        format!("$$CompositeFieldNoArgs<{:?}, Defs, Depth>", field_type_name)
                    }
                } else if has_args {
                    let args_type = self.ts_args_object_type(&field_def.arguments);
                    format!("$$ScalarField<{}, Defs>", args_type)
                } else {
                    "$$ScalarFieldNoArgs<Defs>".to_string()
                };

                writeln!(out, "\t{}?: {};", self.ts_key(field_name), field_type).unwrap();
            }

            writeln!(
                out,
                "\t{}?: $$FragmentList<{:?}, Defs, Depth>;",
                self.ts_key("$"),
                type_name
            )
            .unwrap();
            writeln!(out, "}};").unwrap();
        }

        self.write_typed_graphql_output_field_types(out, &composite_types);

        writeln!(
            out,
            "type $$SelectionMap<Defs extends $$VariableDefinitions, Depth extends $$Depth> = {{"
        )
        .unwrap();
        for type_name in &composite_types {
            writeln!(
                out,
                "\t{}: $$Selection_{}<Defs, Depth>;",
                self.ts_key(type_name),
                type_name
            )
            .unwrap();
        }
        writeln!(out, "}};").unwrap();
        writeln!(
            out,
            "type $$SelectionFor<TypeName extends string, Defs extends $$VariableDefinitions, Depth extends $$Depth = 12> ="
        )
        .unwrap();
        writeln!(out, "\tDepth extends 0 ? $$LooseSelection :").unwrap();
        writeln!(
            out,
            "\tTypeName extends keyof $$SelectionMap<Defs, Depth> ? $$SelectionMap<Defs, Depth>[TypeName] :"
        )
        .unwrap();
        writeln!(out, "\t$$LooseSelection;").unwrap();

        self.write_possible_types(out, &composite_types);
    }

    fn write_typed_graphql_output_field_types(&self, out: &mut String, composite_types: &[&'b str]) {
        for type_name in composite_types {
            writeln!(out, "type $$OutputFields_{} = {{", type_name).unwrap();
            writeln!(
                out,
                "\t{}: $$OutputLeaf<{}>;",
                self.ts_key("__typename"),
                self.ts_string_union(&self.possible_type_names(type_name))
            )
            .unwrap();

            for (field_name, field_def) in self.sorted_fields(type_name) {
                writeln!(
                    out,
                    "\t{}: {};",
                    self.ts_key(field_name),
                    self.ts_graphql_output_shape(&field_def.typ)
                )
                .unwrap();
            }

            writeln!(out, "}};").unwrap();
        }

        writeln!(out, "type $$OutputFieldsMap = {{").unwrap();
        for type_name in composite_types {
            writeln!(out, "\t{}: $$OutputFields_{};", self.ts_key(type_name), type_name).unwrap();
        }
        writeln!(out, "}};").unwrap();
        writeln!(out, "type $$OutputFieldsFor<TypeName extends string> =").unwrap();
        writeln!(
            out,
            "\tTypeName extends keyof $$OutputFieldsMap ? $$OutputFieldsMap[TypeName] :"
        )
        .unwrap();
        writeln!(out, "\tRecord<string, $$OutputLeaf<unknown>>;").unwrap();
    }

    fn write_possible_types(&self, out: &mut String, composite_types: &[&'b str]) {
        writeln!(
            out,
            "type $$FragmentableTypeName = {};",
            self.ts_string_union(composite_types)
        )
        .unwrap();
        writeln!(out, "type $$PossibleTypesMap = {{").unwrap();

        for type_name in composite_types {
            let possible = self.possible_type_names(type_name);
            let union = if possible.is_empty() {
                format!("{:?}", type_name)
            } else {
                self.ts_string_union(&possible)
            };
            writeln!(out, "\t{}: {};", self.ts_key(type_name), union).unwrap();
        }

        writeln!(out, "}};").unwrap();
        writeln!(out, "type $$PossibleTypes<TypeName extends string> =").unwrap();
        writeln!(
            out,
            "\tTypeName extends keyof $$PossibleTypesMap ? $$PossibleTypesMap[TypeName] :"
        )
        .unwrap();
        writeln!(out, "\tTypeName;").unwrap();
        writeln!(out, "type $$InlineTargetMap = {{").unwrap();
        for type_name in composite_types {
            let targets = self.spread_target_names(type_name, composite_types);
            writeln!(out, "\t{}: {};", self.ts_key(type_name), self.ts_string_union(&targets)).unwrap();
        }
        writeln!(out, "}};").unwrap();
        writeln!(
            out,
            "type $$InlineTarget<Parent extends string> = Parent extends keyof $$InlineTargetMap ? $$InlineTargetMap[Parent] : never;"
        )
        .unwrap();
        writeln!(
            out,
            "type $$CanSpread<Parent extends string, Child extends string> = Extract<Child, $$InlineTarget<Parent>> extends never ? never : unknown;"
        )
        .unwrap();
    }

    fn write_typed_graphql_fragment_types(&self, out: &mut String) {
        let fragments = self.sorted_fragments();

        writeln!(out, "type $$GeneratedFragmentMap = {{").unwrap();
        for parent in self.composite_type_names() {
            let fragment_names = fragments
                .iter()
                .filter_map(|fragment| {
                    if self.can_spread(parent, fragment.type_condition.as_str()) {
                        Some(fragment.name.as_str())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();

            if !fragment_names.is_empty() {
                writeln!(out, "\t{}: {};", self.ts_key(parent), fragment_names.join(" | ")).unwrap();
            }
        }
        writeln!(out, "}};").unwrap();
        writeln!(
            out,
            "type $$GeneratedFragmentFor<Parent extends string> = Parent extends keyof $$GeneratedFragmentMap ? $$GeneratedFragmentMap[Parent] : never;"
        )
        .unwrap();
        writeln!(
            out,
            "type $$FragmentFor<Parent extends string> = $$FragmentArtifactFor<Parent> | $$GeneratedFragmentFor<Parent>;"
        )
        .unwrap();

        writeln!(
            out,
            "type $$GeneratedFragmentSpreadMap<Defs extends $$VariableDefinitions> = {{"
        )
        .unwrap();
        for parent in self.composite_type_names() {
            let mut fragment_spreads = Vec::new();
            for fragment in &fragments {
                if self.can_spread(parent, fragment.type_condition.as_str()) {
                    fragment_spreads.push(format!(
                        "readonly [$$FragmentSpreadConfig<{}, Defs>, {}]",
                        self.ts_fragment_vars_type(fragment),
                        fragment.name.as_str()
                    ));
                }
            }

            if !fragment_spreads.is_empty() {
                writeln!(out, "\t{}: {};", self.ts_key(parent), fragment_spreads.join(" | ")).unwrap();
            }
        }
        writeln!(out, "}};").unwrap();
        writeln!(
            out,
            "type $$GeneratedFragmentSpreadFor<Parent extends string, Defs extends $$VariableDefinitions> = Parent extends keyof $$GeneratedFragmentSpreadMap<Defs> ? $$GeneratedFragmentSpreadMap<Defs>[Parent] : never;"
        )
        .unwrap();
        writeln!(
            out,
            r#"type $$GenericFragmentSpreadFor<Parent extends string, Defs extends $$VariableDefinitions, Payload extends $$FragmentArtifactFor<Parent> = $$FragmentArtifactFor<Parent>> =
	Payload extends $$FragmentArtifactFor<Parent>
		? readonly [$$FragmentSpreadConfig<$$FragmentSpreadArgsOf<Payload>, Defs>, Payload]
		: never;"#
        )
        .unwrap();
        writeln!(
            out,
            "type $$FragmentSpreadFor<Parent extends string, Defs extends $$VariableDefinitions> = $$GeneratedFragmentSpreadFor<Parent, Defs> | $$GenericFragmentSpreadFor<Parent, Defs>;"
        )
        .unwrap();

        out.push_str(
            r#"type $$InlineFragmentFor<Parent extends string, Defs extends $$VariableDefinitions, Depth extends $$Depth> =
	| readonly [$$AnonymousInlineFragmentConfig<Defs>, $$SelectionFor<Parent, Defs, $$PrevDepth<Depth>>]
	| ($$InlineTarget<Parent> extends infer Target
		? Target extends string
			? readonly [$$InlineFragmentConfig<Target, Defs>, $$SelectionFor<Target, Defs, $$PrevDepth<Depth>>]
			: never
		: never);
type $$FragmentLike<Parent extends string, Defs extends $$VariableDefinitions, Depth extends $$Depth> =
	| $$FragmentFor<Parent>
	| $$FragmentSpreadFor<Parent, Defs>
	| $$SelectionFor<Parent, Defs, $$PrevDepth<Depth>>
	| $$InlineFragmentFor<Parent, Defs, Depth>;
type $$FragmentList<Parent extends string, Defs extends $$VariableDefinitions, Depth extends $$Depth> =
	| readonly []
	| readonly [$$FragmentLike<Parent, Defs, Depth>, ...$$FragmentLike<Parent, Defs, Depth>[]];
"#,
        );
    }

    fn write_typed_graphql_specs(&self, out: &mut String) {
        out.push_str(
            r#"type $$OperationSpec<RootType extends string, DirectiveLocation extends $$DirectiveLocation, Defs extends $$VariableDefinitions, Selection extends $$SelectionFor<RootType, Defs> = $$SelectionFor<RootType, Defs>> = {
	variables?: (t: $$VariableBuilder) => Defs;
	directives?: ($: $$VariableRefs<Defs>) => $$DirectiveMap<DirectiveLocation, Defs>;
	select: ($: $$VariableRefs<Defs>) => $$ExactSelectionFor<RootType, Defs, Selection>;
};
type $$FragmentSpec<TypeName extends $$FragmentableTypeName, Defs extends $$VariableDefinitions, Selection extends $$SelectionFor<TypeName, Defs> = $$SelectionFor<TypeName, Defs>> = {
	variables?: (t: $$VariableBuilder) => Defs;
	directives?: ($: $$VariableRefs<Defs>) => $$DirectiveMap<"FRAGMENT_DEFINITION", Defs>;
	select: ($: $$VariableRefs<Defs>) => $$ExactSelectionFor<TypeName, Defs, Selection>;
};
"#,
        );
    }

    fn write_typed_graphql_graphql_namespace(&self, out: &mut String) {
        writeln!(out, "declare module \"$mearie\" {{").unwrap();
        writeln!(out, "\texport namespace graphql {{").unwrap();
        writeln!(
            out,
            "\t\tconst enumValue: <const Value extends string>(value: $$StringLiteral<Value>) => $$EnumLiteral<Value>;"
        )
        .unwrap();
        writeln!(out, "\t\texport {{ enumValue as enum }};").unwrap();

        for (kind, root_type, location) in [
            ("query", self.root_type_for_operation(OperationType::Query), "QUERY"),
            (
                "mutation",
                self.root_type_for_operation(OperationType::Mutation),
                "MUTATION",
            ),
            (
                "subscription",
                self.root_type_for_operation(OperationType::Subscription),
                "SUBSCRIPTION",
            ),
        ] {
            writeln!(
                out,
                "\t\texport function {}<const Name extends string, Defs extends $$VariableDefinitions = {{}}, const Selection extends $$SelectionFor<{:?}, Defs> = $$SelectionFor<{:?}, Defs>>(name: Name, spec: $$OperationSpec<{:?}, {:?}, Defs, Selection>): $$Artifact<{:?}, Name, $$DataForSelection<{:?}, Selection>, $$VariablesOf<Defs>>;",
                kind,
                root_type,
                root_type,
                root_type,
                location,
                kind,
                root_type
            )
            .unwrap();
        }

        writeln!(
            out,
            "\t\texport function fragment<const Name extends string, TypeName extends $$FragmentableTypeName, Defs extends $$VariableDefinitions = {{}}, const Selection extends $$SelectionFor<TypeName, Defs> = $$SelectionFor<TypeName, Defs>>(name: Name, typeName: TypeName, spec: $$FragmentSpec<TypeName, Defs, Selection>): $$FragmentArtifact<Name, TypeName, $$DataForSelection<TypeName, Selection>, $$VariablesOf<Defs>, Defs>;"
        )
        .unwrap();

        writeln!(out, "\t}}").unwrap();
        writeln!(out, "}}").unwrap();
    }

    fn variable_builder_entries(&self) -> Vec<(&'b str, String, String)> {
        let mut entries: Vec<_> = self
            .schema
            .types()
            .filter_map(|(type_name, type_info)| match type_info {
                TypeInfo::Scalar(_) | TypeInfo::Enum(_) => {
                    let value_type = self.ts_named_type(type_name);
                    let shape_type = self.ts_named_input_shape(type_name);
                    Some((type_name, value_type, shape_type))
                }
                TypeInfo::InputObject(_) => Some((
                    type_name,
                    self.ts_type_import(type_name),
                    self.ts_input_object_shape_name(type_name),
                )),
                _ => None,
            })
            .collect();
        entries.sort_by_key(|(name, _, _)| *name);
        entries
    }

    fn directives_for_location(&self, location: &str) -> Vec<&'b DirectiveDefinition<'b>> {
        let mut directives: Vec<_> = self
            .schema
            .directives()
            .filter(|directive| {
                directive
                    .locations
                    .iter()
                    .any(|directive_location| self.directive_location_name(*directive_location) == Some(location))
            })
            .collect();
        directives.sort_by_key(|directive| directive.name.as_str());
        directives
    }

    fn composite_type_names(&self) -> Vec<&'b str> {
        let mut type_names: Vec<_> = self
            .schema
            .types()
            .filter_map(|(type_name, type_info)| match type_info {
                TypeInfo::Object(_) | TypeInfo::Interface(_) | TypeInfo::Union(_) => Some(type_name),
                _ => None,
            })
            .collect();
        type_names.sort_unstable();
        type_names
    }

    fn sorted_fields(&self, type_name: &str) -> Vec<(&'b str, &'b FieldDefinition<'b>)> {
        let Some(fields) = self.schema.get_object_fields(type_name) else {
            return Vec::new();
        };

        let mut fields: Vec<_> = fields
            .iter()
            .map(|(&field_name, &field_def)| (field_name, field_def))
            .collect();
        fields.sort_by_key(|(field_name, _)| *field_name);
        fields
    }

    fn possible_type_names(&self, type_name: &'b str) -> Vec<&'b str> {
        if self.schema.is_abstract(type_name) {
            let mut possible: Vec<_> = self.schema.get_possible_types(type_name).collect();
            possible.sort_unstable();
            possible
        } else {
            vec![type_name]
        }
    }

    fn spread_target_names(&self, parent: &'b str, composite_types: &[&'b str]) -> Vec<&'b str> {
        composite_types
            .iter()
            .copied()
            .filter(|child| self.can_spread(parent, child))
            .collect()
    }

    fn can_spread(&self, parent: &'b str, child: &'b str) -> bool {
        let parent_possible = self.possible_type_names(parent);
        let child_possible = self.possible_type_names(child);

        parent_possible
            .iter()
            .any(|parent_type| child_possible.iter().any(|child_type| parent_type == child_type))
    }

    fn sorted_fragments(&self) -> Vec<&'b FragmentDefinition<'b>> {
        let mut fragments: Vec<_> = self.document.fragments().collect();
        fragments.sort_by_key(|fragment| fragment.name.as_str());
        fragments
    }

    fn sorted_input_objects(&self) -> Vec<&'b InputObjectTypeDefinition<'b>> {
        let mut input_objects: Vec<_> = self.schema.input_objects().collect();
        input_objects.sort_by_key(|input_object| input_object.name.as_str());
        input_objects
    }

    fn root_type_for_operation(&self, operation_type: OperationType) -> &'b str {
        match operation_type {
            OperationType::Query => self.schema.query_type().unwrap_or("Query"),
            OperationType::Mutation => self.schema.mutation_type().unwrap_or("Mutation"),
            OperationType::Subscription => self.schema.subscription_type().unwrap_or("Subscription"),
        }
    }

    fn directive_location_name(&self, location: DirectiveLocation) -> Option<&'static str> {
        match location {
            DirectiveLocation::Query => Some("QUERY"),
            DirectiveLocation::Mutation => Some("MUTATION"),
            DirectiveLocation::Subscription => Some("SUBSCRIPTION"),
            DirectiveLocation::Field => Some("FIELD"),
            DirectiveLocation::FragmentDefinition => Some("FRAGMENT_DEFINITION"),
            DirectiveLocation::FragmentSpread => Some("FRAGMENT_SPREAD"),
            DirectiveLocation::InlineFragment => Some("INLINE_FRAGMENT"),
            DirectiveLocation::VariableDefinition => Some("VARIABLE_DEFINITION"),
            _ => None,
        }
    }

    fn ts_directive_args_type(&self, directive: &DirectiveDefinition<'b>) -> String {
        if directive.arguments.is_empty() {
            "true".to_owned()
        } else {
            format!("$$Args<{}, Defs>", self.ts_args_object_type(&directive.arguments))
        }
    }

    fn ts_args_object_type(&self, args: &[InputValueDefinition<'b>]) -> String {
        let mut fields = args.iter().collect::<Vec<_>>();
        fields.sort_by_key(|arg| arg.name.as_str());

        let mut out = String::from("{ ");
        for arg in fields {
            let optional = if arg.typ.is_nullable() || arg.default_value.is_some() {
                "?"
            } else {
                ""
            };
            write!(
                out,
                "{}{}: {}; ",
                self.ts_key(arg.name.as_str()),
                optional,
                self.ts_graphql_input_shape(&arg.typ)
            )
            .unwrap();
        }
        out.push('}');
        out
    }

    fn ts_variable_definitions_shape(&self, variables: &[VariableDefinition<'b>]) -> String {
        if variables.is_empty() {
            return "{}".to_string();
        }

        let mut fields = variables.iter().collect::<Vec<_>>();
        fields.sort_by_key(|variable| variable.variable.as_str());

        let mut out = String::from("{ ");
        for variable in fields {
            let optional = if variable.typ.is_nullable() || variable.default_value.is_some() {
                "?"
            } else {
                ""
            };
            write!(
                out,
                "{}{}: {}; ",
                self.ts_key(variable.variable.as_str()),
                optional,
                self.ts_graphql_input_shape(&variable.typ)
            )
            .unwrap();
        }
        out.push('}');
        out
    }

    fn ts_input_object_shape(&self, input_object: &InputObjectTypeDefinition<'b>) -> String {
        self.ts_args_object_type(&input_object.fields)
    }

    fn ts_graphql_input_shape(&self, graphql_type: &Type<'b>) -> String {
        match graphql_type {
            Type::Named(named) => {
                format!("$$Nullable<{}>", self.ts_named_input_shape(named.name.as_str()))
            }
            Type::List(nested) => {
                format!("$$Nullable<$$List<{}>>", self.ts_graphql_input_shape(nested))
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => self.ts_named_input_shape(named.name.as_str()),
                NonNullType::List(nested) => {
                    format!("$$List<{}>", self.ts_graphql_input_shape(nested))
                }
            },
        }
    }

    fn ts_graphql_output_shape(&self, graphql_type: &Type<'b>) -> String {
        match graphql_type {
            Type::Named(named) => {
                format!("$$OutputNullable<{}>", self.ts_named_output_shape(named.name.as_str()))
            }
            Type::List(nested) => {
                format!(
                    "$$OutputNullable<$$OutputList<{}>>",
                    self.ts_graphql_output_shape(nested)
                )
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => self.ts_named_output_shape(named.name.as_str()),
                NonNullType::List(nested) => {
                    format!("$$OutputList<{}>", self.ts_graphql_output_shape(nested))
                }
            },
        }
    }

    fn ts_named_input_shape(&self, type_name: &str) -> String {
        if self.schema.is_input_object(type_name) {
            self.ts_input_object_shape_name(type_name)
        } else if self.schema.is_enum(type_name) {
            format!("$$EnumLeaf<{}>", self.ts_named_type(type_name))
        } else {
            format!("$$Leaf<{}>", self.ts_named_type(type_name))
        }
    }

    fn ts_named_output_shape(&self, type_name: &str) -> String {
        if self.schema.is_composite(type_name) {
            format!("$$OutputComposite<{:?}>", type_name)
        } else {
            format!("$$OutputLeaf<{}>", self.ts_named_type(type_name))
        }
    }

    fn ts_named_type(&self, type_name: &str) -> String {
        if self.schema.is_scalar(type_name) {
            format!("$$Scalars[{:?}]", type_name)
        } else {
            self.ts_type_import(type_name)
        }
    }

    fn ts_fragment_vars_type(&self, fragment: &FragmentDefinition<'b>) -> String {
        self.ts_variable_definitions_shape(&fragment.variable_definitions)
    }

    fn ts_input_object_shape_name(&self, type_name: &str) -> String {
        format!("$$InputObject_{}", type_name)
    }

    fn ts_type_import(&self, type_name: &str) -> String {
        format!("import(\"./types.d.ts\").{}", type_name)
    }

    fn ts_string_union(&self, items: &[&str]) -> String {
        if items.is_empty() {
            "never".to_string()
        } else {
            items
                .iter()
                .map(|item| format!("{:?}", item))
                .collect::<Vec<_>>()
                .join(" | ")
        }
    }

    fn ts_key(&self, key: &str) -> String {
        format!("{:?}", key)
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
            self.ast.ts_literal_string_literal(SPAN, document_source, None::<Str>),
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

        let id = self
            .ast
            .binding_pattern_binding_identifier(SPAN, self.ast.ident("schema"));

        let declarator = self.ast.variable_declarator(
            SPAN,
            VariableDeclarationKind::Const,
            id,
            Some(self.ast.alloc(type_annotation)),
            None,
            false,
        );

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
            .ts_module_declaration_name_string_literal(SPAN, name, None::<Str>);

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
        let function = self.ast.function(
            SPAN,
            FunctionType::FunctionDeclaration,
            Some(self.create_binding_identifier(name)),
            false,
            false,
            false,
            None::<OxcBox<TSTypeParameterDeclaration>>,
            None::<OxcBox<TSThisParameter>>,
            params,
            Some(self.ast.alloc(return_type_annotation)),
            body,
        );

        Declaration::FunctionDeclaration(self.ast.alloc(function))
    }

    fn type_import(&self, type_name: &str) -> TSType<'b> {
        self.type_import_from("./types.d.ts", type_name, None)
    }

    fn type_import_from(
        &self,
        module_path: &'b str,
        type_name: &str,
        type_params: Option<TSTypeParameterInstantiation<'b>>,
    ) -> TSType<'b> {
        let type_name_str = self.ast.allocator.alloc_str(type_name);
        let qualifier = self.ast.ts_import_type_qualifier_identifier(SPAN, type_name_str);

        self.ast.ts_type_import_type(
            SPAN,
            self.ast.string_literal(SPAN, module_path, None::<Str>),
            None::<OxcBox<ObjectExpression>>,
            Some(qualifier),
            type_params.map(|params| self.ast.alloc(params)),
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

    fn create_binding_pattern(&self, name: &'b str) -> BindingPattern<'b> {
        self.ast.binding_pattern_binding_identifier(SPAN, name)
    }

    fn create_formal_parameter(
        &self,
        name: &'b str,
        type_annotation: Option<TSTypeAnnotation<'b>>,
    ) -> FormalParameter<'b> {
        self.create_formal_parameter_with_optional(name, type_annotation, false)
    }

    fn create_formal_parameter_with_optional(
        &self,
        name: &'b str,
        type_annotation: Option<TSTypeAnnotation<'b>>,
        optional: bool,
    ) -> FormalParameter<'b> {
        let pattern = self.create_binding_pattern(name);
        self.ast.formal_parameter(
            SPAN,
            self.ast.vec(),
            pattern,
            type_annotation.map(|t| self.ast.alloc(t)),
            None::<OxcBox<Expression>>,
            optional,
            None,
            false,
            false,
        )
    }

    fn create_formal_parameters(&self, param: FormalParameter<'b>) -> OxcBox<'b, FormalParameters<'b>> {
        self.create_formal_parameters_from([param])
    }

    fn create_formal_parameters_from<const N: usize>(
        &self,
        params: [FormalParameter<'b>; N],
    ) -> OxcBox<'b, FormalParameters<'b>> {
        let params = self.ast.vec_from_array(params);
        self.ast.alloc(self.ast.formal_parameters(
            SPAN,
            FormalParameterKind::Signature,
            params,
            None::<OxcBox<FormalParameterRest>>,
        ))
    }
}
