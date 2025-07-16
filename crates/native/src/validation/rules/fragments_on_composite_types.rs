/// Validates that fragments are only used on composite types (objects, interfaces, unions).
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragments-On-Composite-Types
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FragmentsOnCompositeTypes;

impl<'a> Visitor<'a, ValidationContext<'a>> for FragmentsOnCompositeTypes {
    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        let schema = ctx.schema();

        let type_name = fragment.type_condition.as_str();

        if schema.has_type(type_name) && !schema.is_composite_type(type_name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!(
                        "Fragment '{}' cannot be defined on non-composite type '{}'. Fragments can only be defined on object, interface, or union types.",
                        fragment.name.as_str(),
                        type_name
                    ),
                },
                location: Some(ctx.location_from_span(fragment.span)),
            });
        }

        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        let schema = ctx.schema();

        if let Some(type_condition) = &inline_fragment.type_condition {
            let type_name = type_condition.as_str();

            if schema.has_type(type_name) && !schema.is_composite_type(type_name) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!(
                            "Inline fragment cannot be defined on non-composite type '{}'. Fragments can only be defined on object, interface, or union types.",
                            type_name
                        ),
                    },
                    location: Some(ctx.location_from_span(inline_fragment.span)),
                });
            }
        }

        Control::Next
    }
}

impl<'a> ValidationRule<'a> for FragmentsOnCompositeTypes {}

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
        let mut rule = FragmentsOnCompositeTypes;

        for def in doc.definitions.iter() {
            match def {
                Definition::Executable(ExecutableDefinition::Fragment(frag)) => {
                    rule.enter_fragment(&mut ctx, frag);
                }
                Definition::Executable(ExecutableDefinition::Operation(op)) => {
                    if let Some(Selection::Field(field)) = op.selection_set.selections.first()
                        && let Some(Selection::InlineFragment(inline_frag)) = field.selection_set.selections.first()
                    {
                        rule.enter_inline_fragment(&mut ctx, inline_frag);
                    }
                }
                _ => {}
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_fragment_on_object_type() {
        assert_eq!(validate("fragment UserFields on User { id name }"), 0);
    }

    #[test]
    fn test_inline_fragment_on_object_type() {
        assert_eq!(validate("query Q { user { ... on User { id } } }"), 0);
    }

    #[test]
    fn test_query_without_fragments() {
        assert_eq!(validate("query Q { user { id name } }"), 0);
    }

    fn validate_with_schema(schema_src: &str, source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let schema_binding = parse_source(schema_src);
        let schema_doc = Document::parse(&gql_ctx, &schema_binding).unwrap();
        let schema = TestSchema::from_document(schema_doc);
        let source_binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &source_binding).unwrap();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = FragmentsOnCompositeTypes;

        for def in doc.definitions.iter() {
            match def {
                Definition::Executable(ExecutableDefinition::Fragment(frag)) => {
                    rule.enter_fragment(&mut ctx, frag);
                }
                Definition::Executable(ExecutableDefinition::Operation(op)) => {
                    if let Some(Selection::Field(field)) = op.selection_set.selections.first()
                        && let Some(Selection::InlineFragment(inline_frag)) = field.selection_set.selections.first()
                    {
                        rule.enter_inline_fragment(&mut ctx, inline_frag);
                    }
                }
                _ => {}
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_fragment_on_scalar_type() {
        assert!(
            validate_with_schema(
                "scalar CustomScalar",
                "fragment ScalarFragment on CustomScalar { field }"
            ) > 0
        );
    }

    #[test]
    fn test_inline_fragment_on_enum_type() {
        assert!(
            validate_with_schema(
                "enum Status { ACTIVE INACTIVE }",
                "query Q { user { ... on Status { field } } }"
            ) > 0
        );
    }
}
