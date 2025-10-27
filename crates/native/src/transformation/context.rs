use crate::arena::Arena;
use crate::schema::{DocumentIndex, SchemaIndex};

/// Context passed to all transformation methods.
///
/// Provides access to:
/// - Arena for allocating new nodes
/// - Schema index for type lookups
/// - Document index for fragment lookups
pub struct TransformContext<'a> {
    arena: &'a Arena,
    schema: &'a SchemaIndex<'a>,
    document: &'a DocumentIndex<'a>,
}

impl<'a> TransformContext<'a> {
    pub fn new(arena: &'a Arena, schema: &'a SchemaIndex<'a>, document: &'a DocumentIndex<'a>) -> Self {
        Self {
            arena,
            schema,
            document,
        }
    }

    pub fn arena(&self) -> &'a Arena {
        self.arena
    }

    pub fn schema(&self) -> &'a SchemaIndex<'a> {
        self.schema
    }

    pub fn document(&self) -> &'a DocumentIndex<'a> {
        self.document
    }
}
