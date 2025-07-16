/// Validates that all directives are defined in the schema.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Directives-Are-Defined
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct DirectivesAreDefined;

impl<'a> Visitor<'a, ValidationContext<'a>> for DirectivesAreDefined {
    fn enter_directive(&mut self, ctx: &mut ValidationContext<'a>, directive: &Directive<'a>) -> Control {
        let schema = ctx.schema();

        let directive_name = directive.name.as_str();

        // Check if directive is built-in or custom
        let is_defined = matches!(directive_name, "skip" | "include" | "deprecated" | "specifiedBy")
            || schema.get_custom_directive(directive_name).is_some();

        if !is_defined {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!("Directive '@{}' is not defined in the schema", directive_name),
                },
                location: Some(Location::empty()),
            });
        }

        Control::Next
    }
}

impl<'a> ValidationRule<'a> for DirectivesAreDefined {}

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
        let mut rule = DirectivesAreDefined;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def
                && let Some(Selection::Field(field)) = op.selection_set.selections.first()
            {
                for directive in field.directives.iter() {
                    rule.enter_directive(&mut ctx, directive);
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_builtin_skip_directive() {
        assert_eq!(
            validate("query Q($condition: Boolean!) { field @skip(if: $condition) }"),
            0
        );
    }

    #[test]
    fn test_builtin_include_directive() {
        assert_eq!(
            validate("query Q($condition: Boolean!) { field @include(if: $condition) }"),
            0
        );
    }

    #[test]
    fn test_query_without_directives() {
        assert_eq!(validate("query Q { field }"), 0);
    }

    #[test]
    fn test_deprecated_directive() {
        assert_eq!(validate("query Q { field @deprecated }"), 0);
    }

    #[test]
    fn test_undefined_directive() {
        assert!(validate("query Q { field @undefinedDirective }") > 0);
    }

    #[test]
    fn test_undefined_directive_with_arguments() {
        assert!(validate("query Q { field @customDirective(arg: \"value\") }") > 0);
    }
}
