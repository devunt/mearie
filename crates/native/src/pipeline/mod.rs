pub mod builder;
pub mod config;

pub use builder::PipelineBuilder;
pub use config::PipelineConfig;

use crate::arena::Arena;
use crate::codegen::{CodegenContext, Generator};
use crate::error::MearieError;
use crate::graphql::parser::Parser;
use crate::schema::{DocumentIndex, SchemaBuilder};
use crate::source::{Source, SourceBuf};
use crate::transformation::transform_document;
use crate::validation::{ValidationContext, Validator, visitor::VisitNode};

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

    /// Process the pipeline: parse, validate, transform, and generate code.
    ///
    /// The pipeline performs the following steps:
    /// 1. Parse all schema documents
    /// 2. Build SchemaIndex
    /// 3. Parse all executable documents
    /// 4. Build DocumentIndex
    /// 5. Validate all documents
    /// 6. Transform documents (add __typename and id fields)
    /// 7. Generate TypeScript code
    ///
    /// # Returns
    ///
    /// Returns `PipelineOutput` containing generated source files and any errors
    /// encountered during processing.
    pub fn process(self) -> PipelineOutput {
        let mut errors = Vec::new();

        let mut schema_builder = SchemaBuilder::new();

        let built_in_source = Source::ephemeral(crate::schema::BUILTIN_SCHEMA);
        if let Err(e) = Parser::new(self.arena)
            .with_source(&built_in_source)
            .parse()
            .and_then(|doc| schema_builder.add_document(doc))
        {
            errors.push(e);
        }

        for source in &self.schemas {
            let document = Parser::new(self.arena).with_source(source).parse();
            if let Err(e) = document.and_then(|doc| schema_builder.add_document(doc)) {
                errors.push(e);
            }
        }

        let schema_index = schema_builder.build();

        let mut document_index = DocumentIndex::new();
        for source in &self.documents {
            let document = Parser::new(self.arena).with_source(source).parse();
            if let Err(e) = document.and_then(|doc| document_index.add_document(doc)) {
                errors.push(e);
            }
        }

        for document in document_index.documents() {
            let mut validator = Validator::default();
            let mut ctx = ValidationContext::new(&schema_index, &document_index, document);
            document.visit(&mut ctx, &mut validator);
            errors.extend(ctx.errors().iter().cloned());
        }

        for document in document_index.documents().collect::<Vec<_>>() {
            let transformed = transform_document(self.arena, document, &schema_index);
            document_index.set_transformed_document(document, transformed);
        }

        let ctx = CodegenContext::new();
        let generator = Generator::new(&ctx, &schema_index, &document_index);
        let sources = generator.generate().unwrap_or_else(|e| {
            errors.push(e);
            Vec::new()
        });

        PipelineOutput { sources, errors }
    }
}
