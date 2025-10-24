pub mod builder;
pub mod config;

pub use builder::PipelineBuilder;
pub use config::PipelineConfig;

use crate::arena::Arena;
use crate::codegen::{Builder as CodegenBuilder, CodegenContext};
use crate::error::MearieError;
use crate::graphql::parser::Parser;
use crate::schema::{DocumentIndex, SchemaBuilder};
use crate::source::{Source, SourceBuf};
use crate::validation::Validator;
use crate::validation::visitor::VisitNode;

pub struct Pipeline<'a> {
    arena: &'a Arena,
    schemas: Vec<Source<'a>>,
    documents: Vec<Source<'a>>,
    #[allow(dead_code)]
    config: PipelineConfig,
}

/// Output from the pipeline processing.
///
/// The pipeline always performs full processing (parsing, validation, and
/// code generation). The output contains generated code files and any errors
/// encountered during processing.
pub struct PipelineOutput {
    /// Generated source files (types.d.ts, graphql.d.ts, graphql.js)
    pub sources: Vec<SourceBuf>,
    /// Errors encountered during parsing, validation, or code generation
    pub errors: Vec<MearieError>,
}

impl<'a> Pipeline<'a> {
    pub fn builder(arena: &'a Arena) -> PipelineBuilder<'a> {
        PipelineBuilder::new(arena)
    }

    pub(crate) fn new(
        arena: &'a Arena,
        schemas: Vec<Source<'a>>,
        documents: Vec<Source<'a>>,
        config: PipelineConfig,
    ) -> Self {
        Self {
            arena,
            schemas,
            documents,
            config,
        }
    }

    /// Process the pipeline: parse, validate, and generate code.
    ///
    /// The pipeline performs the following steps:
    /// 1. Parse all schema documents
    /// 2. Build SchemaIndex
    /// 3. Parse all executable documents
    /// 4. Build DocumentIndex
    /// 5. Validate all documents
    /// 6. Generate TypeScript code
    ///
    /// # Returns
    ///
    /// Returns `PipelineOutput` containing generated source files and any errors
    /// encountered during processing.
    pub fn process(self) -> PipelineOutput {
        let mut errors = Vec::new();

        // Step 1-2: Parse schema documents and build SchemaIndex
        let mut schema_builder = SchemaBuilder::new(self.arena);
        for schema_source in &self.schemas {
            match Parser::new(self.arena).with_source(schema_source).parse() {
                Ok(document) => {
                    if let Err(e) = schema_builder.add_document(document) {
                        errors.push(e);
                    }
                }
                Err(e) => {
                    errors.push(e);
                }
            }
        }
        let schema_index = schema_builder.build();

        // Step 3-4: Parse executable documents and build DocumentIndex
        let mut document_index = DocumentIndex::new();
        for doc_source in &self.documents {
            match Parser::new(self.arena).with_source(doc_source).parse() {
                Ok(document) => {
                    if let Err(e) = document_index.add_document_with_source(document, doc_source.clone()) {
                        errors.push(e);
                    }
                }
                Err(e) => {
                    errors.push(e);
                }
            }
        }

        // Step 5: Validate all documents
        for doc in &self.documents {
            match Parser::new(self.arena).with_source(doc).parse() {
                Ok(parsed_doc) => {
                    let mut validator = Validator::default();
                    let mut ctx =
                        crate::validation::ValidationContext::new(&schema_index, &document_index, doc.clone());
                    parsed_doc.visit(&mut ctx, &mut validator);
                    errors.extend(ctx.errors().iter().cloned());
                }
                Err(e) => {
                    errors.push(e);
                }
            }
        }

        // Step 6: Generate code
        let sources = if errors.is_empty() {
            let ctx = CodegenContext::new();
            let builder = CodegenBuilder::new(&ctx, &schema_index, &document_index);
            match builder.generate() {
                Ok(generated_sources) => generated_sources,
                Err(e) => {
                    errors.push(e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        PipelineOutput { sources, errors }
    }
}
