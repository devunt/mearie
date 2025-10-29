use crate::arena::Arena;
use crate::schema::SchemaIndex;

/// Context passed to all transformation methods.
///
/// Provides access to:
/// - Arena for allocating new nodes
/// - Schema index for type lookups
pub struct TransformContext<'a> {
    arena: &'a Arena,
    schema: &'a SchemaIndex<'a>,
}

impl<'a> TransformContext<'a> {
    pub fn new(arena: &'a Arena, schema: &'a SchemaIndex<'a>) -> Self {
        Self { arena, schema }
    }

    pub fn arena(&self) -> &'a Arena {
        self.arena
    }

    pub fn schema(&self) -> &'a SchemaIndex<'a> {
        self.schema
    }
}
