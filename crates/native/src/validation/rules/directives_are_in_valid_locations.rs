/// Validates that directives are used in valid locations.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Directives-Are-In-Valid-Locations
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::*;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct DirectivesAreInValidLocations;

impl DirectivesAreInValidLocations {
    fn get_built_in_directive_locations(name: &str) -> Option<&'static [DirectiveLocation]> {
        match name {
            "skip" | "include" => Some(&[
                DirectiveLocation::Field,
                DirectiveLocation::FragmentSpread,
                DirectiveLocation::InlineFragment,
            ]),
            "deprecated" => Some(&[
                DirectiveLocation::FieldDefinition,
                DirectiveLocation::EnumValue,
                DirectiveLocation::ArgumentDefinition,
                DirectiveLocation::InputFieldDefinition,
            ]),
            "specifiedBy" => Some(&[DirectiveLocation::Scalar]),
            _ => None,
        }
    }

    fn validate_directives(
        &self,
        ctx: &mut ValidationContext,
        directives: &[Directive],
        current_location: DirectiveLocation,
    ) {
        let schema = ctx.schema();

        for directive in directives {
            let directive_name = directive.name.as_str();

            // Check built-in directives first
            let allowed_locations = if let Some(locations) = Self::get_built_in_directive_locations(directive_name) {
                locations
            } else if let Some(custom_directive) = schema.get_custom_directive(directive_name) {
                &custom_directive.locations[..]
            } else {
                // Directive not found - this is handled by DirectivesAreDefined rule
                continue;
            };

            if !allowed_locations.contains(&current_location) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!(
                            "Directive '@{}' is not allowed in location '{:?}'",
                            directive_name, current_location
                        ),
                    },
                    location: Some(Location::empty()),
                });
            }
        }
    }
}

impl<'a> Visitor<'a, ValidationContext<'a>> for DirectivesAreInValidLocations {
    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        let location = match operation.operation_type {
            OperationType::Query => DirectiveLocation::Query,
            OperationType::Mutation => DirectiveLocation::Mutation,
            OperationType::Subscription => DirectiveLocation::Subscription,
        };
        self.validate_directives(ctx, &operation.directives, location);
        Control::Next
    }

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a>, field: &Field<'a>) -> Control {
        self.validate_directives(ctx, &field.directives, DirectiveLocation::Field);
        Control::Next
    }

    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        self.validate_directives(ctx, &fragment.directives, DirectiveLocation::FragmentDefinition);
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.validate_directives(ctx, &fragment_spread.directives, DirectiveLocation::FragmentSpread);
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.validate_directives(ctx, &inline_fragment.directives, DirectiveLocation::InlineFragment);
        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        self.validate_directives(ctx, &var_def.directives, DirectiveLocation::VariableDefinition);
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for DirectivesAreInValidLocations {}

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
        let mut rule = DirectivesAreInValidLocations;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                for selection in op.selection_set.selections.iter() {
                    match selection {
                        Selection::Field(field) => {
                            rule.enter_field(&mut ctx, field);
                        }
                        Selection::InlineFragment(inline_frag) => {
                            rule.enter_inline_fragment(&mut ctx, inline_frag);
                        }
                        _ => {}
                    }
                }
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_skip_directive_on_field() {
        assert_eq!(
            validate("query Q($condition: Boolean!) { field @skip(if: $condition) }"),
            0
        );
    }

    #[test]
    fn test_include_directive_on_inline_fragment() {
        assert_eq!(
            validate("query Q($condition: Boolean!) { ... @include(if: $condition) { field } }"),
            0
        );
    }

    #[test]
    fn test_directive_on_query_operation() {
        assert_eq!(validate("query Q { field }"), 0);
    }

    #[test]
    fn test_deprecated_directive_on_field_invalid() {
        assert!(validate("query Q { field @deprecated }") > 0);
    }

    #[test]
    fn test_specified_by_directive_on_field_invalid() {
        assert!(validate("query Q { field @specifiedBy(url: \"http://example.com\") }") > 0);
    }
}
