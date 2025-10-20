use crate::ast::Document;
use crate::codegen::{Builder, CodegenContext, Registry};
use crate::extractor::extract_graphql_sources;
use crate::parser::GraphQLContext;
use crate::parser::parse::ParseNode;
use crate::span::{Source, SourceOwned};
use napi_derive::napi;
use serde::Serialize;

#[napi(object)]
#[derive(Serialize)]
pub struct ExtractGraphQLSourcesResult {
    pub sources: Vec<SourceOwned>,
    #[napi(ts_type = "unknown[]")]
    pub errors: serde_json::Value,
}

#[napi(object)]
#[derive(Serialize)]
pub struct GenerateCodeResult {
    pub sources: Vec<SourceOwned>,
    #[napi(ts_type = "unknown[]")]
    pub errors: serde_json::Value,
}

#[napi(js_name = "extractGraphQLSources")]
pub fn napi_extract_graphql_sources(source: SourceOwned) -> ExtractGraphQLSourcesResult {
    let result = extract_graphql_sources(source);
    ExtractGraphQLSourcesResult {
        sources: result.sources,
        errors: serde_json::to_value(&result.errors).unwrap_or(serde_json::Value::Array(vec![])),
    }
}

#[napi(js_name = "generateCode")]
pub fn napi_generate_code(schemas: Vec<SourceOwned>, documents: Vec<SourceOwned>) -> GenerateCodeResult {
    let schemas = schemas.iter().map(|source| source.into()).collect::<Vec<Source>>();
    let documents = documents.iter().map(|source| source.into()).collect::<Vec<Source>>();

    let mut errors = Vec::new();

    let ctx = GraphQLContext::new();
    let mut registry = Registry::new();

    for source in schemas.iter() {
        match Document::parse(&ctx, source) {
            Ok(document) => {
                registry.load_schema(document);
            }
            Err(e) => {
                errors.push(e);
            }
        }
    }

    let mut parsed_documents = Vec::new();
    for source in documents.iter() {
        match Document::parse(&ctx, source) {
            Ok(document) => {
                parsed_documents.push(document);
            }
            Err(e) => {
                errors.push(e);
            }
        }
    }

    for document in parsed_documents.iter() {
        registry.register_fragments(document);
    }

    for document in parsed_documents.iter() {
        if let Err(validation_errors) = registry.validate_and_load_document(*document) {
            errors.extend(validation_errors);
        }
    }

    let ctx = CodegenContext::new();
    let builder = Builder::new(&ctx, &registry);
    let sources = match builder.generate() {
        Ok(files) => files,
        Err(e) => {
            errors.push(e);
            Vec::new()
        }
    };

    GenerateCodeResult {
        sources,
        errors: serde_json::to_value(&errors).unwrap_or(serde_json::Value::Array(vec![])),
    }
}
