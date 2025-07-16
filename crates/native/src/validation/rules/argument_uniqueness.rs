/// Validates that argument names are unique within fields and directives.
///
/// GraphQL allows arguments to be provided to fields and directives, but each
/// argument within a field or directive must have a unique name.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Argument-Uniqueness
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct ArgumentUniqueness<'a> {
    argument_names: Vec<&'a str>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for ArgumentUniqueness<'a> {
    fn enter_field(&mut self, _ctx: &mut ValidationContext<'a>, _field: &Field<'a>) -> Control {
        self.argument_names.clear();
        Control::Next
    }

    fn enter_directive(&mut self, _ctx: &mut ValidationContext<'a>, _directive: &Directive<'a>) -> Control {
        self.argument_names.clear();
        Control::Next
    }

    fn enter_argument(&mut self, ctx: &mut ValidationContext<'a>, argument: &Argument<'a>) -> Control {
        let name = argument.name.as_str();

        if self.argument_names.contains(&name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!("Duplicate argument name '{}'", name),
                },
                location: Some(ctx.location_from_span(argument.span)),
            });
        }

        self.argument_names.push(name);
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for ArgumentUniqueness<'a> {}

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
        let mut rule = ArgumentUniqueness::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                for selection in op.selection_set.selections.iter() {
                    if let Selection::Field(field) = selection {
                        rule.enter_field(&mut ctx, field);
                        for arg in field.arguments.iter() {
                            rule.enter_argument(&mut ctx, arg);
                        }
                    }
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_unique_argument_names_valid() {
        assert_eq!(validate(r#"query Q { field(arg1: "value1", arg2: "value2") }"#), 0);
    }

    #[test]
    fn test_unique_argument_names_duplicate() {
        assert!(validate(r#"query Q { field(arg: "value1", arg: "value2") }"#) > 0);
    }

    #[test]
    fn test_unique_argument_names_different_fields() {
        assert_eq!(
            validate(r#"query Q { field1(arg: "value1") field2(arg: "value2") }"#),
            0
        );
    }

    #[test]
    fn test_unique_argument_names_three_args_one_duplicate() {
        assert!(validate(r#"query Q { field(arg1: "value1", arg2: "value2", arg1: "value3") }"#) > 0);
    }

    #[test]
    fn test_unique_argument_names_multiple_duplicates() {
        assert!(validate(r#"query Q { field(arg: "value1", arg: "value2", arg: "value3") }"#) > 0);
    }

    #[test]
    fn test_unique_argument_names_nested_fields() {
        assert_eq!(
            validate(r#"query Q { field(arg: "value1") { nested(arg: "value2") } }"#),
            0
        );
    }

    #[test]
    fn test_unique_argument_names_no_arguments() {
        assert_eq!(validate(r#"query Q { field1 field2 }"#), 0);
    }
}
