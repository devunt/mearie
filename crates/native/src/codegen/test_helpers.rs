#[macro_export]
macro_rules! setup_codegen {
    ($schema_code:expr, $document_code:expr) => {{
        use $crate::arena::Arena;
        use $crate::graphql::parser::Parser;
        use $crate::pipeline::PipelineConfig;
        use $crate::schema::{DocumentIndex, SchemaBuilder};
        use $crate::source::Source;

        let arena = Box::leak(Box::new(Arena::new()));

        let mut schema_builder = SchemaBuilder::new();

        let built_in_source = Box::leak(Box::new(Source::ephemeral($crate::schema::BUILTIN_SCHEMA)));
        let built_in_doc = Parser::new(arena).with_source(built_in_source).parse().unwrap();
        schema_builder.add_document(built_in_doc).unwrap();

        let schema_source = Box::leak(Box::new(Source::ephemeral($schema_code)));
        let schema_document = Parser::new(arena).with_source(schema_source).parse().unwrap();
        schema_builder.add_document(schema_document).unwrap();
        let schema_index = schema_builder.build();

        let operations_source = Box::leak(Box::new(Source::ephemeral($document_code)));
        let operations_document = Parser::new(arena).with_source(operations_source).parse().unwrap();

        let mut document_index = DocumentIndex::new();
        document_index.add_document(operations_document).unwrap();

        let ctx = $crate::codegen::CodegenContext::new(PipelineConfig::default());
        (ctx, schema_index, document_index)
    }};
}
