use super::context::{SchemaProvider, ValidationContext};
use super::visitor::{VisitNode, Visitor};
use crate::ast::Document;
use crate::error::MearieError;

pub trait ValidationRule<'a>: Visitor<'a, ValidationContext<'a>> + Default {
    fn validate(schema: &'a dyn SchemaProvider<'a>, document: &'a Document<'a>) -> Result<(), MearieError> {
        let mut ctx = ValidationContext::new(schema, document.source);
        let mut rule = Self::default();
        document.visit(&mut ctx, &mut rule);
        ctx.to_result(())
    }

    fn validate_all(schema: &'a dyn SchemaProvider<'a>, document: &'a Document<'a>) -> Result<(), Vec<MearieError>> {
        let mut ctx = ValidationContext::new(schema, document.source);
        let mut rule = Self::default();
        document.visit(&mut ctx, &mut rule);
        ctx.to_result_all(())
    }
}

pub trait ValidateNode<'a> {
    fn validate<R: ValidationRule<'a>>(&'a self, schema: &'a dyn SchemaProvider<'a>) -> Result<(), MearieError>;
}

impl<'a> ValidateNode<'a> for Document<'a> {
    fn validate<R: ValidationRule<'a>>(&'a self, schema: &'a dyn SchemaProvider<'a>) -> Result<(), MearieError> {
        R::validate(schema, self)
    }
}
