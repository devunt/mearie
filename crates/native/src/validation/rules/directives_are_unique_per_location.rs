/// Validates that directives are unique per location.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Directives-Are-Unique-Per-Location
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};
use rustc_hash::FxHashSet;

#[derive(Default)]
pub struct DirectivesAreUniquePerLocation;

impl DirectivesAreUniquePerLocation {
    fn check_directive_uniqueness<'a>(&self, ctx: &mut ValidationContext<'a>, directives: &[Directive]) {
        let mut seen_directives = FxHashSet::default();

        for directive in directives {
            let directive_name = directive.name.as_str();

            if !seen_directives.insert(directive_name) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!(
                            "Directive '@{}' is used more than once at this location",
                            directive_name
                        ),
                    },
                    location: Some(ctx.location_from_span(directive.span)),
                });
            }
        }
    }
}

impl<'a> Visitor<'a, ValidationContext<'a>> for DirectivesAreUniquePerLocation {
    fn enter_field(&mut self, ctx: &mut ValidationContext<'a>, field: &Field<'a>) -> Control {
        self.check_directive_uniqueness(ctx, &field.directives);
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.check_directive_uniqueness(ctx, &fragment_spread.directives);
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.check_directive_uniqueness(ctx, &inline_fragment.directives);
        Control::Next
    }

    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        self.check_directive_uniqueness(ctx, &operation.directives);
        Control::Next
    }

    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        self.check_directive_uniqueness(ctx, &fragment.directives);
        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        self.check_directive_uniqueness(ctx, &var_def.directives);
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for DirectivesAreUniquePerLocation {}

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
    use crate::error::MearieError;
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::validation::rule::ValidateNode;
    use crate::validation::test_schema::TestSchema;

    fn validate(source: &str) -> Result<(), MearieError> {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        doc.validate::<DirectivesAreUniquePerLocation>(&schema)
    }

    #[test]
    fn test_directives_unique_valid() {
        let result = validate("query Test @directive1 @directive2 { field @directive1 @directive2 }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_directives_duplicate_on_field() {
        let result = validate("query Test { field @skip(if: true) @skip(if: false) }");
        assert!(result.is_err());
    }

    #[test]
    fn test_directives_duplicate_on_operation() {
        let result = validate("query Test @defer @defer { field }");
        assert!(result.is_err());
    }

    #[test]
    fn test_directives_unique_on_fragment_spread() {
        let result = validate(
            "query Test { ...TestFragment @directive1 @directive2 }
             fragment TestFragment on Query { field }",
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_directives_duplicate_on_fragment_spread() {
        let result = validate(
            "query Test { ...TestFragment @skip(if: true) @skip(if: false) }
             fragment TestFragment on Query { field }",
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_directives_unique_on_inline_fragment() {
        let result = validate("query Test { ... @directive1 @directive2 { field } }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_directives_duplicate_on_inline_fragment() {
        let result = validate("query Test { ... @include(if: true) @include(if: false) { field } }");
        assert!(result.is_err());
    }

    #[test]
    fn test_directives_unique_on_fragment_definition() {
        let result = validate("fragment TestFragment on Query @directive1 @directive2 { field }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_directives_duplicate_on_fragment_definition() {
        let result = validate("fragment TestFragment on Query @defer @defer { field }");
        assert!(result.is_err());
    }

    #[test]
    fn test_directives_unique_on_variable_definition() {
        let result = validate("query Test($var: String! @directive1 @directive2) { field }");
        assert!(result.is_ok());
    }

    #[test]
    fn test_directives_duplicate_on_variable_definition() {
        let result = validate("query Test($var: String! @skip(if: true) @skip(if: false)) { field }");
        assert!(result.is_err());
    }
}
