use super::context::TransformContext;
use super::rules::{DirectiveRules, FragmentArgumentRules, SelectionRules};
use super::transformer::Transformer;
use crate::arena::Arena;
use crate::graphql::ast::Document;
use crate::schema::SchemaIndex;

/// Transforms a document by applying all transformation rules.
///
/// Transformation order:
/// 1. DirectiveRules - Removes @required directives
/// 2. FragmentArgumentRules - Strips fragment variable definitions and spread arguments
/// 3. SelectionRules - Adds __typename and id fields
///
/// Returns the transformed document allocated in the same arena.
pub fn transform_document<'a>(
    arena: &'a Arena,
    document: &'a Document<'a>,
    schema: &'a SchemaIndex<'a>,
) -> &'a Document<'a> {
    let mut ctx = TransformContext::new(arena, schema);

    let mut directive_rules = DirectiveRules::new();
    let doc = directive_rules
        .transform_document(&mut ctx, document)
        .expect("Document transformation should not filter out document");

    let mut fragment_argument_rules = FragmentArgumentRules::new();
    let doc = fragment_argument_rules
        .transform_document(&mut ctx, doc)
        .expect("Document transformation should not filter out document");

    let mut selection_rules = SelectionRules::new();
    selection_rules
        .transform_document(&mut ctx, doc)
        .expect("Document transformation should not filter out document")
}
