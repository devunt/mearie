/// Validates that operation names are unique within a document.
///
/// GraphQL allows multiple named operations in a document, but each named operation
/// must have a unique name. Anonymous operations are ignored by this rule.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Operation-Name-Uniqueness
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct OperationNameUniqueness<'a> {
    operation_names: Vec<&'a str>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for OperationNameUniqueness<'a> {
    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        if let Some(name) = operation.name {
            let name_str = name.as_str();

            if self.operation_names.contains(&name_str) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!("Duplicate operation name '{}'", name_str),
                    },
                    location: Some(ctx.location_from_span(operation.span)),
                });
                return Control::Break;
            }

            self.operation_names.push(name_str);
        }

        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Skip
    }
}

impl<'a> ValidationRule<'a> for OperationNameUniqueness<'a> {}

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
        let mut rule = OperationNameUniqueness::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_unique_operation_names_valid() {
        assert_eq!(
            validate("query GetUser { user { id } } query GetPosts { posts { id } }"),
            0
        );
    }

    #[test]
    fn test_unique_operation_names_duplicate() {
        assert!(validate("query GetUser { user { id } } query GetUser { user { name } }") > 0);
    }

    #[test]
    fn test_unique_operation_names_anonymous_allowed() {
        assert_eq!(validate("{ user { id } } query GetUser { user { name } }"), 0);
    }

    #[test]
    fn test_unique_operation_names_three_duplicates() {
        assert!(validate("query Foo { user { id } } query Foo { user { name } } query Foo { user { email } }") > 0);
    }

    #[test]
    fn test_unique_operation_names_mixed_types() {
        assert_eq!(
            validate(
                "query GetUser { user { id } } mutation UpdateUser { update } subscription OnUserChange { userChanged }"
            ),
            0
        );
    }

    #[test]
    fn test_unique_operation_names_duplicate_mutations() {
        assert!(validate("mutation CreateUser { create } mutation CreateUser { create }") > 0);
    }

    #[test]
    fn test_unique_operation_names_single_operation() {
        assert_eq!(validate("query GetUser { user { id name email } }"), 0);
    }
}
