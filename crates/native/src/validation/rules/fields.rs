use crate::graphql::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashMap;
use std::marker::PhantomData;

#[derive(Default)]
pub struct FieldRules<'a, 'b> {
    type_stack: Vec<Option<&'a str>>,
    argument_names: Vec<&'a str>,
    _phantom: PhantomData<&'b ()>,
}

impl<'a, 'b> FieldRules<'a, 'b> {
    fn check_field_merging<'c>(&self, ctx: &mut ValidationContext<'a, 'b>, selection_set: &'c SelectionSet<'a>) {
        let mut fields_by_response_key: FxHashMap<&str, Vec<&'c Field<'a>>> = FxHashMap::default();

        self.collect_fields(selection_set, &mut fields_by_response_key);

        for (response_key, fields) in fields_by_response_key.iter() {
            if fields.len() <= 1 {
                continue;
            }

            let first_field = fields[0];
            let first_field_name = first_field.name.as_str();

            for field in fields.iter().skip(1) {
                let field_name = field.name.as_str();

                if first_field_name != field_name {
                    ctx.add_error(
                        format!(
                            "Fields with response key '{}' have different field names: '{}' and '{}'",
                            response_key, first_field_name, field_name
                        ),
                        field.span,
                    );
                    continue;
                }

                if !self.arguments_are_equal(&first_field.arguments, &field.arguments) {
                    ctx.add_error(
                        format!("Fields with response key '{}' have different arguments", response_key),
                        field.span,
                    );
                }
            }
        }
    }

    fn collect_fields<'c>(
        &self,
        selection_set: &'c SelectionSet<'a>,
        fields: &mut FxHashMap<&'a str, Vec<&'c Field<'a>>>,
    ) {
        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    let response_key = field
                        .alias
                        .as_ref()
                        .map(|a| a.as_str())
                        .unwrap_or_else(|| field.name.as_str());
                    fields.entry(response_key).or_default().push(field);
                }
                Selection::InlineFragment(inline_fragment) => {
                    self.collect_fields(&inline_fragment.selection_set, fields);
                }
                Selection::FragmentSpread(_) => {}
            }
        }
    }

    fn arguments_are_equal(&self, args1: &[Argument<'a>], args2: &[Argument<'a>]) -> bool {
        if args1.len() != args2.len() {
            return false;
        }

        for arg1 in args1 {
            let arg1_name = arg1.name.as_str();
            let matching_arg = args2.iter().find(|a| a.name.as_str() == arg1_name);

            if matching_arg.is_none() {
                return false;
            }

            if let Some(arg2) = matching_arg
                && !self.values_are_equal(&arg1.value, &arg2.value)
            {
                return false;
            }
        }

        true
    }

    fn values_are_equal(&self, v1: &Value<'a>, v2: &Value<'a>) -> bool {
        match (v1, v2) {
            (Value::Variable(var1), Value::Variable(var2)) => var1.as_str() == var2.as_str(),
            (Value::Int(i1), Value::Int(i2)) => i1 == i2,
            (Value::Float(f1), Value::Float(f2)) => f1 == f2,
            (Value::String(s1), Value::String(s2)) => s1 == s2,
            (Value::Boolean(b1), Value::Boolean(b2)) => b1 == b2,
            (Value::Null, Value::Null) => true,
            (Value::Enum(e1), Value::Enum(e2)) => e1.as_str() == e2.as_str(),
            (Value::List(l1), Value::List(l2)) => {
                l1.len() == l2.len() && l1.iter().zip(l2.iter()).all(|(v1, v2)| self.values_are_equal(v1, v2))
            }
            (Value::Object(o1), Value::Object(o2)) => {
                if o1.len() != o2.len() {
                    return false;
                }

                let o2_map: FxHashMap<_, _> = o2.iter().map(|field| (field.name.as_str(), &field.value)).collect();

                o1.iter().all(|field1| {
                    o2_map
                        .get(field1.name.as_str())
                        .is_some_and(|v2| self.values_are_equal(&field1.value, v2))
                })
            }
            _ => false,
        }
    }
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for FieldRules<'a, 'b> {
    fn enter_operation(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        operation: &OperationDefinition<'a>,
    ) -> Control {
        let root_type_name = match operation.operation_type {
            OperationType::Query => Some("Query"),
            OperationType::Mutation => Some("Mutation"),
            OperationType::Subscription => Some("Subscription"),
        };
        self.type_stack.push(root_type_name);
        Control::Next
    }

    fn leave_operation(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        _operation: &OperationDefinition<'a>,
    ) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_selection_set(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        selection_set: &SelectionSet<'a>,
    ) -> Control {
        self.check_field_merging(ctx, selection_set);
        Control::Next
    }

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a, 'b>, field: &Field<'a>) -> Control {
        self.argument_names.clear();

        let parent_type = match self.type_stack.last() {
            Some(Some(type_name)) => *type_name,
            _ => {
                self.type_stack.push(None);
                return Control::Next;
            }
        };

        let field_name = field.name.as_str();

        if field_name.starts_with("__") {
            self.type_stack.push(None);
            return Control::Next;
        }

        if let Some(field_def) = ctx.schema().get_field(parent_type, field_name) {
            let field_type = &field_def.typ;
            let named_type = get_named_type(field_type);

            let is_leaf = ctx.schema().is_scalar(named_type) || ctx.schema().is_enum(named_type);

            if is_leaf && !field.selection_set.selections.is_empty() {
                ctx.add_error(
                    format!(
                        "Field '{}' must not have a selection set, since type '{}' is a leaf type (scalar or enum)",
                        field_name, named_type
                    ),
                    field.span,
                );
            } else if !is_leaf && field.selection_set.selections.is_empty() {
                ctx.add_error(
                    format!(
                        "Field '{}' must have a selection set, since type '{}' is not a leaf type",
                        field_name, named_type
                    ),
                    field.span,
                );
            }

            for arg in &field.arguments {
                let arg_name = arg.name.as_str();

                let arg_exists = field_def
                    .arguments
                    .iter()
                    .any(|def_arg| def_arg.name.as_str() == arg_name);

                if !arg_exists {
                    ctx.add_error(
                        format!(
                            "Unknown argument '{}' on field '{}.{}'",
                            arg_name, parent_type, field_name
                        ),
                        arg.span,
                    );
                }
            }

            for arg_def in field_def.arguments.iter() {
                let is_required = matches!(arg_def.typ, Type::NonNull(_)) && arg_def.default_value.is_none();

                if is_required {
                    let arg_name = arg_def.name.as_str();
                    let arg_provided = field.arguments.iter().any(|arg| arg.name.as_str() == arg_name);

                    if !arg_provided {
                        ctx.add_error(
                            format!(
                                "Required argument '{}' on field '{}.{}' is not provided",
                                arg_name, parent_type, field_name
                            ),
                            field.span,
                        );
                    }
                }
            }

            self.type_stack.push(Some(named_type));
        } else {
            ctx.add_error(
                format!("Field '{}' is not defined on type '{}'", field_name, parent_type),
                field.span,
            );
            self.type_stack.push(None);
        }

        Control::Next
    }

    fn leave_field(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _field: &Field<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        self.type_stack.push(Some(fragment.type_condition.as_str()));
        Control::Next
    }

    fn leave_fragment(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _fragment: &FragmentDefinition<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        if let Some(type_condition) = &inline_fragment.type_condition {
            self.type_stack.push(Some(type_condition.as_str()));
        }
        Control::Next
    }

    fn leave_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        if inline_fragment.type_condition.is_some() {
            self.type_stack.pop();
        }
        Control::Next
    }

    fn enter_directive(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _directive: &Directive<'a>) -> Control {
        self.argument_names.clear();
        Control::Next
    }

    fn enter_argument(&mut self, ctx: &mut ValidationContext<'a, 'b>, argument: &Argument<'a>) -> Control {
        let name = argument.name.as_str();

        if self.argument_names.contains(&name) {
            ctx.add_error(format!("Duplicate argument name '{}'", name), argument.span);
        }

        self.argument_names.push(name);
        Control::Next
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

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for FieldRules<'a, 'b> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate_rules;
    use assertables::*;

    #[test]
    fn test_valid_field_selection() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field: String }"#,
            r#"query Q { field }"#
        ));
    }

    #[test]
    fn test_introspection_typename_field() {
        assert_ok!(validate_rules!(FieldRules, r#""#, r#"query Q { __typename }"#));
    }

    #[test]
    fn test_fragment_with_fields() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type User { id: ID! name: String! }"#,
            r#"fragment UserFields on User { id name }"#
        ));
    }

    #[test]
    fn test_invalid_field_selection() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { user: User } type User { id: ID! name: String! }"#,
            r#"query Q { user { invalidField } }"#
        ));
    }

    #[test]
    fn test_leaf_field_with_selection_set() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { scalarField: String }"#,
            r#"query Test { scalarField { subfield } }"#
        ));
    }

    #[test]
    fn test_object_field_without_selection_set() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { objectField: User } type User { id: ID! }"#,
            r#"query Test { objectField }"#
        ));
    }

    #[test]
    fn test_valid_scalar_field() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { name: String }"#,
            r#"query Test { name }"#
        ));
    }

    #[test]
    fn test_valid_object_field_with_selection() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { user: User } type User { id: ID! }"#,
            r#"query Test { user { id } }"#
        ));
    }

    #[test]
    fn test_enum_field_with_selection_set() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { status: Status } enum Status { ACTIVE INACTIVE }"#,
            r#"query Test { status { value } }"#
        ));
    }

    #[test]
    fn test_nested_object_without_selection() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { user: User } type User { profile: Profile } type Profile { name: String }"#,
            r#"query Test { user { profile } }"#
        ));
    }

    #[test]
    fn test_list_type_field_without_selection() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { users: [User] } type User { id: ID! }"#,
            r#"query Test { users }"#
        ));
    }

    #[test]
    fn test_valid_field_arguments() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg1: String, arg2: String): String }"#,
            r#"query Q { field(arg1: "value1", arg2: "value2") }"#
        ));
    }

    #[test]
    fn test_introspection_fields_ignored() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#""#,
            r#"query Q { __typename __schema { types { name } } }"#
        ));
    }

    #[test]
    fn test_field_without_arguments() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field: String }"#,
            r#"query Q { field }"#
        ));
    }

    #[test]
    fn test_unique_argument_names_valid() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg1: String, arg2: String): String }"#,
            r#"query Q { field(arg1: "value1", arg2: "value2") }"#
        ));
    }

    #[test]
    fn test_unique_argument_names_duplicate() {
        assert_err!(validate_rules!(
            FieldRules,
            r#""#,
            r#"query Q { field(arg: "value1", arg: "value2") }"#
        ));
    }

    #[test]
    fn test_unique_argument_names_different_fields() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field1(arg: String): String field2(arg: String): String }"#,
            r#"query Q { field1(arg: "value1") field2(arg: "value2") }"#
        ));
    }

    #[test]
    fn test_field_with_required_argument_provided() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg: String!): String }"#,
            r#"query Q { field(arg: "value") }"#
        ));
    }

    #[test]
    fn test_field_with_required_argument_missing() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg: String!): String }"#,
            r#"query Q { field }"#
        ));
    }

    #[test]
    fn test_field_with_multiple_required_arguments_all_provided() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg1: String! arg2: Int!): String }"#,
            r#"query Q { field(arg1: "value", arg2: 42) }"#
        ));
    }

    #[test]
    fn test_field_with_multiple_required_arguments_one_missing() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg1: String! arg2: Int!): String }"#,
            r#"query Q { field(arg1: "value") }"#
        ));
    }

    #[test]
    fn test_required_argument_with_default_value() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg: String! = "default"): String }"#,
            r#"query Q { field }"#
        ));
    }

    #[test]
    fn test_nested_field_with_required_argument_missing() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { user: User } type User { profile(detailed: Boolean!): Profile } type Profile { name: String }"#,
            r#"query Q { user { profile { name } } }"#
        ));
    }

    #[test]
    fn test_field_merging_same_field_valid() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field: String }"#,
            r#"query Q { field field }"#
        ));
    }

    #[test]
    fn test_field_merging_different_arguments_invalid() {
        assert_err!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q { field(arg: "a") field(arg: "b") }"#
        ));
    }

    #[test]
    fn test_field_merging_with_alias_valid() {
        assert_ok!(validate_rules!(
            FieldRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q { a: field(arg: "a") b: field(arg: "b") }"#
        ));
    }
}
