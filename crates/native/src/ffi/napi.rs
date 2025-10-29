use crate::arena::Arena;
use crate::extraction::extract_graphql_sources;
use crate::pipeline::{Pipeline, PipelineConfig};
use crate::source::{Source, SourceBuf};
use napi_derive::napi;
use rustc_hash::FxHashMap;
use serde::Serialize;
use std::collections::HashMap;

#[napi(object)]
#[derive(Serialize)]
pub struct ExtractGraphQLSourcesResult {
    pub sources: Vec<SourceBuf>,
    #[napi(ts_type = "unknown[]")]
    pub errors: serde_json::Value,
}

#[napi(object)]
#[derive(Serialize)]
pub struct GenerateCodeResult {
    pub sources: Vec<SourceBuf>,
    #[napi(ts_type = "unknown[]")]
    pub errors: serde_json::Value,
}

#[napi(object)]
pub struct GenerateCodeConfig {
    pub scalars: Option<HashMap<String, String>>,
}

#[napi(js_name = "extractGraphQLSources")]
pub fn napi_extract_graphql_sources(source: SourceBuf) -> ExtractGraphQLSourcesResult {
    let result = extract_graphql_sources(source);
    ExtractGraphQLSourcesResult {
        sources: result.sources,
        errors: serde_json::to_value(&result.errors).unwrap_or(serde_json::Value::Array(vec![])),
    }
}

#[napi(js_name = "generateCode")]
pub fn napi_generate_code(
    schemas: Vec<SourceBuf>,
    documents: Vec<SourceBuf>,
    config: Option<GenerateCodeConfig>,
) -> GenerateCodeResult {
    let schemas = schemas.iter().map(|source| source.into()).collect::<Vec<Source>>();
    let documents = documents.iter().map(|source| source.into()).collect::<Vec<Source>>();

    let pipeline_config = config
        .and_then(|c| c.scalars)
        .map(|scalars| {
            let scalar_map: FxHashMap<String, String> = scalars.into_iter().collect();
            PipelineConfig::new().with_scalar_map(scalar_map)
        })
        .unwrap_or_default();

    let arena = Arena::new();

    let mut pipeline_builder = Pipeline::builder(&arena);

    for schema in schemas {
        pipeline_builder = pipeline_builder.with_schema(schema);
    }

    for document in documents {
        pipeline_builder = pipeline_builder.with_document(document);
    }

    let pipeline = pipeline_builder.with_config(pipeline_config).build();
    let output = pipeline.process();

    GenerateCodeResult {
        sources: output.sources,
        errors: serde_json::to_value(&output.errors).unwrap_or(serde_json::Value::Array(vec![])),
    }
}
