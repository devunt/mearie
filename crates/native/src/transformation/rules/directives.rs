use crate::graphql::ast::*;
use crate::transformation::clone;
use crate::transformation::context::TransformContext;
use crate::transformation::transformer::Transformer;

/// Removes @required directives from fields.
///
/// Always applies:
/// - Removes `@required` directives from all fields
#[derive(Default)]
pub struct DirectiveRules;

impl DirectiveRules {
    pub fn new() -> Self {
        Self
    }
}

impl<'a> Transformer<'a> for DirectiveRules {
    fn transform_directive(&mut self, ctx: &mut TransformContext<'a>, dir: &Directive<'a>) -> Option<Directive<'a>> {
        if dir.name.as_str() == "required" {
            None
        } else {
            Some(clone::clone_directive(ctx.arena(), dir))
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::transform_test;

    #[test]
    fn test_remove_required_directive() {
        let schema = r#"
            type Query { user: User }
            type User { name: String }
        "#;
        let query = r#"query { user { name @required } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        let name_field = user_field
            .selection_set
            .fields()
            .find(|f| f.name.as_str() == "name")
            .unwrap();
        assert!(!name_field.directives.iter().any(|d| d.name.as_str() == "required"));
    }

    #[test]
    fn test_preserve_other_directives() {
        let schema = r#"
            type Query { user: User }
            type User { name: String }
        "#;
        let query = r#"query { user { name @include(if: true) @required } }"#;

        transform_test!(_arena, _document, transformed, _schema_index, _doc_index, {
            schema_source: schema,
            document_source: query
        });

        let op = transformed.operations().next().unwrap();
        let user_field = op.selection_set.fields().next().unwrap();
        let name_field = user_field
            .selection_set
            .fields()
            .find(|f| f.name.as_str() == "name")
            .unwrap();
        assert!(name_field.directives.iter().any(|d| d.name.as_str() == "include"));
        assert!(!name_field.directives.iter().any(|d| d.name.as_str() == "required"));
    }
}
