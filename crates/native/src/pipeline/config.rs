use rustc_hash::FxHashMap;

#[derive(Debug, Clone, Default)]
pub struct PipelineConfig {
    pub scalar_map: FxHashMap<String, String>,
}

impl PipelineConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_scalar_map(mut self, scalar_map: FxHashMap<String, String>) -> Self {
        self.scalar_map = scalar_map;
        self
    }
}
