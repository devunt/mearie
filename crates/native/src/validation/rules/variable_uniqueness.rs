/// Validates that variable names are unique within each operation.
///
/// GraphQL allows variables to be defined on operations, but each variable
/// within an operation must have a unique name. Variables from different
/// operations are independent and may share names.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Variable-Uniqueness
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct VariableUniqueness<'a> {
    variable_names: Vec<&'a str>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for VariableUniqueness<'a> {
    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, _operation: &OperationDefinition<'a>) -> Control {
        self.variable_names.clear();
        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        let name = var_def.variable.as_str();

        if self.variable_names.contains(&name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!("Duplicate variable name '${}'", name),
                },
                location: Some(ctx.location_from_span(var_def.span)),
            });
        }

        self.variable_names.push(name);
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for VariableUniqueness<'a> {}

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
        let mut rule = VariableUniqueness::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                for var_def in op.variable_definitions.iter() {
                    rule.enter_variable_definition(&mut ctx, var_def);
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_unique_variable_names_valid() {
        assert_eq!(validate("query Q($a: Int, $b: String) { field }"), 0);
    }

    #[test]
    fn test_unique_variable_names_duplicate() {
        assert!(validate("query Q($a: Int, $a: String) { field }") > 0);
    }

    #[test]
    fn test_unique_variable_names_different_operations() {
        assert_eq!(
            validate("query Q1($a: Int) { field } query Q2($a: String) { field }"),
            0
        );
    }

    #[test]
    fn test_unique_variable_names_multiple_same_name() {
        assert!(validate("query Q($a: Int, $b: String, $a: Float) { field }") > 0);
    }

    #[test]
    fn test_unique_variable_names_all_duplicates() {
        assert!(validate("query Q($x: Int, $x: String, $x: Float) { field }") > 0);
    }

    #[test]
    fn test_unique_variable_names_mutation_with_duplicates() {
        assert!(validate("mutation M($input: String, $input: Int) { update }") > 0);
    }

    #[test]
    fn test_unique_variable_names_no_variables() {
        assert_eq!(validate("query Q { field { id } }"), 0);
    }
}
