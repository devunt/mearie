/// Validates that fragment names are unique within a document.
///
/// GraphQL allows multiple fragment definitions in a document, but each fragment
/// must have a unique name. This rule ensures no duplicate fragment names exist.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragment-Name-Uniqueness
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FragmentNameUniqueness<'a> {
    fragment_names: Vec<&'a str>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for FragmentNameUniqueness<'a> {
    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        let name = fragment.name.as_str();

        if self.fragment_names.contains(&name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!("Duplicate fragment name '{}'", name),
                },
                location: Some(ctx.location_from_span(fragment.span)),
            });
            return Control::Break;
        }

        self.fragment_names.push(name);
        Control::Next
    }

    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, _operation: &OperationDefinition<'a>) -> Control {
        Control::Skip
    }
}

impl<'a> ValidationRule<'a> for FragmentNameUniqueness<'a> {}

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
        let mut rule = FragmentNameUniqueness::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Fragment(frag)) = def {
                rule.enter_fragment(&mut ctx, frag);
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_unique_fragment_names_valid() {
        assert_eq!(
            validate("fragment UserFields on User { id } fragment PostFields on Post { id }"),
            0
        );
    }

    #[test]
    fn test_unique_fragment_names_duplicate() {
        assert!(validate("fragment UserFields on User { id } fragment UserFields on User { name }") > 0);
    }

    #[test]
    fn test_unique_fragment_names_multiple_duplicates() {
        assert!(validate("fragment F on User { id } fragment F on User { name } fragment F on User { email }") > 0);
    }

    #[test]
    fn test_unique_fragment_names_case_sensitive() {
        assert_eq!(
            validate("fragment userFields on User { id } fragment UserFields on User { name }"),
            0
        );
    }

    #[test]
    fn test_unique_fragment_names_single_fragment() {
        assert_eq!(validate("fragment UserFields on User { id name email }"), 0);
    }

    #[test]
    fn test_unique_fragment_names_many_unique() {
        assert_eq!(
            validate(
                "fragment A on User { id } fragment B on User { name } fragment C on Post { title } fragment D on Post { content }"
            ),
            0
        );
    }

    #[test]
    fn test_unique_fragment_names_with_operations() {
        assert_eq!(
            validate("fragment UserFields on User { id } query Q { user { ...UserFields } } mutation M { createUser }"),
            0
        );
    }
}
