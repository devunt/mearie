#[macro_export]
macro_rules! validate_rules {
    ($rule_type:ty, $schema_code:expr, $document_code:expr) => {{
        use $crate::arena::Arena;
        use $crate::graphql::parser::Parser;
        use $crate::schema::{DocumentIndex, SchemaBuilder};
        use $crate::source::Source;
        use $crate::validation::rule::ValidateNode;

        let arena = Arena::new();

        let schema_source = Source::ephemeral($schema_code);
        let schema_document = Parser::new(&arena).with_source(&schema_source).parse().unwrap();

        let mut schema_builder = SchemaBuilder::new(&arena);
        schema_builder.add_document(schema_document).unwrap();

        let schema_index = schema_builder.build();

        let document_source = Source::ephemeral($document_code);
        let document_document = Parser::new(&arena).with_source(&document_source).parse().unwrap();
        let mut doc_index = DocumentIndex::new();

        match doc_index.add_document(document_document) {
            Ok(_) => document_document.validate::<$rule_type>(&schema_index, &doc_index, document_source.clone()),
            Err(e) => Err(e),
        }
    }};
}
