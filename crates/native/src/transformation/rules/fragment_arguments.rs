use crate::graphql::ast::*;
use crate::transformation::context::TransformContext;
use crate::transformation::transformer::Transformer;

/// Strips fragment variable definitions and spread arguments from the AST.
///
/// Fragment arguments are a client-only feature: they are validated and used
/// for codegen (runtime selections, type generation), but must be compiled away
/// from the operation body sent to the server.
///
/// This rule:
/// - Removes `variable_definitions` from `FragmentDefinition`
/// - Removes `arguments` from `FragmentSpread`
#[derive(Default)]
pub struct FragmentArgumentRules;

impl FragmentArgumentRules {
    pub fn new() -> Self {
        Self
    }
}

impl<'a> Transformer<'a> for FragmentArgumentRules {
    fn transform_fragment(
        &mut self,
        ctx: &mut TransformContext<'a>,
        frag: &FragmentDefinition<'a>,
    ) -> Option<FragmentDefinition<'a>> {
        let arena = ctx.arena();

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &frag.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(FragmentDefinition {
            span: frag.span,
            name: frag.name,
            variable_definitions: bumpalo::vec![in arena.allocator();],
            type_condition: frag.type_condition,
            directives,
            selection_set: self.transform_selection_set(ctx, &frag.selection_set, frag.type_condition.as_str())?,
        })
    }

    fn transform_fragment_spread(
        &mut self,
        ctx: &mut TransformContext<'a>,
        spread: &FragmentSpread<'a>,
    ) -> Option<FragmentSpread<'a>> {
        let arena = ctx.arena();

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &spread.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(FragmentSpread {
            span: spread.span,
            fragment_name: spread.fragment_name,
            arguments: bumpalo::vec![in arena.allocator();],
            directives,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::transform_test;

    #[test]
    fn test_strip_fragment_variable_definitions() {
        let schema = r#"
            type Query { user: User }
            type User { profilePic(size: Int): String }
        "#;
        let query = r#"
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let frag = transformed.fragments().next().unwrap();
        assert!(frag.variable_definitions.is_empty());
    }

    #[test]
    fn test_strip_fragment_spread_arguments() {
        let schema = r#"
            type Query { user: User }
            type User { profilePic(size: Int): String }
        "#;
        let query = r#"
            query GetUser {
                user {
                    ...Avatar(size: 100)
                }
            }
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        let spread = user_field
            .selection_set
            .selections
            .iter()
            .find_map(|s| match s {
                crate::graphql::ast::Selection::FragmentSpread(s) => Some(s),
                _ => None,
            })
            .unwrap();
        assert!(spread.arguments.is_empty());
    }

    #[test]
    fn test_preserve_field_arguments() {
        let schema = r#"
            type Query { user: User }
            type User { profilePic(size: Int): String }
        "#;
        let query = r#"
            fragment Avatar($size: Int! = 50) on User {
                profilePic(size: $size)
            }
        "#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let frag = transformed.fragments().next().unwrap();
        let field = frag
            .selection_set
            .fields()
            .find(|f| f.name.as_str() == "profilePic")
            .unwrap();
        assert!(!field.arguments.is_empty());
    }
}
