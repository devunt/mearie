use crate::error::{MearieError, Result};
use crate::graphql::ast::*;
use rustc_hash::FxHashMap;

/// Fast O(1) index for GraphQL fragments and operations.
///
/// `DocumentIndex` manages executable document elements (fragments and operations)
/// separately from schema types. Provides constant-time lookups for both.
///
/// # Design
///
/// - **Separate from Schema**: Only handles fragments and operations, not type definitions
/// - **O(1) Fragment Lookup**: Hash map for instant fragment access
/// - **O(1) Operation Lookup**: Hash map for named and anonymous operation access
/// - **Source Tracking**: Maps documents to sources for error reporting
/// - **Mutable**: Can add documents incrementally
///
/// # Example
///
/// ```
/// use mearie_native::schema::DocumentIndex;
/// use mearie_native::graphql::ast::*;
///
/// let mut index = DocumentIndex::new();
///
/// // Add executable documents
/// // index.add_document(doc).unwrap();
///
/// // O(1) fragment lookup
/// if let Some(fragment) = index.get_fragment("UserFragment") {
///     println!("Found fragment on type: {}", fragment.type_condition);
/// }
///
/// // O(1) operation lookup
/// if let Some(operation) = index.get_operation(Some("GetUser")) {
///     println!("Found operation");
/// }
/// ```
pub struct DocumentIndex<'a> {
    documents: Vec<&'a Document<'a>>,
    operations: Vec<&'a OperationDefinition<'a>>,
    operations_by_name: FxHashMap<Option<&'a str>, &'a OperationDefinition<'a>>,
    fragments: FxHashMap<&'a str, &'a FragmentDefinition<'a>>,
    operation_to_document: FxHashMap<*const OperationDefinition<'a>, *const Document<'a>>,
    fragment_to_document: FxHashMap<*const FragmentDefinition<'a>, *const Document<'a>>,
    document_transforms: FxHashMap<*const Document<'a>, &'a Document<'a>>,
}

impl<'a> DocumentIndex<'a> {
    /// Creates a new empty document index.
    pub fn new() -> Self {
        Self {
            documents: Vec::new(),
            operations: Vec::new(),
            operations_by_name: FxHashMap::default(),
            fragments: FxHashMap::default(),
            operation_to_document: FxHashMap::default(),
            fragment_to_document: FxHashMap::default(),
            document_transforms: FxHashMap::default(),
        }
    }

    pub fn add_document(&mut self, doc: &'a Document<'a>) -> Result<()> {
        self.documents.push(doc);

        for definition in &doc.definitions {
            match definition {
                Definition::Executable(ExecutableDefinition::Fragment(fragment)) => {
                    self.register_fragment(fragment)?;
                    self.fragment_to_document.insert(fragment as *const _, doc as *const _);
                }
                Definition::Executable(ExecutableDefinition::Operation(operation)) => {
                    self.register_operation(operation);
                    self.operation_to_document.insert(operation as *const _, doc as *const _);
                }
                Definition::TypeSystem(_) | Definition::TypeSystemExtension(_) => {}
            }
        }

        Ok(())
    }

    fn register_fragment(&mut self, fragment: &'a FragmentDefinition<'a>) -> Result<()> {
        let fragment_name = fragment.name.as_str();

        if self.fragments.contains_key(fragment_name) {
            return Err(MearieError::validation(format!(
                "Duplicate fragment definition: {}",
                fragment_name
            )));
        }

        self.fragments.insert(fragment_name, fragment);

        Ok(())
    }

    fn register_operation(&mut self, operation: &'a OperationDefinition<'a>) {
        self.operations.push(operation);
        self.operations_by_name
            .insert(operation.name.map(|n| n.as_str()), operation);
    }

    /// Gets a fragment definition by name.
    ///
    /// # Time Complexity
    ///
    /// O(1)
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::schema::DocumentIndex;
    /// # let index = DocumentIndex::new();
    /// if let Some(fragment) = index.get_fragment("UserFragment") {
    ///     println!("Found fragment");
    /// }
    /// ```
    pub fn get_fragment(&self, name: &str) -> Option<&'a FragmentDefinition<'a>> {
        self.fragments.get(name).copied()
    }

    /// Gets an operation definition by name.
    ///
    /// Pass `None` to get an anonymous operation, or `Some(name)` for a named operation.
    ///
    /// # Time Complexity
    ///
    /// O(1)
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::schema::DocumentIndex;
    /// # let index = DocumentIndex::new();
    /// if let Some(operation) = index.get_operation(Some("GetUser")) {
    ///     println!("Found named operation");
    /// }
    /// if let Some(operation) = index.get_operation(None) {
    ///     println!("Found anonymous operation");
    /// }
    /// ```
    pub fn get_operation(&self, name: Option<&str>) -> Option<&'a OperationDefinition<'a>> {
        self.operations_by_name.get(&name).copied()
    }

    /// Checks if a fragment with the given name exists in the index.
    ///
    /// # Time Complexity
    ///
    /// O(1)
    pub fn has_fragment(&self, name: &str) -> bool {
        self.fragments.contains_key(name)
    }

    /// Returns the total number of fragments in the index.
    pub fn fragment_count(&self) -> usize {
        self.fragments.len()
    }

    /// Returns the total number of operations in the index.
    pub fn operation_count(&self) -> usize {
        self.operations.len()
    }

    /// Returns an iterator over all fragment definitions.
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::schema::DocumentIndex;
    /// # let index = DocumentIndex::new();
    /// for fragment in index.fragments() {
    ///     println!("Fragment: {}", fragment.name);
    /// }
    /// ```
    pub fn fragments(&self) -> impl Iterator<Item = &'a FragmentDefinition<'a>> + '_ {
        self.fragments.values().copied()
    }

    /// Returns an iterator over all operation definitions.
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::schema::DocumentIndex;
    /// # let index = DocumentIndex::new();
    /// for operation in index.operations() {
    ///     if let Some(name) = operation.name {
    ///         println!("Operation: {}", name);
    ///     }
    /// }
    /// ```
    pub fn operations(&self) -> impl Iterator<Item = &'a OperationDefinition<'a>> + '_ {
        self.operations.iter().copied()
    }

    /// Returns an iterator over all documents in the index.
    ///
    /// Documents are stored in the order they were added.
    pub fn documents(&self) -> impl Iterator<Item = &'a Document<'a>> + '_ {
        self.documents.iter().copied()
    }

    /// Stores a mapping from an original document to its transformed version.
    ///
    /// When source code is requested for operations or fragments in the original document,
    /// the transformed document's source will be returned instead.
    pub fn set_transformed_document(&mut self, original: &'a Document<'a>, transformed: &'a Document<'a>) {
        self.document_transforms.insert(original as *const _, transformed);
    }

    /// Gets the original source code for an operation definition.
    ///
    /// Returns the GraphQL source string for the document containing this operation.
    /// Always returns the original source, not the transformed version.
    ///
    /// # Time Complexity
    ///
    /// O(1) - uses hash map lookups with pointer equality
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::schema::DocumentIndex;
    /// # let index = DocumentIndex::new();
    /// # let operation = std::ptr::null();
    /// if let Some(source) = index.get_operation_source(unsafe { &*operation }) {
    ///     println!("Operation source: {}", source);
    /// }
    /// ```
    pub fn get_operation_source(&self, operation: &OperationDefinition<'a>) -> Option<&'a str> {
        let doc_ptr = self.operation_to_document.get(&(operation as *const _))?;
        let original_doc = unsafe { &**doc_ptr };
        Some(original_doc.source.code)
    }

    /// Gets the transformed source code for an operation definition.
    ///
    /// Returns the transformed GraphQL source string if the document has been transformed,
    /// otherwise returns the original source.
    ///
    /// # Time Complexity
    ///
    /// O(1) - uses hash map lookups with pointer equality
    pub fn get_transformed_operation_source(&self, operation: &OperationDefinition<'a>) -> Option<&'a str> {
        let doc_ptr = self.operation_to_document.get(&(operation as *const _))?;

        if let Some(&transformed_doc) = self.document_transforms.get(doc_ptr) {
            return Some(transformed_doc.source.code);
        }

        let original_doc = unsafe { &**doc_ptr };
        Some(original_doc.source.code)
    }

    /// Gets the original source code for a fragment definition.
    ///
    /// Returns the GraphQL source string for the document containing this fragment.
    /// Always returns the original source, not the transformed version.
    ///
    /// # Time Complexity
    ///
    /// O(1) - uses hash map lookups with pointer equality
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::schema::DocumentIndex;
    /// # let index = DocumentIndex::new();
    /// # let fragment = std::ptr::null();
    /// if let Some(source) = index.get_fragment_source(unsafe { &*fragment }) {
    ///     println!("Fragment source: {}", source);
    /// }
    /// ```
    pub fn get_fragment_source(&self, fragment: &FragmentDefinition<'a>) -> Option<&'a str> {
        let doc_ptr = self.fragment_to_document.get(&(fragment as *const _))?;
        let original_doc = unsafe { &**doc_ptr };
        Some(original_doc.source.code)
    }

    /// Gets the transformed source code for a fragment definition.
    ///
    /// Returns the transformed GraphQL source string if the document has been transformed,
    /// otherwise returns the original source.
    ///
    /// # Time Complexity
    ///
    /// O(1) - uses hash map lookups with pointer equality
    pub fn get_transformed_fragment_source(&self, fragment: &FragmentDefinition<'a>) -> Option<&'a str> {
        let doc_ptr = self.fragment_to_document.get(&(fragment as *const _))?;

        if let Some(&transformed_doc) = self.document_transforms.get(doc_ptr) {
            return Some(transformed_doc.source.code);
        }

        let original_doc = unsafe { &**doc_ptr };
        Some(original_doc.source.code)
    }
}

impl<'a> Default for DocumentIndex<'a> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arena::Arena;
    use crate::error::location::Span;
    use crate::source::Source;
    use assertables::*;

    #[test]
    fn test_empty_index() {
        let index = DocumentIndex::new();

        assert_eq!(index.fragment_count(), 0);
        assert_eq!(index.operation_count(), 0);
        assert!(!index.has_fragment("UserFragment"));
        assert_none!(&index.get_fragment("UserFragment"));
    }

    #[test]
    fn test_add_single_fragment() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let fragment_name = FragmentName::new(Name::new(arena.intern("UserFragment")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: fragment_name,
                    type_condition: TypeName::new(Name::new(arena.intern("User"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                }))
            ],
        });

        index.add_document(doc).unwrap();

        assert_eq!(index.fragment_count(), 1);
        assert!(index.has_fragment("UserFragment"));
        assert_some!(&index.get_fragment("UserFragment"));
    }

    #[test]
    fn test_fragment_lookup() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let fragment_name = FragmentName::new(Name::new(arena.intern("UserFragment")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: fragment_name,
                    type_condition: TypeName::new(Name::new(arena.intern("User"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                }))
            ],
        });

        index.add_document(doc).unwrap();

        assert_eq!(index.get_fragment("UserFragment").unwrap().name, "UserFragment");
        assert_none!(&index.get_fragment("NonExistent"));
    }

    #[test]
    fn test_duplicate_fragment_detection() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let fragment_name = FragmentName::new(Name::new(arena.intern("UserFragment")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: fragment_name,
                    type_condition: TypeName::new(Name::new(arena.intern("User"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                })),
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: fragment_name,
                    type_condition: TypeName::new(Name::new(arena.intern("User"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                })),
            ],
        });

        let result = index.add_document(doc);
        assert_err!(&result);
    }

    #[test]
    fn test_add_named_operation() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let operation_name = Name::new(arena.intern("GetUser"));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Query,
                    name: Some(operation_name),
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                }))
            ],
        });

        index.add_document(doc).unwrap();

        assert_eq!(index.operation_count(), 1);
        assert_some!(&index.get_operation(Some("GetUser")));
    }

    #[test]
    fn test_add_anonymous_operation() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Query,
                    name: None,
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                }))
            ],
        });

        index.add_document(doc).unwrap();

        assert_eq!(index.operation_count(), 1);
        assert_some!(&index.get_operation(None));
    }

    #[test]
    fn test_operation_lookup_by_name() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let operation_name = Name::new(arena.intern("GetUser"));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Query,
                    name: Some(operation_name),
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                }))
            ],
        });

        index.add_document(doc).unwrap();

        assert_some_eq_x!(
            index
                .get_operation(Some("GetUser"))
                .and_then(|op| op.name.map(|n| n.as_str())),
            "GetUser",
        );
        assert_none!(&index.get_operation(Some("NonExistent")));
    }

    #[test]
    fn test_has_fragment() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator(); Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                span: Span::empty(),
                name: FragmentName::new(Name::new(arena.intern("UserFragment"))),
                type_condition: TypeName::new(Name::new(arena.intern("User"))),
                directives: arena.alloc_vec(),
                selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
            }))],
        });

        index.add_document(doc).unwrap();

        assert!(index.has_fragment("UserFragment"));
        assert!(!index.has_fragment("NonExistent"));
    }

    #[test]
    fn test_fragments_iterator() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: FragmentName::new(Name::new(arena.intern("Fragment1"))),
                    type_condition: TypeName::new(Name::new(arena.intern("User"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                })),
                Definition::Executable(ExecutableDefinition::Fragment(FragmentDefinition {
                    span: Span::empty(),
                    name: FragmentName::new(Name::new(arena.intern("Fragment2"))),
                    type_condition: TypeName::new(Name::new(arena.intern("Post"))),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                })),
            ],
        });

        index.add_document(doc).unwrap();

        assert_len_eq_x!(index.fragments().collect::<Vec<_>>(), 2);
    }

    #[test]
    fn test_operations_iterator() {
        let arena = Arena::new();
        let mut index = DocumentIndex::new();

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Query,
                    name: Some(Name::new(arena.intern("GetUser"))),
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                })),
                Definition::Executable(ExecutableDefinition::Operation(OperationDefinition {
                    span: Span::empty(),
                    operation_type: OperationType::Mutation,
                    name: Some(Name::new(arena.intern("CreateUser"))),
                    variable_definitions: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    selection_set: SelectionSet { selections: bumpalo::vec![in arena.allocator(); ] },
                })),
            ],
        });

        index.add_document(doc).unwrap();

        assert_len_eq_x!(index.operations().collect::<Vec<_>>(), 2);
    }
}
