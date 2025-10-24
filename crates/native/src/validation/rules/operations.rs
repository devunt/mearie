use crate::error::location::Span;
use crate::graphql::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use std::marker::PhantomData;

#[derive(Default)]
pub struct OperationRules<'a, 'b> {
    operation_names: Vec<&'a str>,
    operations: usize,
    has_anonymous: bool,
    anonymous_span: Option<Span>,
    _phantom: PhantomData<&'b ()>,
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for OperationRules<'a, 'b> {
    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a, 'b>, operation: &OperationDefinition<'a>) -> Control {
        self.operations += 1;

        if let Some(name) = operation.name {
            let name_str = name.as_str();
            if self.operation_names.contains(&name_str) {
                ctx.add_error(format!("Duplicate operation name '{}'", name_str), operation.span);
                return Control::Break;
            }
            self.operation_names.push(name_str);
        } else {
            self.has_anonymous = true;
            self.anonymous_span = Some(operation.span);
        }

        if operation.operation_type == OperationType::Subscription {
            let field_count = operation
                .selection_set
                .selections
                .iter()
                .filter(|selection| matches!(selection, Selection::Field(_)))
                .count();

            if field_count != 1 {
                ctx.add_error(
                    format!(
                        "Subscription operation must have exactly one root field, found {}",
                        field_count
                    ),
                    operation.span,
                );
            }
        }

        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Skip
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a, 'b>, _document: &Document<'a>) -> Control {
        if self.has_anonymous && self.operations > 1 {
            let span = self.anonymous_span.unwrap_or(Span { start: 0, end: 0 });
            ctx.add_error(
                "A document containing an anonymous operation must contain only that operation.",
                span,
            );
            return Control::Break;
        }
        Control::Next
    }
}

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for OperationRules<'a, 'b> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate_rules;
    use assertables::*;

    #[test]
    fn test_unique_operation_names_valid() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query GetUser { user { id } } query GetPosts { posts { id } }"#
        ));
    }

    #[test]
    fn test_unique_operation_names_duplicate() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query GetUser { user { id } } query GetUser { user { name } }"#
        ));
    }

    #[test]
    fn test_unique_operation_names_anonymous_allowed() {
        assert_ok!(validate_rules!(OperationRules, r#""#, r#"{ user { id } }"#));
    }

    #[test]
    fn test_unique_operation_names_three_duplicates() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query Foo { user { id } } query Foo { user { name } } query Foo { user { email } }"#
        ));
    }

    #[test]
    fn test_unique_operation_names_mixed_types() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query GetUser { user { id } } mutation UpdateUser { update } subscription OnUserChange { userChanged }"#
        ));
    }

    #[test]
    fn test_unique_operation_names_duplicate_mutations() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"mutation CreateUser { create } mutation CreateUser { create }"#
        ));
    }

    #[test]
    fn test_unique_operation_names_single_operation() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query GetUser { user { id name email } }"#
        ));
    }

    #[test]
    fn test_lone_anonymous_operation_valid_single() {
        assert_ok!(validate_rules!(OperationRules, r#""#, r#"{ field }"#));
    }

    #[test]
    fn test_lone_anonymous_operation_invalid_multiple() {
        assert_err!(validate_rules!(OperationRules, r#""#, r#"{ field } query Q { field }"#));
    }

    #[test]
    fn test_lone_anonymous_operation_valid_named_only() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query Q1 { field } query Q2 { field }"#
        ));
    }

    #[test]
    fn test_lone_anonymous_operation_multiple_anonymous() {
        assert_err!(validate_rules!(OperationRules, r#""#, r#"{ field1 } { field2 }"#));
    }

    #[test]
    fn test_lone_anonymous_operation_with_fragment() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"{ field } fragment F on User { id }"#
        ));
    }

    #[test]
    fn test_lone_anonymous_operation_multiple_named_operations() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query A { field } query B { field } query C { field }"#
        ));
    }

    #[test]
    fn test_lone_anonymous_operation_anonymous_with_mutation() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"{ field } mutation M { update }"#
        ));
    }

    #[test]
    fn test_subscription_single_root_field_valid() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"subscription OnMessageAdded { messageAdded { id content } }"#
        ));
    }

    #[test]
    fn test_subscription_multiple_root_fields_invalid() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"subscription InvalidSubscription { messageAdded { id } userUpdated { id } }"#
        ));
    }

    #[test]
    fn test_subscription_zero_root_fields_invalid() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"subscription EmptySubscription { ...SomeFragment }"#
        ));
    }

    #[test]
    fn test_query_multiple_root_fields_allowed() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"query MultipleFields { user { id } posts { id } }"#
        ));
    }

    #[test]
    fn test_subscription_with_inline_fragment_valid() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"subscription ValidSub { messageAdded { id ... on Message { content } } }"#
        ));
    }

    #[test]
    fn test_mutation_multiple_root_fields_allowed() {
        assert_ok!(validate_rules!(
            OperationRules,
            r#""#,
            r#"mutation MultipleMutations { createUser { id } updatePost { id } }"#
        ));
    }

    #[test]
    fn test_subscription_with_three_root_fields_invalid() {
        assert_err!(validate_rules!(
            OperationRules,
            r#""#,
            r#"subscription Invalid { messageAdded { id } userUpdated { id } postCreated { id } }"#
        ));
    }
}
