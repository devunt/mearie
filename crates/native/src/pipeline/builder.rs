use super::{Pipeline, PipelineConfig};
use crate::arena::Arena;
use crate::source::Source;

pub struct PipelineBuilder<'a> {
    arena: &'a Arena,
    schemas: Vec<Source<'a>>,
    documents: Vec<Source<'a>>,
    config: PipelineConfig,
}

impl<'a> PipelineBuilder<'a> {
    pub fn new(arena: &'a Arena) -> Self {
        Self {
            arena,
            schemas: Vec::new(),
            documents: Vec::new(),
            config: PipelineConfig::default(),
        }
    }

    pub fn with_schema(mut self, source: Source<'a>) -> Self {
        self.schemas.push(source);
        self
    }

    pub fn with_schemas(mut self, sources: Vec<Source<'a>>) -> Self {
        self.schemas.extend(sources);
        self
    }

    pub fn with_document(mut self, source: Source<'a>) -> Self {
        self.documents.push(source);
        self
    }

    pub fn with_documents(mut self, sources: Vec<Source<'a>>) -> Self {
        self.documents.extend(sources);
        self
    }

    pub fn with_config(mut self, config: PipelineConfig) -> Self {
        self.config = config;
        self
    }

    pub fn build(self) -> Pipeline<'a> {
        Pipeline::new(self.arena, self.schemas, self.documents, self.config)
    }
}
