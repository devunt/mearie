use crate::error::location::Span;
use crate::graphql::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashSet;
use std::marker::PhantomData;

#[derive(Default)]
pub struct ValueRules<'a, 'b> {
    current_location: Option<DirectiveLocation>,
    type_stack: Vec<Option<&'a str>>,
    current_field_name: Option<&'a str>,
    _phantom: PhantomData<(&'a (), &'b ())>,
}

impl<'a, 'b> ValueRules<'a, 'b> {
    fn get_built_in_directive_locations(name: &str) -> Option<&'static [DirectiveLocation]> {
        match name {
            "skip" | "include" => Some(&[
                DirectiveLocation::Field,
                DirectiveLocation::FragmentSpread,
                DirectiveLocation::InlineFragment,
            ]),
            "deprecated" => Some(&[
                DirectiveLocation::FieldDefinition,
                DirectiveLocation::EnumValue,
                DirectiveLocation::ArgumentDefinition,
                DirectiveLocation::InputFieldDefinition,
            ]),
            "specifiedBy" => Some(&[DirectiveLocation::Scalar]),
            _ => None,
        }
    }

    fn check_directive_uniqueness_and_validity(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        directives: &[Directive<'a>],
        location: DirectiveLocation,
    ) {
        let mut seen_directives = FxHashSet::default();
        self.current_location = Some(location);

        for directive in directives {
            let directive_name = directive.name.as_str();

            if !seen_directives.insert(directive_name) {
                ctx.add_error(
                    format!(
                        "Directive '@{}' is used more than once at this location",
                        directive_name
                    ),
                    directive.span,
                );
            }

            let allowed_locations = if let Some(locations) = Self::get_built_in_directive_locations(directive_name) {
                Some(locations)
            } else if let Some(custom_directive) = ctx.schema().get_directive(directive_name) {
                Some(&custom_directive.locations[..])
            } else {
                ctx.add_error(format!("Unknown directive '@{}'", directive_name), directive.span);
                None
            };

            if let Some(allowed_locations) = allowed_locations
                && !allowed_locations.contains(&location)
            {
                ctx.add_error(
                    format!(
                        "Directive '@{}' is not allowed in location '{:?}'",
                        directive_name, location
                    ),
                    directive.span,
                );
            }
        }
    }

    fn validate_input_value(
        &self,
        ctx: &mut ValidationContext<'a, 'b>,
        value: &Value<'a>,
        expected_type: &Type<'a>,
        value_span: Span,
    ) {
        let type_name = get_named_type(expected_type);

        if let Type::NonNull(_) = expected_type
            && matches!(value, Value::Null)
        {
            ctx.add_error(
                format!(
                    "Expected non-null value for type '{}', but got null",
                    type_to_string_ref(expected_type)
                ),
                value_span,
            );
            return;
        }

        if matches!(value, Value::Null | Value::Variable(_)) {
            return;
        }

        match value {
            Value::Object(fields) => {
                self.check_field_uniqueness(ctx, fields);

                if let Some(input_obj_def) = ctx.schema().get_input_object_type(type_name) {
                    let provided_fields: FxHashSet<&str> = fields.iter().map(|f| f.name.as_str()).collect();

                    for field in fields {
                        let field_name = field.name.as_str();

                        let field_def = input_obj_def.fields.iter().find(|f| f.name.as_str() == field_name);

                        if field_def.is_none() {
                            ctx.add_error(
                                format!(
                                    "Field '{}' is not defined on input object type '{}'",
                                    field_name, type_name
                                ),
                                value_span,
                            );
                        } else if let Some(field_def) = field_def {
                            self.validate_input_value(ctx, &field.value, &field_def.typ, value_span);
                        }
                    }

                    for field_def in input_obj_def.fields.iter() {
                        let field_name = field_def.name.as_str();
                        let is_required =
                            matches!(field_def.typ, Type::NonNull(_)) && field_def.default_value.is_none();

                        if is_required && !provided_fields.contains(field_name) {
                            ctx.add_error(
                                format!(
                                    "Required field '{}' on input object type '{}' is not provided",
                                    field_name, type_name
                                ),
                                value_span,
                            );
                        }
                    }
                } else if !ctx.schema().has_type(type_name)
                    || !ctx.schema().is_scalar(type_name)
                    || ctx.schema().is_enum(type_name)
                    || ctx.schema().is_input_object(type_name)
                {
                    ctx.add_error(
                        format!(
                            "Expected input object type '{}', but got object value for non-input-object type",
                            type_name
                        ),
                        value_span,
                    );
                }
            }
            Value::List(values) => {
                if let Type::List(inner_type) = expected_type {
                    for val in values {
                        self.validate_input_value(ctx, val, inner_type, value_span);
                    }
                } else if let Type::NonNull(NonNullType::List(inner_type)) = expected_type {
                    for val in values {
                        self.validate_input_value(ctx, val, inner_type, value_span);
                    }
                } else {
                    ctx.add_error(
                        format!(
                            "Expected type '{}', but got list value",
                            type_to_string_ref(expected_type)
                        ),
                        value_span,
                    );
                }
            }
            Value::Enum(enum_value) => {
                if let Some(enum_def) = ctx.schema().get_enum_type(type_name) {
                    let enum_val_str = enum_value.as_str();
                    if !enum_def.values.iter().any(|v| v.value.as_str() == enum_val_str) {
                        ctx.add_error(
                            format!(
                                "Value '{}' is not a valid value for enum type '{}'",
                                enum_val_str, type_name
                            ),
                            value_span,
                        );
                    }
                } else {
                    ctx.add_error(
                        format!(
                            "Expected enum type '{}', but got enum value for non-enum type",
                            type_name
                        ),
                        value_span,
                    );
                }
            }
            Value::Int(_) => {
                if type_name != "Int" && type_name != "Float" {
                    ctx.add_error(format!("Expected type '{}', but got Int value", type_name), value_span);
                }
            }
            Value::Float(_) => {
                if type_name != "Float" {
                    ctx.add_error(
                        format!("Expected type '{}', but got Float value", type_name),
                        value_span,
                    );
                }
            }
            Value::String(_) => {
                let is_built_in_scalar = type_name == "Int" || type_name == "Float" || type_name == "Boolean";
                let is_custom_scalar = ctx.schema().is_scalar(type_name)
                    && !is_built_in_scalar
                    && type_name != "String"
                    && type_name != "ID";

                if type_name != "String" && type_name != "ID" && !is_custom_scalar {
                    ctx.add_error(
                        format!("Expected type '{}', but got String value", type_name),
                        value_span,
                    );
                }
            }
            Value::Boolean(_) => {
                if type_name != "Boolean" {
                    ctx.add_error(
                        format!("Expected type '{}', but got Boolean value", type_name),
                        value_span,
                    );
                }
            }
            _ => {}
        }
    }

    fn check_field_uniqueness(&self, ctx: &mut ValidationContext<'a, 'b>, fields: &[ObjectField]) {
        let mut seen_fields = FxHashSet::default();

        for field in fields {
            let field_name = field.name.as_str();

            if !seen_fields.insert(field_name) {
                ctx.add_error(format!("Duplicate input object field '{}'", field_name), Span::empty());
            }

            if let Value::Object(nested_fields) = &field.value {
                self.check_field_uniqueness(ctx, nested_fields);
            } else if let Value::List(values) = &field.value {
                for value in values {
                    if let Value::Object(nested_fields) = value {
                        self.check_field_uniqueness(ctx, nested_fields);
                    }
                }
            }
        }
    }

    fn check_argument_input_uniqueness(&self, ctx: &mut ValidationContext<'a, 'b>, value: &Value<'a>) {
        if let Value::Object(fields) = value {
            self.check_field_uniqueness(ctx, fields);
        } else if let Value::List(values) = value {
            for val in values {
                self.check_argument_input_uniqueness(ctx, val);
            }
        }
    }
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for ValueRules<'a, 'b> {
    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a, 'b>, operation: &OperationDefinition<'a>) -> Control {
        let location = match operation.operation_type {
            OperationType::Query => DirectiveLocation::Query,
            OperationType::Mutation => DirectiveLocation::Mutation,
            OperationType::Subscription => DirectiveLocation::Subscription,
        };
        self.check_directive_uniqueness_and_validity(ctx, &operation.directives, location);

        let root_type = match operation.operation_type {
            OperationType::Query => ctx.schema().query_type().or(Some("Query")),
            OperationType::Mutation => ctx.schema().mutation_type().or(Some("Mutation")),
            OperationType::Subscription => ctx.schema().subscription_type().or(Some("Subscription")),
        };
        self.type_stack.push(root_type);

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

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a, 'b>, field: &Field<'a>) -> Control {
        self.check_directive_uniqueness_and_validity(ctx, &field.directives, DirectiveLocation::Field);

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

    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        self.check_directive_uniqueness_and_validity(ctx, &fragment.directives, DirectiveLocation::FragmentDefinition);
        self.type_stack.push(Some(fragment.type_condition.as_str()));
        Control::Next
    }

    fn leave_fragment(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _fragment: &FragmentDefinition<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.check_directive_uniqueness_and_validity(
            ctx,
            &fragment_spread.directives,
            DirectiveLocation::FragmentSpread,
        );
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.check_directive_uniqueness_and_validity(
            ctx,
            &inline_fragment.directives,
            DirectiveLocation::InlineFragment,
        );
        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        self.check_directive_uniqueness_and_validity(ctx, &var_def.directives, DirectiveLocation::VariableDefinition);

        if let Some(default_value) = &var_def.default_value {
            self.validate_input_value(ctx, default_value, &var_def.typ, var_def.span);
        }
        Control::Next
    }

    fn enter_argument(&mut self, ctx: &mut ValidationContext<'a, 'b>, argument: &Argument<'a>) -> Control {
        self.check_argument_input_uniqueness(ctx, &argument.value);

        if let Some(parent_type) = self.type_stack.get(self.type_stack.len().saturating_sub(2))
            && let Some(parent_type_name) = parent_type
            && let Some(field_name) = self.current_field_name
            && let Some(field_def) = ctx.schema().get_field(parent_type_name, field_name)
            && let Some(arg_def) = field_def
                .arguments
                .iter()
                .find(|a| a.name.as_str() == argument.name.as_str())
        {
            self.validate_input_value(ctx, &argument.value, &arg_def.typ, argument.span);
        }

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

fn type_to_string_ref(typ: &Type) -> String {
    match typ {
        Type::Named(named) => named.name.to_string(),
        Type::List(inner) => format!("[{}]", type_to_string_ref(inner)),
        Type::NonNull(non_null) => match non_null {
            NonNullType::Named(named) => format!("{}!", named.name),
            NonNullType::List(inner) => format!("[{}]!", type_to_string_ref(inner)),
        },
    }
}

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for ValueRules<'a, 'b> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate_rules;
    use assertables::*;

    #[test]
    fn test_skip_directive_on_field() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Q($condition: Boolean!) { field @skip(if: $condition) }"#
        ));
    }

    #[test]
    fn test_include_directive_on_inline_fragment() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Q($condition: Boolean!) { ... @include(if: $condition) { field } }"#
        ));
    }

    #[test]
    fn test_deprecated_directive_on_field_invalid() {
        assert_err!(validate_rules!(ValueRules, r#""#, r#"query Q { field @deprecated }"#));
    }

    #[test]
    fn test_specified_by_directive_on_field_invalid() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Q { field @specifiedBy(url: "http://example.com") }"#
        ));
    }

    #[test]
    fn test_variable_without_default_value() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String }"#,
            r#"query Q($input: UserInput) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_variable_with_valid_input_object_default() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String email: String }"#,
            r#"query Q($input: UserInput = { name: "John", email: "john@example.com" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_variable_with_invalid_field_name() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String email: String }"#,
            r#"query Q($input: UserInput = { name: "John", invalidField: "value" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_nested_input_object_with_invalid_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String address: AddressInput } input AddressInput { city: String country: String }"#,
            r#"query Q($input: UserInput = { name: "John", address: { city: "Seoul", invalidField: "value" } }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_list_of_input_objects_with_invalid_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: [UserInput]): String } input UserInput { name: String email: String }"#,
            r#"query Q($input: [UserInput] = [{ name: "John", invalidField: "value" }]) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_duplicate_input_object_field_in_variable() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String email: String }"#,
            r#"query Q($input: UserInput = { name: "John", name: "Jane" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_missing_required_input_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String! email: String }"#,
            r#"query Q($input: UserInput = { email: "john@example.com" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_required_input_field_provided() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String! email: String }"#,
            r#"query Q($input: UserInput = { name: "John", email: "john@example.com" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_duplicate_directive_on_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Q($c: Boolean!) { field @skip(if: $c) @skip(if: $c) }"#
        ));
    }

    #[test]
    fn test_different_directives_on_field() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Q($c1: Boolean!, $c2: Boolean!) { field @skip(if: $c1) @include(if: $c2) }"#
        ));
    }

    #[test]
    fn test_input_object_field_uniqueness_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test($input: Input!) { field(arg: { a: 1, b: 2, c: 3 }) }"#
        ));
    }

    #[test]
    fn test_input_object_field_uniqueness_duplicate_in_argument() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { field(arg: { a: 1, a: 2 }) }"#
        ));
    }

    #[test]
    fn test_input_object_field_uniqueness_nested() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { field(arg: { a: 1, nested: { x: 1, x: 2 } }) }"#
        ));
    }

    #[test]
    fn test_input_object_field_uniqueness_list_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { field(arg: { items: [{ a: 1, b: 2 }, { a: 3, b: 4 }] }) }"#
        ));
    }

    #[test]
    fn test_input_object_field_uniqueness_list_duplicate() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { field(arg: { items: [{ a: 1, a: 2 }] }) }"#
        ));
    }

    #[test]
    fn test_input_object_field_uniqueness_nested_list_duplicate() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { field(arg: { outer: [{ inner: { x: 1, x: 2 } }] }) }"#
        ));
    }

    #[test]
    fn test_input_object_with_all_required_fields() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String! email: String! }"#,
            r#"query Q($input: UserInput = { name: "John", email: "john@example.com" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_input_object_missing_required_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String! email: String! }"#,
            r#"query Q($input: UserInput = { name: "John" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_input_object_with_optional_fields_only() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String email: String }"#,
            r#"query Q($input: UserInput = { name: "John" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_nested_input_object_missing_required_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String! address: AddressInput } input AddressInput { city: String! country: String! }"#,
            r#"query Q($input: UserInput = { name: "John", address: { city: "Seoul" } }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_list_of_input_objects_missing_required_field() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: [UserInput]): String } input UserInput { name: String! email: String! }"#,
            r#"query Q($input: [UserInput] = [{ name: "John" }]) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_required_field_with_default_value() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: UserInput): String } input UserInput { name: String! email: String = "default@example.com" }"#,
            r#"query Q($input: UserInput = { name: "John" }) { field(arg: $input) }"#
        ));
    }

    #[test]
    fn test_directives_unique_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"directive @directive1 on QUERY | FIELD directive @directive2 on QUERY | FIELD type Query { field: String }"#,
            r#"query Test @directive1 @directive2 { field @directive1 @directive2 }"#
        ));
    }

    #[test]
    fn test_directives_duplicate_on_operation() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test @defer @defer { field }"#
        ));
    }

    #[test]
    fn test_directives_unique_on_fragment_spread() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"directive @directive1 on FRAGMENT_SPREAD directive @directive2 on FRAGMENT_SPREAD type Query { field: String }"#,
            r#"query Test { ...TestFragment @directive1 @directive2 } fragment TestFragment on Query { field }"#
        ));
    }

    #[test]
    fn test_directives_duplicate_on_fragment_spread() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { ...TestFragment @skip(if: true) @skip(if: false) } fragment TestFragment on Query { field }"#
        ));
    }

    #[test]
    fn test_directives_unique_on_inline_fragment() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"directive @directive1 on INLINE_FRAGMENT directive @directive2 on INLINE_FRAGMENT type Query { field: String }"#,
            r#"query Test { ... @directive1 @directive2 { field } }"#
        ));
    }

    #[test]
    fn test_directives_duplicate_on_inline_fragment() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test { ... @include(if: true) @include(if: false) { field } }"#
        ));
    }

    #[test]
    fn test_directives_unique_on_fragment_definition() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"directive @directive1 on FRAGMENT_DEFINITION directive @directive2 on FRAGMENT_DEFINITION type Query { field: String }"#,
            r#"fragment TestFragment on Query @directive1 @directive2 { field } query Q { ...TestFragment }"#
        ));
    }

    #[test]
    fn test_directives_duplicate_on_fragment_definition() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"fragment TestFragment on Query @defer @defer { field }"#
        ));
    }

    #[test]
    fn test_directives_unique_on_variable_definition() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"directive @directive1 on VARIABLE_DEFINITION directive @directive2 on VARIABLE_DEFINITION type Query { field: String }"#,
            r#"query Test($var: String! @directive1 @directive2) { field }"#
        ));
    }

    #[test]
    fn test_directives_duplicate_on_variable_definition() {
        assert_err!(validate_rules!(
            ValueRules,
            r#""#,
            r#"query Test($var: String! @skip(if: true) @skip(if: false)) { field }"#
        ));
    }

    #[test]
    fn test_value_type_int_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: Int): String } input TestInput { value: Int }"#,
            r#"query Q { field(arg: 42) }"#
        ));
    }

    #[test]
    fn test_value_type_int_to_string_invalid() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q { field(arg: 42) }"#
        ));
    }

    #[test]
    fn test_value_type_string_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q { field(arg: "test") }"#
        ));
    }

    #[test]
    fn test_value_type_string_to_int_invalid() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: Int): String }"#,
            r#"query Q { field(arg: "test") }"#
        ));
    }

    #[test]
    fn test_value_type_boolean_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: Boolean): String }"#,
            r#"query Q { field(arg: true) }"#
        ));
    }

    #[test]
    fn test_value_type_boolean_to_int_invalid() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: Int): String }"#,
            r#"query Q { field(arg: true) }"#
        ));
    }

    #[test]
    fn test_value_type_float_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: Float): String }"#,
            r#"query Q { field(arg: 3.14) }"#
        ));
    }

    #[test]
    fn test_value_type_int_to_float_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: Float): String }"#,
            r#"query Q { field(arg: 42) }"#
        ));
    }

    #[test]
    fn test_value_type_enum_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"enum Status { ACTIVE INACTIVE } type Query { field(arg: Status): String }"#,
            r#"query Q { field(arg: ACTIVE) }"#
        ));
    }

    #[test]
    fn test_value_type_enum_invalid_value() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"enum Status { ACTIVE INACTIVE } type Query { field(arg: Status): String }"#,
            r#"query Q { field(arg: UNKNOWN) }"#
        ));
    }

    #[test]
    fn test_value_type_list_to_scalar_invalid() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q { field(arg: ["test"]) }"#
        ));
    }

    #[test]
    fn test_value_type_null_to_non_null_invalid() {
        assert_err!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: String!): String }"#,
            r#"query Q { field(arg: null) }"#
        ));
    }

    #[test]
    fn test_value_type_null_to_nullable_valid() {
        assert_ok!(validate_rules!(
            ValueRules,
            r#"type Query { field(arg: String): String }"#,
            r#"query Q { field(arg: null) }"#
        ));
    }
}
