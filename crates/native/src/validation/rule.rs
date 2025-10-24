use super::context::ValidationContext;
use super::visitor::{VisitNode, Visitor};
use crate::error::MearieError;
use crate::graphql::ast::Document;
use crate::schema::{DocumentIndex, SchemaIndex};
use crate::source::Source;

pub trait ValidationRule<'a, 'b: 'a>: Visitor<'a, ValidationContext<'a, 'b>> + Default {
    fn validate(
        schema: &'a SchemaIndex<'b>,
        document_index: &'a DocumentIndex<'b>,
        document: &'a Document<'a>,
        source: Source<'a>,
    ) -> Result<(), MearieError> {
        let mut ctx = ValidationContext::new(schema, document_index, source);
        let mut rule = Self::default();
        document.visit(&mut ctx, &mut rule);

        let errors = ctx.errors();
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors[0].clone())
        }
    }
}

pub trait ValidateNode<'a, 'b> {
    fn validate<R: ValidationRule<'a, 'b>>(
        &'a self,
        schema: &'a SchemaIndex<'b>,
        document_index: &'a DocumentIndex<'b>,
        source: Source<'a>,
    ) -> Result<(), MearieError>;
}

impl<'a, 'b> ValidateNode<'a, 'b> for Document<'a> {
    fn validate<R: ValidationRule<'a, 'b>>(
        &'a self,
        schema: &'a SchemaIndex<'b>,
        document_index: &'a DocumentIndex<'b>,
        source: Source<'a>,
    ) -> Result<(), MearieError> {
        R::validate(schema, document_index, self, source)
    }
}
