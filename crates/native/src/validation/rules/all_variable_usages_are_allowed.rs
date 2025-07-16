/// Validates that variable usages are compatible with their definitions.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-All-Variable-Usages-are-Allowed
use crate::ast::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct AllVariableUsagesAreAllowed;

impl<'a> Visitor<'a, ValidationContext<'a>> for AllVariableUsagesAreAllowed {
    fn enter_argument(&mut self, _ctx: &mut ValidationContext<'a>, _argument: &Argument<'a>) -> Control {
        // TODO: Check if variable usage matches variable definition type
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for AllVariableUsagesAreAllowed {}

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
    use crate::validation::test_schema::TestSchema;

    fn validate(source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = AllVariableUsagesAreAllowed;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                if let Some(Selection::Field(field)) = op.selection_set.selections.first() {
                    for arg in field.arguments.iter() {
                        rule.enter_argument(&mut ctx, arg);
                    }
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_basic_query_with_no_arguments() {
        assert_eq!(validate("query Q { field }"), 0);
    }

    #[test]
    fn test_query_with_variable_argument() {
        assert_eq!(validate("query Q($var: String) { field(arg: $var) }"), 0);
    }

    #[test]
    fn test_query_with_multiple_variables() {
        assert_eq!(
            validate("query Q($var1: String, $var2: Int) { field(arg1: $var1, arg2: $var2) }"),
            0
        );
    }

    #[test]
    fn test_variable_used_without_definition() {
        assert_eq!(validate("query Q { field(arg: $undefinedVar) }"), 0);
    }

    #[test]
    fn test_nested_query_with_variables() {
        assert_eq!(
            validate("query Q($userId: ID!, $postId: ID!) { user(id: $userId) { post(id: $postId) } }"),
            0
        );
    }

    #[test]
    fn test_mutation_with_variable() {
        assert_eq!(
            validate("mutation M($input: String!) { updateField(input: $input) }"),
            0
        );
    }

    #[test]
    fn test_subscription_with_variable() {
        assert_eq!(
            validate("subscription S($topicId: ID!) { messageAdded(topicId: $topicId) }"),
            0
        );
    }
}
