use crate::error::location::Span;
use crate::graphql::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use std::marker::PhantomData;

#[derive(Default)]
pub struct DocumentRules<'a, 'b> {
    operations: usize,
    fragments: usize,
    _phantom: PhantomData<(&'a (), &'b ())>,
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for DocumentRules<'a, 'b> {
    fn enter_operation(
        &mut self,
        _ctx: &mut ValidationContext<'a, 'b>,
        _operation: &OperationDefinition<'a>,
    ) -> Control {
        self.operations += 1;
        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a, 'b>, _fragment: &FragmentDefinition<'a>) -> Control {
        self.fragments += 1;
        Control::Next
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a, 'b>, _document: &Document<'a>) -> Control {
        let total_definitions = self.operations + self.fragments;

        if total_definitions != 1 {
            ctx.add_error(
                format!(
                    "Document must contain exactly one operation or exactly one fragment, found {}",
                    total_definitions
                ),
                Span { start: 0, end: 0 },
            );
            return Control::Break;
        }

        Control::Next
    }
}

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for DocumentRules<'a, 'b> {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate_rules;
    use assertables::*;

    #[test]
    fn test_document_with_single_operation_valid() {
        assert_ok!(validate_rules!(
            DocumentRules,
            r#""#,
            r#"query GetUser { user { id } }"#
        ));
    }

    #[test]
    fn test_document_with_single_fragment_valid() {
        assert_ok!(validate_rules!(
            DocumentRules,
            r#"type User { id: ID }"#,
            r#"fragment UserFields on User { id }"#
        ));
    }

    #[test]
    fn test_document_with_multiple_operations_invalid() {
        assert_err!(validate_rules!(
            DocumentRules,
            r#""#,
            r#"query GetUser { user { id } } query GetPosts { posts { id } }"#
        ));
    }

    #[test]
    fn test_document_with_multiple_fragments_invalid() {
        assert_err!(validate_rules!(
            DocumentRules,
            r#"type User { id: ID name: String }"#,
            r#"fragment UserFields on User { id } fragment UserName on User { name }"#
        ));
    }

    #[test]
    fn test_document_with_operation_and_fragment_invalid() {
        assert_err!(validate_rules!(
            DocumentRules,
            r#"type User { id: ID }"#,
            r#"query GetUser { user { id } } fragment UserFields on User { id }"#
        ));
    }

    #[test]
    fn test_document_with_no_definitions_invalid() {
        assert_err!(validate_rules!(DocumentRules, r#""#, r#""#));
    }

    #[test]
    fn test_document_with_single_mutation_valid() {
        assert_ok!(validate_rules!(
            DocumentRules,
            r#""#,
            r#"mutation CreateUser { createUser { id } }"#
        ));
    }

    #[test]
    fn test_document_with_single_subscription_valid() {
        assert_ok!(validate_rules!(
            DocumentRules,
            r#""#,
            r#"subscription OnUserCreated { userCreated { id } }"#
        ));
    }

    #[test]
    fn test_document_with_three_operations_invalid() {
        assert_err!(validate_rules!(
            DocumentRules,
            r#""#,
            r#"query A { user { id } } query B { user { name } } query C { user { email } }"#
        ));
    }
}
