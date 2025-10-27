#[macro_export]
macro_rules! transform_test {
    ($arena:ident, $document:ident, $transformed:ident, $schema_index:ident, $doc_index:ident, {
        schema_source: $schema:expr,
        document_source: $query:expr
    }) => {
        use $crate::arena::Arena;
        use $crate::graphql::parser::Parser;
        use $crate::schema::{DocumentIndex, SchemaBuilder};
        use $crate::source::Source;
        use $crate::transformation::pipeline::transform_document;

        let $arena = Arena::new();

        let schema_source = Source::ephemeral($schema);
        let schema_doc = Parser::new(&$arena).with_source(&schema_source).parse().unwrap();
        let mut schema_builder = SchemaBuilder::new(&$arena);
        schema_builder.add_document(&schema_doc).unwrap();
        let $schema_index = schema_builder.build();

        let doc_source = Source::ephemeral($query);
        let $document = Parser::new(&$arena).with_source(&doc_source).parse().unwrap();
        let mut $doc_index = DocumentIndex::new();
        $doc_index.add_document(&$document).unwrap();

        let $transformed = transform_document(&$arena, &$document, &$schema_index);
    };
}
