use crate::error::location::Span;
use crate::graphql::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashSet;
use std::marker::PhantomData;

#[derive(Default)]
pub struct FragmentRules<'a, 'b> {
    fragment_names: Vec<&'a str>,
    fragment_definitions: Vec<(&'a str, Vec<&'a str>, Span)>,
    fragment_spreads: Vec<(&'a str, Span)>,
    used_fragments: Vec<&'a str>,
    current_fragment: Option<&'a str>,
    current_fragment_span: Option<Span>,
    current_spreads: Vec<&'a str>,
    type_stack: Vec<Option<&'a str>>,
    _phantom: PhantomData<&'b ()>,
}

impl<'a, 'b> FragmentRules<'a, 'b> {
    fn check_type_compatibility(
        &self,
        ctx: &mut ValidationContext<'a, 'b>,
        fragment_type: &str,
        parent_type: &str,
    ) -> bool {
        if fragment_type == parent_type {
            return true;
        }

        let fragment_possible_types: FxHashSet<&str> = ctx.schema().get_possible_types(fragment_type).collect();
        let parent_possible_types: FxHashSet<&str> = ctx.schema().get_possible_types(parent_type).collect();

        if fragment_possible_types.is_empty() && parent_possible_types.is_empty() {
            return false;
        }

        if fragment_possible_types.is_empty() {
            return parent_possible_types.contains(fragment_type);
        }

        if parent_possible_types.is_empty() {
            return fragment_possible_types.contains(parent_type);
        }

        fragment_possible_types
            .intersection(&parent_possible_types)
            .next()
            .is_some()
    }
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for FragmentRules<'a, 'b> {
    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        let name = fragment.name.as_str();

        if self.fragment_names.contains(&name) {
            ctx.add_error(format!("Duplicate fragment name '{}'", name), fragment.span);
            return Control::Break;
        }

        self.fragment_names.push(name);

        let type_name = fragment.type_condition.as_str();

        if !ctx.schema().has_type(type_name) {
            ctx.add_error(
                format!(
                    "Fragment '{}' is defined on type '{}', which does not exist in the schema",
                    name, type_name
                ),
                fragment.span,
            );
        }

        if ctx.schema().has_type(type_name)
            && !ctx.schema().is_object(type_name)
            && !ctx.schema().is_interface(type_name)
            && !ctx.schema().is_union(type_name)
        {
            ctx.add_error(format!(
                "Fragment '{}' cannot be defined on non-composite type '{}'. Fragments can only be defined on object, interface, or union types.",
                name, type_name
            ),
            fragment.span,
        );
        }

        self.current_fragment = Some(name);
        self.current_fragment_span = Some(fragment.span);
        self.current_spreads = Vec::new();
        self.type_stack.push(Some(type_name));
        Control::Next
    }

    fn leave_fragment(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _fragment: &FragmentDefinition<'a>) -> Control {
        if let Some(fragment_name) = self.current_fragment
            && let Some(fragment_span) = &self.current_fragment_span
        {
            self.fragment_definitions
                .push((fragment_name, self.current_spreads.clone(), *fragment_span));
        }
        self.current_fragment = None;
        self.current_fragment_span = None;
        self.type_stack.pop();
        Control::Next
    }

    fn enter_operation(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        operation: &OperationDefinition<'a>,
    ) -> Control {
        let operation_type = match operation.operation_type {
            OperationType::Query => Some("Query"),
            OperationType::Mutation => Some("Mutation"),
            OperationType::Subscription => Some("Subscription"),
        };
        self.type_stack.push(operation_type);
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
        if let Some(Some(parent_type)) = self.type_stack.last() {
            if let Some(field_def) = ctx.schema().get_field(parent_type, field.name.as_str()) {
                let named_type = get_named_type(&field_def.typ);
                self.type_stack.push(Some(named_type));
            } else {
                self.type_stack.push(None);
            }
        } else {
            self.type_stack.push(None);
        }

        Control::Next
    }

    fn leave_field(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _field: &Field<'a>) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        if let Some(type_condition) = &inline_fragment.type_condition {
            let type_name = type_condition.as_str();

            if !ctx.schema().has_type(type_name) {
                ctx.add_error(
                    format!(
                        "Inline fragment is defined on type '{}', which does not exist in the schema",
                        type_name
                    ),
                    inline_fragment.span,
                );
            }

            if ctx.schema().has_type(type_name)
                && !ctx.schema().is_object(type_name)
                && !ctx.schema().is_interface(type_name)
                && !ctx.schema().is_union(type_name)
            {
                ctx.add_error(format!(
                    "Inline fragment cannot be defined on non-composite type '{}'. Fragments can only be defined on object, interface, or union types.",
                    type_name
                ),
                inline_fragment.span,
            );
            }

            self.type_stack.push(Some(type_name));
        } else if let Some(&parent_type) = self.type_stack.last() {
            self.type_stack.push(parent_type);
        } else {
            self.type_stack.push(None);
        }
        Control::Next
    }

    fn leave_inline_fragment(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        _inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.type_stack.pop();
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        let fragment_name = fragment_spread.fragment_name.as_str();

        if self.current_fragment.is_some() {
            self.current_spreads.push(fragment_name);
        }

        self.fragment_spreads.push((fragment_name, fragment_spread.span));
        self.used_fragments.push(fragment_name);

        let fragment_type = ctx
            .document()
            .get_fragment(fragment_name)
            .map(|fragment| fragment.type_condition.as_str());

        if fragment_type.is_none() && !self.fragment_names.contains(&fragment_name) {
            return Control::Skip;
        }

        if let Some(Some(parent_type)) = self.type_stack.last()
            && let Some(fragment_type) = fragment_type
            && !self.check_type_compatibility(ctx, fragment_type, parent_type)
        {
            ctx.add_error(
                format!(
                    "Fragment '{}' cannot be spread on type '{}'. Fragment is defined on '{}'.",
                    fragment_name, parent_type, fragment_type
                ),
                fragment_spread.span,
            );
        }

        Control::Next
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a, 'b>, _document: &Document<'a>) -> Control {
        for (spread_name, spread_span) in &self.fragment_spreads {
            if !self.fragment_names.contains(spread_name) && ctx.document().get_fragment(spread_name).is_none() {
                ctx.add_error("Only known fragments may occur in fragment spreads.", *spread_span);
            }
        }

        for (fragment_name, _, fragment_span) in &self.fragment_definitions {
            if !self.used_fragments.contains(fragment_name) {
                ctx.add_error("All defined fragments must be used at least once.", *fragment_span);
            }
        }

        for (fragment_name, _, fragment_span) in &self.fragment_definitions {
            let mut visited = Vec::new();
            let mut rec_stack = Vec::new();

            if has_cycle(fragment_name, &self.fragment_definitions, &mut visited, &mut rec_stack) {
                ctx.add_error("Fragment definitions must not form cycles.", *fragment_span);
                break;
            }
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

fn has_cycle<'a>(
    fragment_name: &'a str,
    fragments: &[(&'a str, Vec<&'a str>, Span)],
    visited: &mut Vec<&'a str>,
    rec_stack: &mut Vec<&'a str>,
) -> bool {
    if rec_stack.contains(&fragment_name) {
        return true;
    }
    if visited.contains(&fragment_name) {
        return false;
    }

    visited.push(fragment_name);
    rec_stack.push(fragment_name);

    if let Some((_, spreads, _)) = fragments.iter().find(|(name, _, _)| *name == fragment_name) {
        for spread in spreads {
            if has_cycle(spread, fragments, visited, rec_stack) {
                return true;
            }
        }
    }

    rec_stack.retain(|&n| n != fragment_name);
    false
}

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for FragmentRules<'a, 'b> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate_rules;
    use assertables::*;

    #[test]
    fn test_unique_fragment_names_valid() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User post: Post } type User { id: ID! } type Post { id: ID! }"#,
            r#"fragment UserFields on User { id } fragment PostFields on Post { id } query Q { user { ...UserFields } post { ...PostFields } }"#
        ));
    }

    #[test]
    fn test_known_fragment_names_valid() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! }"#,
            r#"fragment UserFields on User { id } query Q { user { ...UserFields } }"#
        ));
    }

    #[test]
    fn test_known_fragment_names_unknown() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"query Q { user { ...UnknownFragment } }"#
        ));
    }

    #[test]
    fn test_fragment_on_valid_type() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! name: String! }"#,
            r#"fragment UserFields on User { id name } query Q { user { ...UserFields } }"#
        ));
    }

    #[test]
    fn test_fragment_on_nonexistent_type() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#"type User { id: ID! }"#,
            r#"fragment Frag on NonExistentType { id }"#
        ));
    }

    #[test]
    fn test_fragment_on_same_type() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! name: String }"#,
            r#"fragment UserFields on User { id } query Q { user { ...UserFields } }"#
        ));
    }

    #[test]
    fn test_fragment_on_incompatible_type() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! name: String } type Post { id: ID! title: String }"#,
            r#"fragment PostFields on Post { id } query Q { user { ...PostFields } }"#
        ));
    }

    #[test]
    fn test_fragment_on_object_type() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! name: String }"#,
            r#"fragment UserFields on User { id name } query Q { user { ...UserFields } }"#
        ));
    }

    #[test]
    fn test_fragment_on_scalar_type() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#"scalar CustomScalar"#,
            r#"fragment ScalarFragment on CustomScalar { field }"#
        ));
    }

    #[test]
    fn test_no_unused_fragments_valid() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! }"#,
            r#"fragment UserFields on User { id } query Q { user { ...UserFields } }"#
        ));
    }

    #[test]
    fn test_no_unused_fragments_unused() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"fragment UnusedFragment on User { id } query Q { user { id } }"#
        ));
    }

    #[test]
    fn test_no_fragment_cycles_valid() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type Query { user: User } type User { id: ID! }"#,
            r#"fragment A on User { id } fragment B on User { ...A } query Q { user { ...B } }"#
        ));
    }

    #[test]
    fn test_no_fragment_cycles_direct_cycle() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"fragment A on User { id ...A }"#
        ));
    }

    #[test]
    fn test_no_fragment_cycles_indirect_cycle() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"fragment A on User { ...B } fragment B on User { ...C } fragment C on User { ...A }"#
        ));
    }

    #[test]
    fn test_no_fragment_cycles_two_way_cycle() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"fragment A on User { ...B } fragment B on User { ...A }"#
        ));
    }

    #[test]
    fn test_inline_fragment_without_type_condition() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"query Q { user { ... { id } } }"#
        ));
    }

    #[test]
    fn test_inline_fragment_with_type_condition() {
        assert_ok!(validate_rules!(
            FragmentRules,
            r#"type User { id: ID! }"#,
            r#"query Q { user { ... on User { id } } }"#
        ));
    }

    #[test]
    fn test_inline_fragment_on_nonexistent_type() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#""#,
            r#"query Q { user { ... on NonExistentType { id } } }"#
        ));
    }

    #[test]
    fn test_inline_fragment_on_enum_type() {
        assert_err!(validate_rules!(
            FragmentRules,
            r#"enum Status { ACTIVE INACTIVE }"#,
            r#"query Q { user { ... on Status { field } } }"#
        ));
    }
}
