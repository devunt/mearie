mod builder;
mod builtin;
mod document;
mod index;

pub use builder::SchemaBuilder;
pub use builtin::BUILTIN_SCHEMA;
pub use document::DocumentIndex;
pub use index::{SchemaIndex, TypeInfo};

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::arena::Arena;
    use crate::error::location::Span;
    use crate::graphql::ast::*;
    use crate::graphql::parser::Parser;
    use crate::source::Source;

    fn test_source() -> Source<'static> {
        Source {
            code: "",
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_complete_schema_building_workflow() {
        let arena = Arena::new();

        let mut builder = SchemaBuilder::new();
        let built_in_source = Source::ephemeral(BUILTIN_SCHEMA);
        let doc = Parser::new(&arena)
            .with_source(&built_in_source)
            .parse()
            .expect("Built-in SDL should parse");
        builder.add_document(doc).expect("Built-in SDL should load");

        let source_binding = test_source();
        let schema_doc = arena.alloc(Document {
            source: &source_binding,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Interface(InterfaceTypeDefinition {
                    name: TypeName::new(Name::new(arena.intern("Node"))),
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: bumpalo::vec![in arena.allocator(); FieldDefinition {
                        name: FieldName::new(Name::new(arena.intern("id"))),
                        typ: Type::NonNull(arena.alloc(NonNullType::Named(NamedType { name: TypeName::new(Name::new(arena.intern("ID"))),
                        }))),
                        arguments: arena.alloc_vec(),
                        directives: arena.alloc_vec(),
                        description: None,
                    }],
                    description: Some(Description { value: "Node interface for entities" }),
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: TypeName::new(Name::new(arena.intern("User"))),
                    implements: bumpalo::vec![in arena.allocator(); TypeName::new(Name::new(arena.intern("Node")))],
                    directives: arena.alloc_vec(),
                    fields: bumpalo::vec![in arena.allocator();
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("id"))),
                            typ: Type::NonNull(arena.alloc(NonNullType::Named(NamedType { name: TypeName::new(Name::new(arena.intern("ID"))),
                            }))),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        },
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("name"))),
                            typ: Type::NonNull(arena.alloc(NonNullType::Named(NamedType { name: TypeName::new(Name::new(arena.intern("String"))),
                            }))),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        }
                    ],
                    description: Some(Description { value: "User type" }),
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: TypeName::new(Name::new(arena.intern("Post"))),
                    implements: bumpalo::vec![in arena.allocator(); TypeName::new(Name::new(arena.intern("Node")))],
                    directives: arena.alloc_vec(),
                    fields: bumpalo::vec![in arena.allocator();
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("id"))),
                            typ: Type::NonNull(arena.alloc(NonNullType::Named(NamedType { name: TypeName::new(Name::new(arena.intern("ID"))),
                            }))),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        },
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("title"))),
                            typ: Type::NonNull(arena.alloc(NonNullType::Named(NamedType { name: TypeName::new(Name::new(arena.intern("String"))),
                            }))),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        }
                    ],
                    description: Some(Description { value: "Post type" }),
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Union(UnionTypeDefinition {
                    name: TypeName::new(Name::new(arena.intern("SearchResult"))),
                    directives: arena.alloc_vec(),
                    members: bumpalo::vec![in arena.allocator(); TypeName::new(Name::new(arena.intern("User"))), TypeName::new(Name::new(arena.intern("Post")))],
                    description: Some(Description { value: "Search result union" }),
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Scalar(ScalarTypeDefinition {
                    name: TypeName::new(Name::new(arena.intern("DateTime"))),
                    directives: arena.alloc_vec(),
                    description: Some(Description { value: "DateTime scalar" }),
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: TypeName::new(Name::new(arena.intern("Query"))),
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: arena.alloc_vec(),
                    description: Some(Description { value: "Query root" }),
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Schema(SchemaDefinition {
                    description: None,
                    query: Some(TypeName::new(Name::new(arena.intern("Query")))),
                    mutation: None,
                    subscription: None,
                    directives: arena.alloc_vec(),
                })),
            ],
        });

        builder.add_document(schema_doc).unwrap();
        let index = builder.build();

        assert!(index.is_interface("Node"));
        assert!(index.is_object("User"));
        assert!(index.is_object("Post"));
        assert!(index.is_union("SearchResult"));
        assert!(index.is_scalar("DateTime"));

        assert!(index.implements("User", "Node"));
        assert!(index.implements("Post", "Node"));
        assert!(!index.implements("Query", "Node"));

        let node_implementors: Vec<_> = index.get_possible_types("Node").collect();
        assert_eq!(node_implementors.len(), 2);
        assert!(node_implementors.contains(&"User"));
        assert!(node_implementors.contains(&"Post"));

        let union_members: Vec<_> = index.get_possible_types("SearchResult").collect();
        assert_eq!(union_members.len(), 2);
        assert!(union_members.contains(&"User"));
        assert!(union_members.contains(&"Post"));

        assert!(index.get_field("User", "id").is_some());
        assert!(index.get_field("User", "name").is_some());
        assert!(index.get_field("Post", "id").is_some());
        assert!(index.get_field("Post", "title").is_some());
        assert!(index.get_field("Node", "id").is_some());

        let custom_scalars = index.custom_scalars();
        assert_eq!(custom_scalars.len(), 1);
        assert_eq!(custom_scalars[0], "DateTime");

        assert_eq!(index.query_type(), Some("Query"));
        assert_eq!(index.mutation_type(), None);
        assert_eq!(index.subscription_type(), None);
    }

    #[test]
    fn test_document_index_with_fragments_and_operations() {
        let arena = Arena::new();
        let mut doc_index = DocumentIndex::new();

        let source_binding = test_source();
        let doc = arena.alloc(Document {
            source: &source_binding,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: FragmentName::new(Name::new(arena.intern("UserFields"))),
                    type_condition: TypeName::new(Name::new(arena.intern("User"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet {
                        selections: bumpalo::vec![in arena.allocator(); Selection::Field(Field {
                            span: Span::empty(),
                            alias: None,
                            name: FieldName::new(Name::new(arena.intern("id"))),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            selection_set: SelectionSet {
                                selections: arena.alloc_vec(),
                            },
                        })],
                    },
                })),
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Query,
                    name: Some(Name::new(arena.intern("GetUser"))),
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet {
                        selections: bumpalo::vec![in arena.allocator(); Selection::FragmentSpread(FragmentSpread {
                            span: Span::empty(),
                            fragment_name: FragmentName::new(Name::new(arena.intern("UserFields"))),
                            directives: arena.alloc_vec(),
                        })],
                    },
                })),
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Mutation,
                    name: Some(Name::new(arena.intern("CreateUser"))),
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: arena.alloc_vec() },
                })),
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Query,
                    name: None,
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: arena.alloc_vec() },
                })),
            ],
        });

        doc_index.add_document(doc).unwrap();

        assert_eq!(doc_index.fragment_count(), 1);
        assert_eq!(doc_index.operation_count(), 3);

        assert!(doc_index.has_fragment("UserFields"));
        let fragment = doc_index.get_fragment("UserFields").unwrap();
        assert_eq!(fragment.type_condition, "User");

        let get_user = doc_index.get_operation(Some("GetUser")).unwrap();
        assert_eq!(get_user.operation_type, OperationType::Query);

        let create_user = doc_index.get_operation(Some("CreateUser")).unwrap();
        assert_eq!(create_user.operation_type, OperationType::Mutation);

        let anon = doc_index.get_operation(None).unwrap();
        assert!(anon.name.is_none());

        let fragments: Vec<_> = doc_index.fragments().collect();
        assert_eq!(fragments.len(), 1);

        let operations: Vec<_> = doc_index.operations().collect();
        assert_eq!(operations.len(), 3);
    }

    #[test]
    fn test_schema_and_document_separation() {
        let arena = Arena::new();

        let mut schema_builder = SchemaBuilder::new();
        let built_in_source = Source::ephemeral(BUILTIN_SCHEMA);
        let doc = Parser::new(&arena)
            .with_source(&built_in_source)
            .parse()
            .expect("Built-in SDL should parse");
        schema_builder.add_document(doc).expect("Built-in SDL should load");

        let mut doc_index = DocumentIndex::new();

        let source_binding1 = test_source();
        let schema_doc = arena.alloc(Document {
            source: &source_binding1,
            definitions: bumpalo::vec![in arena.allocator(); Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                name: TypeName::new(Name::new(arena.intern("User"))),
                implements: arena.alloc_vec(),
                directives: arena.alloc_vec(),
                fields: arena.alloc_vec(),
                description: None,
            })))],
        });

        let source_binding2 = test_source();
        let query_doc = arena.alloc(Document {
            source: &source_binding2,
            definitions: bumpalo::vec![in arena.allocator(); Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                span: Span::empty(),
                name: FragmentName::new(Name::new(arena.intern("UserFields"))),
                type_condition: TypeName::new(Name::new(arena.intern("User"))),
                directives: arena.alloc_vec(),
                selection_set: SelectionSet { selections: arena.alloc_vec() },
            }))],
        });

        schema_builder.add_document(schema_doc).unwrap();
        doc_index.add_document(query_doc).unwrap();

        let schema_index = schema_builder.build();

        assert!(schema_index.is_object("User"));
        assert_eq!(schema_index.query_type(), None);

        assert!(doc_index.has_fragment("UserFields"));
        assert_eq!(doc_index.fragment_count(), 1);
        assert_eq!(doc_index.operation_count(), 0);
    }
}
