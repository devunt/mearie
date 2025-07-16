use bumpalo::{Bump, collections::Vec};

pub struct GraphQLContext {
    alloc: Bump,
}

impl GraphQLContext {
    #[inline]
    pub fn new() -> Self {
        Self { alloc: Bump::new() }
    }

    #[inline]
    pub fn alloc<T>(&self, item: T) -> &T {
        self.alloc.alloc(item)
    }

    #[inline]
    pub fn alloc_vec<T>(&self) -> Vec<'_, T> {
        Vec::new_in(&self.alloc)
    }

    #[inline]
    pub(crate) fn allocator(&self) -> &Bump {
        &self.alloc
    }
}

impl Default for GraphQLContext {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}
