/// Validates that subscription operations have exactly one root field.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Single-root-field
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct SubscriptionSingleRootField;

impl<'a> Visitor<'a, ValidationContext<'a>> for SubscriptionSingleRootField {
    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        if operation.operation_type == OperationType::Subscription {
            let field_count = operation
                .selection_set
                .selections
                .iter()
                .filter(|selection| matches!(selection, Selection::Field(_)))
                .count();

            if field_count != 1 {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!(
                            "Subscription operation must have exactly one root field, found {}",
                            field_count
                        ),
                    },
                    location: Some(ctx.location_from_span(operation.span)),
                });
            }
        }

        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Skip
    }
}

impl<'a> ValidationRule<'a> for SubscriptionSingleRootField {}

#[cfg(test)]
mod tests {
    use crate::span::Source;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }
    use super::*;
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::validation::rule::ValidateNode;
    use crate::validation::test_schema::TestSchema;

    #[test]
    fn test_subscription_single_root_field_valid() {
        let gql_ctx = GraphQLContext::new();
        let source = parse_source(r#"subscription OnMessageAdded { messageAdded { id content } }"#);
        let doc = Document::parse(&gql_ctx, &source).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_ok());
    }

    #[test]
    fn test_subscription_multiple_root_fields_invalid() {
        let gql_ctx = GraphQLContext::new();
        let source = parse_source(r#"subscription InvalidSubscription { messageAdded { id } userUpdated { id } }"#);
        let doc = Document::parse(&gql_ctx, &source).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_err());
    }

    #[test]
    fn test_subscription_zero_root_fields_invalid() {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(r#"subscription EmptySubscription { ...SomeFragment }"#);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_err());
    }

    #[test]
    fn test_query_multiple_root_fields_allowed() {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(r#"query MultipleFields { user { id } posts { id } }"#);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_ok());
    }

    #[test]
    fn test_subscription_with_inline_fragment_valid() {
        let gql_ctx = GraphQLContext::new();
        let source = parse_source(r#"subscription ValidSub { messageAdded { id ... on Message { content } } }"#);
        let doc = Document::parse(&gql_ctx, &source).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_ok());
    }

    #[test]
    fn test_mutation_multiple_root_fields_allowed() {
        let gql_ctx = GraphQLContext::new();
        let source = parse_source(r#"mutation MultipleMutations { createUser { id } updatePost { id } }"#);
        let doc = Document::parse(&gql_ctx, &source).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_ok());
    }

    #[test]
    fn test_subscription_with_three_root_fields_invalid() {
        let gql_ctx = GraphQLContext::new();
        let source =
            parse_source(r#"subscription Invalid { messageAdded { id } userUpdated { id } postCreated { id } }"#);
        let doc = Document::parse(&gql_ctx, &source).unwrap();
        let schema = TestSchema::default();
        let result = doc.validate::<SubscriptionSingleRootField>(&schema);
        assert!(result.is_err());
    }
}
