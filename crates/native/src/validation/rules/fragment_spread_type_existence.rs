/// Validates that fragment type conditions reference types that exist in the schema.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Fragment-Spread-Type-Existence
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct FragmentSpreadTypeExistence;

impl<'a> Visitor<'a, ValidationContext<'a>> for FragmentSpreadTypeExistence {
    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a>, fragment: &FragmentDefinition<'a>) -> Control {
        let schema = ctx.schema();

        let type_name = fragment.type_condition.as_str();

        if !schema.has_type(type_name) {
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: format!(
                        "Fragment '{}' is defined on type '{}', which does not exist in the schema",
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

            if !schema.has_type(type_name) {
                ctx.add_error(MearieError {
                    kind: ErrorKind::ValidationError {
                        message: format!(
                            "Inline fragment is defined on type '{}', which does not exist in the schema",
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

impl<'a> ValidationRule<'a> for FragmentSpreadTypeExistence {}

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

    fn validate_with_schema(schema_src: &str, source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let schema_binding = parse_source(schema_src);
        let schema_doc = Document::parse(&gql_ctx, &schema_binding).unwrap();
        let schema = TestSchema::from_document(schema_doc);
        let source_binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &source_binding).unwrap();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = FragmentSpreadTypeExistence;

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

    fn validate(source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = FragmentSpreadTypeExistence;

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def
                && let Some(Selection::Field(field)) = op.selection_set.selections.first()
                && let Some(Selection::InlineFragment(inline_frag)) = field.selection_set.selections.first()
            {
                rule.enter_inline_fragment(&mut ctx, inline_frag);
            }
        }

        ctx.errors().len()
    }

    #[test]
    fn test_fragment_on_valid_type() {
        assert_eq!(
            validate_with_schema(
                "type User { id: ID! name: String! }",
                "fragment UserFields on User { id name }"
            ),
            0
        );
    }

    #[test]
    fn test_inline_fragment_without_type_condition() {
        assert_eq!(validate("query Q { user { ... { id } } }"), 0);
    }

    #[test]
    fn test_inline_fragment_with_type_condition() {
        assert_eq!(
            validate_with_schema("type User { id: ID! }", "query Q { user { ... on User { id } } }"),
            0
        );
    }

    #[test]
    fn test_fragment_on_nonexistent_type() {
        assert!(validate_with_schema("type User { id: ID! }", "fragment Frag on NonExistentType { id }") > 0);
    }

    #[test]
    fn test_inline_fragment_on_nonexistent_type() {
        assert!(validate("query Q { user { ... on NonExistentType { id } } }") > 0);
    }
}
