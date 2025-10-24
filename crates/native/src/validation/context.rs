use crate::error::MearieError;
use crate::error::location::{Location, Span};
use crate::schema::{DocumentIndex, SchemaIndex};
use crate::source::Source;

pub struct ValidationContext<'a, 'b> {
    source: Source<'a>,
    errors: Vec<MearieError>,
    schema: &'a SchemaIndex<'b>,
    document: &'a DocumentIndex<'b>,
}

impl<'a, 'b> ValidationContext<'a, 'b> {
    pub fn new(schema: &'a SchemaIndex<'b>, document: &'a DocumentIndex<'b>, source: Source<'a>) -> Self {
        Self {
            source,
            errors: Vec::new(),
            schema,
            document,
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
    pub fn source(&self) -> &Source<'a> {
        &self.source
    }

    #[inline]
    pub fn add_error(&mut self, message: impl Into<String>, span: Span) {
        self.errors
            .push(MearieError::validation(message).at(Location::from_span(&self.source, span)));
    }

    #[inline]
    pub fn errors(&self) -> &[MearieError] {
        &self.errors
    }
}
