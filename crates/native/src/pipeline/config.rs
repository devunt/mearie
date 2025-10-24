/// Configuration for the pipeline.
///
/// The pipeline is stateless and always performs full processing:
/// parsing, validation, and code generation. There are no configuration
/// options at this time.
#[derive(Debug, Clone, Default)]
pub struct PipelineConfig {
    // Reserved for future configuration options
}

impl PipelineConfig {
    pub fn new() -> Self {
        Self::default()
    }
}
