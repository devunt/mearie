use crate::error::MearieError;
use crate::error::location::{Location, Span};
use crate::graphql::ast::Document;
use crate::schema::{DocumentIndex, SchemaIndex};

pub struct ValidationContext<'a, 'b> {
    errors: Vec<MearieError>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
    target: &'a Document<'a>,
}

impl<'a, 'b> ValidationContext<'a, 'b> {
    pub fn new(schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>, target: &'a Document<'a>) -> Self {
        Self {
            errors: Vec::new(),
            schema,
            document,
            target,
        }
    }

    #[inline]
    pub fn schema(&self) -> &'a SchemaIndex<'b> {
        self.schema
    }

    #[inline]
    pub fn document(&self) -> &'a DocumentIndex<'b> {
        self.document
    }

    #[inline]
    pub fn add_error(&mut self, message: impl Into<String>, span: Span) {
        self.errors
            .push(MearieError::validation(message).at(Location::from_span(self.target.source, span)));
    }

    #[inline]
    pub fn errors(&self) -> &[MearieError] {
        &self.errors
    }
}
