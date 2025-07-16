use oxc_allocator::Allocator;
use oxc_ast::AstBuilder;

pub struct CodegenContext {
    alloc: Allocator,
}

impl CodegenContext {
    #[inline]
    pub fn new() -> Self {
        Self {
            alloc: Allocator::default(),
        }
    }

    #[inline]
    pub fn allocator(&self) -> &Allocator {
        &self.alloc
    }

    #[inline]
    pub fn ast(&self) -> AstBuilder<'_> {
        AstBuilder::new(&self.alloc)
    }
}

impl Default for CodegenContext {
    fn default() -> Self {
        Self::new()
    }
}
