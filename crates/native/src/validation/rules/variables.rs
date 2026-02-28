use crate::error::location::Span;
use crate::graphql::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashMap;
use std::marker::PhantomData;

#[derive(Clone)]
struct VariableInfo<'a> {
    typ: Type<'a>,
    has_default_value: bool,
    #[allow(dead_code)]
    span: Span,
}

struct VariableUsageInfo<'a> {
    var_name: &'a str,
    expected_type: Option<&'a Type<'a>>,
    usage_span: Span,
}

struct FragmentInfo<'a> {
    name: &'a str,
    defined_vars: Vec<&'a str>,
    #[allow(dead_code)]
    used_vars: Vec<&'a str>,
    op_var_refs: Vec<&'a str>,
    spread_refs: Vec<&'a str>,
    #[allow(dead_code)]
    span: Span,
}

#[derive(Default)]
pub struct VariableRules<'a, 'b> {
    variable_names: Vec<&'a str>,
    operations: Vec<(&'a str, Vec<&'a str>, Span)>,
    variable_usages: Vec<(&'a str, Vec<&'a str>)>,
    current_operation: Option<&'a str>,
    current_operation_span: Option<Span>,
    current_defined_vars: Vec<&'a str>,
    current_used_vars: Vec<&'a str>,
    variable_definitions: FxHashMap<&'a str, VariableInfo<'a>>,
    variable_usage_infos: Vec<VariableUsageInfo<'a>>,
    type_stack: Vec<Option<&'a str>>,
    current_field_name: Option<&'a str>,
    current_fragment_name: Option<&'a str>,
    fragment_variable_names: Vec<&'a str>,
    fragment_variable_definitions: FxHashMap<&'a str, VariableInfo<'a>>,
    fragment_defined_vars: Vec<&'a str>,
    fragment_used_vars: Vec<&'a str>,
    fragment_op_var_refs: Vec<&'a str>,
    current_spread_refs: Vec<&'a str>,
    op_spread_graph: Vec<(&'a str, Vec<&'a str>)>,
    fragments: Vec<FragmentInfo<'a>>,
    _phantom: PhantomData<&'b ()>,
}

impl<'a, 'b> VariableRules<'a, 'b> {
    fn collect_variables_from_value(&mut self, value: &Value<'a>) {
        match value {
            Value::Variable(var) => {
                self.current_used_vars.push(var.as_str());
            }
            Value::List(list) => {
                for item in list {
                    self.collect_variables_from_value(item);
                }
            }
            Value::Object(fields) => {
                for field in fields {
                    self.collect_variables_from_value(&field.value);
                }
            }
            _ => {}
        }
    }

    fn collect_fragment_variables_from_value(&mut self, value: &Value<'a>) {
        match value {
            Value::Variable(var) => {
                let var_name = var.as_str();
                if self.fragment_variable_definitions.contains_key(var_name) {
                    self.fragment_used_vars.push(var_name);
                } else {
                    self.fragment_op_var_refs.push(var_name);
                }
            }
            Value::List(list) => {
                for item in list {
                    self.collect_fragment_variables_from_value(item);
                }
            }
            Value::Object(fields) => {
                for field in fields {
                    self.collect_fragment_variables_from_value(&field.value);
                }
            }
            _ => {}
        }
    }

    fn collect_variable_usages_from_value(
        &mut self,
        value: &Value<'a>,
        expected_type: Option<&'a Type<'a>>,
        value_span: Span,
    ) {
        match value {
            Value::Variable(var) => {
                self.variable_usage_infos.push(VariableUsageInfo {
                    var_name: var.as_str(),
                    expected_type,
                    usage_span: value_span,
                });
            }
            Value::List(list) => {
                let inner_type = expected_type.and_then(|t| match t {
                    Type::List(inner) => Some(&**inner),
                    Type::NonNull(NonNullType::List(inner)) => Some(&**inner),
                    _ => None,
                });
                for item in list {
                    self.collect_variable_usages_from_value(item, inner_type, value_span);
                }
            }
            Value::Object(_fields) => {}
            _ => {}
        }
    }

    fn is_type_compatible(&self, variable_type: &Type<'a>, location_type: &Type<'a>, has_default_value: bool) -> bool {
        match (variable_type, location_type) {
            (Type::NonNull(var_inner), Type::NonNull(loc_inner)) => {
                self.is_type_compatible_non_null(var_inner, loc_inner, has_default_value)
            }
            (Type::NonNull(var_inner), loc_type) => {
                self.is_type_compatible_non_null_to_nullable(var_inner, loc_type, has_default_value)
            }
            (var_type, Type::NonNull(loc_inner)) => {
                if has_default_value {
                    self.is_type_compatible_nullable_with_default(var_type, loc_inner)
                } else {
                    false
                }
            }
            (Type::List(var_inner), Type::List(loc_inner)) => {
                self.is_type_compatible(var_inner, loc_inner, has_default_value)
            }
            (Type::Named(var_named), Type::Named(loc_named)) => var_named.name == loc_named.name,
            _ => false,
        }
    }

    fn is_type_compatible_non_null(
        &self,
        var_type: &NonNullType<'a>,
        loc_type: &NonNullType<'a>,
        has_default_value: bool,
    ) -> bool {
        match (var_type, loc_type) {
            (NonNullType::Named(var_named), NonNullType::Named(loc_named)) => var_named.name == loc_named.name,
            (NonNullType::List(var_inner), NonNullType::List(loc_inner)) => {
                self.is_type_compatible(var_inner, loc_inner, has_default_value)
            }
            _ => false,
        }
    }

    fn is_type_compatible_non_null_to_nullable(
        &self,
        var_type: &NonNullType<'a>,
        loc_type: &Type<'a>,
        has_default_value: bool,
    ) -> bool {
        match (var_type, loc_type) {
            (NonNullType::Named(var_named), Type::Named(loc_named)) => var_named.name == loc_named.name,
            (NonNullType::List(var_inner), Type::List(loc_inner)) => {
                self.is_type_compatible(var_inner, loc_inner, has_default_value)
            }
            _ => false,
        }
    }

    fn is_type_compatible_nullable_with_default(&self, var_type: &Type<'a>, loc_type: &NonNullType<'a>) -> bool {
        match (var_type, loc_type) {
            (Type::Named(var_named), NonNullType::Named(loc_named)) => var_named.name == loc_named.name,
            (Type::List(var_inner), NonNullType::List(loc_inner)) => {
                self.is_type_compatible(var_inner, loc_inner, true)
            }
            _ => false,
        }
    }
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for VariableRules<'a, 'b> {
    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a, 'b>, operation: &OperationDefinition<'a>) -> Control {
        self.variable_names.clear();
        self.current_operation = Some(operation.name.map_or("<anonymous>", |n| n.as_str()));
        self.current_operation_span = Some(operation.span);
        self.current_defined_vars.clear();
        self.current_used_vars.clear();
        self.current_spread_refs.clear();
        self.variable_definitions.clear();
        self.variable_usage_infos.clear();

        let root_type = match operation.operation_type {
            OperationType::Query => ctx.schema().query_type().or(Some("Query")),
            OperationType::Mutation => ctx.schema().mutation_type().or(Some("Mutation")),
            OperationType::Subscription => ctx.schema().subscription_type().or(Some("Subscription")),
        };
        self.type_stack.push(root_type);

        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        let name = var_def.variable.as_str();

        if self.current_fragment_name.is_some() {
            if self.fragment_variable_names.contains(&name) {
                ctx.add_error(format!("Duplicate variable name '${}'", name), var_def.span);
            }
            self.fragment_variable_names.push(name);
            self.fragment_defined_vars.push(name);

            let type_name = get_named_type(&var_def.typ);
            let is_input_type = ctx.schema().is_scalar(type_name)
                || ctx.schema().is_enum(type_name)
                || ctx.schema().is_input_object(type_name);

            if ctx.schema().has_type(type_name) && !is_input_type {
                ctx.add_error(format!(
                    "Variable '${} is declared with type '{}', which is not an input type. Variables must be input types (scalar, enum, or input object).",
                    name, type_name
                ), var_def.span);
            }

            self.fragment_variable_definitions.insert(
                name,
                VariableInfo {
                    typ: var_def.typ.clone(),
                    has_default_value: var_def.default_value.is_some(),
                    span: var_def.span,
                },
            );
        } else {
            if self.variable_names.contains(&name) {
                ctx.add_error(format!("Duplicate variable name '${}'", name), var_def.span);
            }

            self.variable_names.push(name);
            self.current_defined_vars.push(name);

            let type_name = get_named_type(&var_def.typ);
            let is_input_type = ctx.schema().is_scalar(type_name)
                || ctx.schema().is_enum(type_name)
                || ctx.schema().is_input_object(type_name);

            if ctx.schema().has_type(type_name) && !is_input_type {
                ctx.add_error(format!(
                    "Variable '${} is declared with type '{}', which is not an input type. Variables must be input types (scalar, enum, or input object).",
                    name, type_name
                ), var_def.span);
            }

            if let Some(default_value) = &var_def.default_value {
                self.collect_variables_from_value(default_value);
            }

            self.variable_definitions.insert(
                name,
                VariableInfo {
                    typ: var_def.typ.clone(),
                    has_default_value: var_def.default_value.is_some(),
                    span: var_def.span,
                },
            );
        }

        Control::Next
    }

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a, 'b>, field: &Field<'a>) -> Control {
        self.current_field_name = Some(field.name.as_str());

        let parent_type = match self.type_stack.last() {
            Some(Some(type_name)) => *type_name,
            _ => {
                self.type_stack.push(None);
                return Control::Next;
            }
        };

        if let Some(field_def) = ctx.schema().get_field(parent_type, field.name.as_str()) {
            let named_type = get_named_type(&field_def.typ);
            self.type_stack.push(Some(named_type));
        } else {
            self.type_stack.push(None);
        }

        Control::Next
    }

    fn leave_field(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _field: &Field<'a>) -> Control {
        self.type_stack.pop();
        self.current_field_name = None;
        Control::Next
    }

    fn enter_argument(&mut self, ctx: &mut ValidationContext<'a, 'b>, argument: &Argument<'a>) -> Control {
        if self.current_fragment_name.is_some() {
            self.collect_fragment_variables_from_value(&argument.value);
        } else {
            self.collect_variables_from_value(&argument.value);
        }

        if let Some(parent_type) = self.type_stack.get(self.type_stack.len().saturating_sub(2))
            && let Some(parent_type_name) = parent_type
            && let Some(field_name) = self.current_field_name
            && let Some(field_def) = ctx.schema().get_field(parent_type_name, field_name)
            && let Some(arg_def) = field_def.arguments.iter().find(|a| a.name == argument.name.as_str())
        {
            self.collect_variable_usages_from_value(&argument.value, Some(&arg_def.typ), argument.span);
        }

        Control::Next
    }

    fn enter_fragment_spread(&mut self, _ctx: &mut ValidationContext<'a, 'b>, spread: &FragmentSpread<'a>) -> Control {
        self.current_spread_refs.push(spread.fragment_name.as_str());
        Control::Next
    }

    fn leave_operation(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        _operation: &OperationDefinition<'a>,
    ) -> Control {
        for usage in &self.variable_usage_infos {
            if let Some(var_info) = self.variable_definitions.get(usage.var_name)
                && let Some(expected_type) = usage.expected_type
                && !self.is_type_compatible(&var_info.typ, expected_type, var_info.has_default_value)
            {
                ctx.add_error(
                    format!(
                        "Variable '{}' of type '{}' cannot be used where '{}' is expected",
                        usage.var_name,
                        type_to_string(&var_info.typ),
                        type_to_string(expected_type)
                    ),
                    usage.usage_span,
                );
            }
        }

        if let Some(op_name) = self.current_operation
            && let Some(op_span) = &self.current_operation_span
        {
            self.operations
                .push((op_name, self.current_defined_vars.clone(), *op_span));
            self.variable_usages.push((op_name, self.current_used_vars.clone()));
            self.op_spread_graph.push((op_name, self.current_spread_refs.clone()));
        }

        self.current_operation = None;
        self.current_operation_span = None;
        self.current_defined_vars.clear();
        self.current_used_vars.clear();
        self.current_spread_refs.clear();
        self.type_stack.pop();

        Control::Next
    }

    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        self.current_fragment_name = Some(fragment.name.as_str());
        self.fragment_variable_names.clear();
        self.fragment_variable_definitions.clear();
        self.fragment_defined_vars.clear();
        self.fragment_used_vars.clear();
        self.fragment_op_var_refs.clear();
        self.current_spread_refs.clear();

        let type_name = fragment.type_condition.as_str();
        if ctx.schema().has_type(type_name) {
            self.type_stack.push(Some(type_name));
        } else {
            self.type_stack.push(None);
        }

        Control::Next
    }

    fn leave_fragment(&mut self, ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        let fragment_name = fragment.name.as_str();

        for defined_var in &self.fragment_defined_vars {
            if !self.fragment_used_vars.contains(defined_var) {
                ctx.add_error(
                    format!(
                        "Variable '{}' is defined but not used in fragment '{}'",
                        defined_var, fragment_name
                    ),
                    fragment.span,
                );
            }
        }

        self.fragments.push(FragmentInfo {
            name: fragment_name,
            defined_vars: self.fragment_defined_vars.clone(),
            used_vars: self.fragment_used_vars.clone(),
            op_var_refs: self.fragment_op_var_refs.clone(),
            spread_refs: self.current_spread_refs.clone(),
            span: fragment.span,
        });

        self.current_fragment_name = None;
        self.type_stack.pop();
        Control::Next
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a, 'b>, _document: &Document<'a>) -> Control {
        for (op_name, defined_vars, op_span) in &self.operations {
            let empty_vec = Vec::new();

            let direct_used_vars = self
                .variable_usages
                .iter()
                .find(|(name, _)| name == op_name)
                .map(|(_, vars)| vars)
                .unwrap_or(&empty_vec);

            let direct_spreads = self
                .op_spread_graph
                .iter()
                .find(|(name, _)| name == op_name)
                .map(|(_, refs)| refs)
                .unwrap_or(&empty_vec);

            let transitive_fragments = collect_transitive_fragments(direct_spreads, &self.fragments);

            let mut all_used_vars: Vec<&str> = direct_used_vars.to_vec();
            for frag_name in &transitive_fragments {
                if let Some(frag) = self.fragments.iter().find(|f| f.name == *frag_name) {
                    for op_var in &frag.op_var_refs {
                        if !frag.defined_vars.contains(op_var) {
                            all_used_vars.push(op_var);
                        }
                    }
                }
            }

            for used_var in &all_used_vars {
                if !defined_vars.contains(used_var) {
                    ctx.add_error(
                        format!("Variable '{}' is not defined in operation '{}'", used_var, op_name),
                        *op_span,
                    );
                }
            }

            for defined_var in defined_vars {
                if !all_used_vars.contains(defined_var) {
                    ctx.add_error(
                        format!(
                            "Variable '{}' is defined but not used in operation '{}'",
                            defined_var, op_name
                        ),
                        *op_span,
                    );
                }
            }
        }

        Control::Next
    }
}

fn collect_transitive_fragments<'a>(direct_spreads: &[&'a str], fragments: &[FragmentInfo<'a>]) -> Vec<&'a str> {
    let mut result = Vec::new();
    let mut visited = Vec::new();
    for name in direct_spreads {
        collect_transitive_fragments_inner(name, fragments, &mut result, &mut visited);
    }
    result
}

fn collect_transitive_fragments_inner<'a>(
    name: &'a str,
    fragments: &[FragmentInfo<'a>],
    result: &mut Vec<&'a str>,
    visited: &mut Vec<&'a str>,
) {
    if visited.contains(&name) {
        return;
    }
    visited.push(name);
    result.push(name);

    if let Some(frag) = fragments.iter().find(|f| f.name == name) {
        for spread_name in &frag.spread_refs {
            collect_transitive_fragments_inner(spread_name, fragments, result, visited);
        }
    }
}

fn get_named_type<'a>(typ: &'a Type<'a>) -> &'a str {
    match typ {
        Type::Named(named) => named.name.as_str(),
        Type::List(inner) => get_named_type(inner),
        Type::NonNull(non_null) => match non_null {
            NonNullType::Named(named) => named.name.as_str(),
            NonNullType::List(inner) => get_named_type(inner),
        },
    }
}

fn type_to_string(typ: &Type) -> String {
    match typ {
        Type::Named(named) => named.name.to_string(),
        Type::List(inner) => format!("[{}]", type_to_string(inner)),
        Type::NonNull(non_null) => match non_null {
            NonNullType::Named(named) => format!("{}!", named.name),
            NonNullType::List(inner) => format!("[{}]!", type_to_string(inner)),
        },
    }
}

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for VariableRules<'a, 'b> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate_rules;
    use assertables::*;

    #[test]
    fn test_unique_variable_names_valid() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { field(a: Int, b: String): String }"#,
            r#"query Q($a: Int, $b: String) { field(a: $a, b: $b) }"#
        ));
    }

    #[test]
    fn test_unique_variable_names_duplicate() {
        assert_err!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($a: Int, $a: String) { field }"#
        ));
    }

    #[test]
    fn test_unique_variable_names_different_operations() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { field1(a: Int): String field2(a: String): String }"#,
            r#"query Q1($a: Int) { field1(a: $a) } query Q2($a: String) { field2(a: $a) }"#
        ));
    }

    #[test]
    fn test_variable_with_scalar_type() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($input: String) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_variable_with_list_type() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($input: [String]) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_variable_with_non_null_type() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($input: String!) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_variable_with_object_type_invalid() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type User { id: ID! name: String! }"#,
            r#"query Q($user: User) { field(arg: $user) }"#
        ));
    }

    #[test]
    fn test_variable_with_interface_type_invalid() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"interface Node { id: ID! }"#,
            r#"query Q($node: Node) { field(arg: $node) }"#
        ));
    }

    #[test]
    fn test_no_undefined_variables_valid() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($id: ID!) { user(id: $id) { name } }"#
        ));
    }

    #[test]
    fn test_no_undefined_variables_undefined() {
        assert_err!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q { user(id: $undefinedVar) { name } }"#
        ));
    }

    #[test]
    fn test_no_undefined_variables_mixed() {
        assert_err!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($definedVar: ID!) { user(id: $definedVar, name: $undefinedVar) { name } }"#
        ));
    }

    #[test]
    fn test_multiple_operations_with_different_variables() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q1($id: ID!) { user(id: $id) } query Q2($name: String) { search(name: $name) }"#
        ));
    }

    #[test]
    fn test_no_unused_variables_valid() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($id: ID!) { user(id: $id) { name } }"#
        ));
    }

    #[test]
    fn test_no_unused_variables_unused() {
        assert_err!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($id: ID!, $unused: String) { user(id: $id) { name } }"#
        ));
    }

    #[test]
    fn test_no_unused_variables_all_unused() {
        assert_err!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($a: Int, $b: String) { field { id } }"#
        ));
    }

    #[test]
    fn test_no_unused_variables_all_used() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#""#,
            r#"query Q($a: Int, $b: String) { field1(arg: $a) field2(arg: $b) }"#
        ));
    }

    #[test]
    fn test_mutation_with_unused_variable() {
        assert_err!(validate_rules!(
            VariableRules,
            r#""#,
            r#"mutation M($id: ID!, $unused: String) { update(id: $id) }"#
        ));
    }

    #[test]
    fn test_no_variables_defined() {
        assert_ok!(validate_rules!(VariableRules, r#""#, r#"query Q { field { id } }"#));
    }

    #[test]
    fn test_variable_type_compatibility_exact_match() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q($var: String) { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_variable_type_compatibility_non_null_to_nullable() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q($var: String!) { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_variable_type_compatibility_nullable_to_non_null_invalid() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: String!): String }"#,
            r#"query Q($var: String) { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_variable_type_compatibility_nullable_with_default_to_non_null() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: String!): String }"#,
            r#"query Q($var: String = "default") { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_variable_type_compatibility_list_match() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: [String]): String }"#,
            r#"query Q($var: [String]) { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_variable_type_compatibility_type_mismatch() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q($var: Int) { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_variable_type_compatibility_list_to_scalar_invalid() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q($var: [String]) { field(arg: $var) }"#
        ));
    }

    #[test]
    fn test_fragment_variable_uniqueness_valid() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int, quality: Int): String }"#,
            r#"fragment Avatar($size: Int!, $quality: Int!) on User { profilePic(size: $size, quality: $quality) } query Q { user { ...Avatar(size: 50, quality: 80) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_uniqueness_duplicate() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"fragment Avatar($size: Int!, $size: Int!) on User { profilePic(size: $size) } query Q { user { ...Avatar(size: 50) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_input_type_valid() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"fragment Avatar($size: Int!) on User { profilePic(size: $size) } query Q { user { ...Avatar(size: 50) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_object_type_invalid() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { id: ID! name: String }"#,
            r#"fragment F($u: User) on User { name } query Q { user { ...F(u: null) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_used() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"fragment Avatar($size: Int!) on User { profilePic(size: $size) } query Q { user { ...Avatar(size: 50) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_unused() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { name: String }"#,
            r#"fragment F($unused: Int!) on User { name } query Q { user { ...F(unused: 1) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_used_in_spread_argument() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String name: String }"#,
            r#"
                fragment Wrapper($size: Int!) on User { ...Avatar(size: $size) }
                fragment Avatar($size: Int!) on User { profilePic(size: $size) }
                query Q { user { ...Wrapper(size: 50) } }
            "#
        ));
    }

    #[test]
    fn test_fragment_variable_does_not_leak_to_operation_scope() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String name: String }"#,
            r#"fragment Avatar($size: Int! = 50) on User { profilePic(size: $size) } query Q { user { ...Avatar(size: 100) } }"#
        ));
    }

    #[test]
    fn test_fragment_accesses_operation_variable() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { posts(limit: Int): String }"#,
            r#"fragment UserPosts on User { posts(limit: $limit) } query Q($limit: Int!) { user { ...UserPosts } }"#
        ));
    }

    #[test]
    fn test_fragment_op_var_undefined_in_operation() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { posts(limit: Int): String }"#,
            r#"fragment UserPosts on User { posts(limit: $limit) } query Q { user { ...UserPosts } }"#
        ));
    }

    #[test]
    fn test_fragment_var_shadows_operation_var() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"fragment Avatar($size: Int!) on User { profilePic(size: $size) } query Q($size: Int!) { user { ...Avatar(size: $size) } }"#
        ));
    }

    #[test]
    fn test_operation_var_used_transitively_through_fragment() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { posts(limit: Int): String name: String }"#,
            r#"
                fragment UserPosts on User { posts(limit: $limit) }
                query Q($limit: Int!) { user { name ...UserPosts } }
            "#
        ));
    }

    #[test]
    fn test_operation_var_unused_when_fragment_shadows() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"
                fragment Avatar($size: Int!) on User { profilePic(size: $size) }
                query Q($size: Int!) { user { ...Avatar(size: 100) } }
            "#
        ));
    }

    #[test]
    fn test_fragment_with_default_and_no_args() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"fragment Avatar($size: Int! = 50) on User { profilePic(size: $size) } query Q { user { ...Avatar } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_multiple_vars_all_used() {
        assert_ok!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int, quality: Int): String }"#,
            r#"fragment Avatar($size: Int!, $quality: Int!) on User { profilePic(size: $size, quality: $quality) } query Q { user { ...Avatar(size: 50, quality: 80) } }"#
        ));
    }

    #[test]
    fn test_fragment_variable_multiple_vars_one_unused() {
        assert_err!(validate_rules!(
            VariableRules,
            r#"type Query { user: User } type User { profilePic(size: Int): String }"#,
            r#"fragment Avatar($size: Int!, $unused: String!) on User { profilePic(size: $size) } query Q { user { ...Avatar(size: 50, unused: "x") } }"#
        ));
    }
}
