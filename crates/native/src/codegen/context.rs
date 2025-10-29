use crate::pipeline::PipelineConfig;
use oxc_allocator::Allocator;
use oxc_ast::AstBuilder;

pub struct CodegenContext {
    alloc: Allocator,
    config: PipelineConfig,
}

impl CodegenContext {
    #[inline]
    pub fn new(config: PipelineConfig) -> Self {
        Self {
            alloc: Allocator::default(),
            config,
        }
    }

    #[inline]
    pub fn ast(&self) -> AstBuilder<'_> {
        AstBuilder::new(&self.alloc)
    }

    #[inline]
    pub fn config(&self) -> &PipelineConfig {
        &self.config
    }
}

impl Default for CodegenContext {
    fn default() -> Self {
        Self::new(PipelineConfig::default())
    }
}
