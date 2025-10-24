use crate::arena::Arena;
use crate::error::{MearieError, Result};
use crate::graphql::ast::*;
use crate::schema::{SchemaIndex, TypeInfo};
use rustc_hash::FxHashMap;

/// Builder for constructing an immutable [`SchemaIndex`].
///
/// `SchemaBuilder` processes GraphQL schema documents and builds optimized
/// indices for O(1) lookups. Built-in scalars (Int, Float, String, Boolean, ID)
/// are automatically included.
///
/// # Example
///
/// ```
/// use mearie_native::arena::Arena;
/// use mearie_native::schema::SchemaBuilder;
///
/// let arena = Arena::new();
/// let mut builder = SchemaBuilder::new(&arena);
///
/// // Add schema documents
/// // builder.add_document(schema_doc).unwrap();
///
/// // Build immutable index
/// let index = builder.build();
/// ```
pub struct SchemaBuilder<'a> {
    arena: &'a Arena,
    types: FxHashMap<&'a str, TypeInfo<'a>>,
    fields: FxHashMap<&'a str, FxHashMap<&'a str, &'a FieldDefinition<'a>>>,
    interface_implementors: FxHashMap<&'a str, Vec<&'a str>>,
    union_members: FxHashMap<&'a str, Vec<&'a str>>,
    directives: FxHashMap<&'a str, &'a DirectiveDefinition<'a>>,
    custom_scalars: Vec<&'a str>,
    query_type: Option<&'a str>,
    mutation_type: Option<&'a str>,
    subscription_type: Option<&'a str>,
}

impl<'a> SchemaBuilder<'a> {
    /// Creates a new schema builder with built-in scalars pre-registered.
    ///
    /// The following built-in scalars are automatically added:
    /// - Int
    /// - Float
    /// - String
    /// - Boolean
    /// - ID
    pub fn new(arena: &'a Arena) -> Self {
        let mut builder = Self {
            arena,
            types: FxHashMap::default(),
            fields: FxHashMap::default(),
            interface_implementors: FxHashMap::default(),
            union_members: FxHashMap::default(),
            directives: FxHashMap::default(),
            custom_scalars: Vec::new(),
            query_type: None,
            mutation_type: None,
            subscription_type: None,
        };
        builder.add_built_in_scalars();
        builder
    }

    fn add_built_in_scalars(&mut self) {
        const BUILT_INS: &[&str] = &["Int", "Float", "String", "Boolean", "ID"];
        for &name in BUILT_INS {
            let scalar_name_str = self.arena.intern(name);
            let scalar_name = TypeName::new(Name::new(scalar_name_str));
            let scalar_def = self.arena.alloc(ScalarTypeDefinition {
                name: scalar_name,
                directives: self.arena.alloc_vec(),
                description: None,
            });
            self.types.insert(scalar_name_str, TypeInfo::Scalar(scalar_def));
        }
    }

    /// Adds a schema document to the builder.
    ///
    /// Processes all type definitions, schema definitions, and directives from the document.
    /// Operations and fragments are ignored (use [`DocumentIndex`](crate::schema::DocumentIndex) for those).
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - A type with the same name already exists
    /// - A directive with the same name already exists
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::arena::Arena;
    /// # use mearie_native::schema::SchemaBuilder;
    /// # use mearie_native::graphql::ast::*;
    /// # let arena = Arena::new();
    /// let mut builder = SchemaBuilder::new(&arena);
    /// // builder.add_document(schema_doc)?;
    /// ```
    pub fn add_document(&mut self, doc: &'a Document<'a>) -> Result<()> {
        for definition in &doc.definitions {
            match definition {
                Definition::TypeSystem(TypeSystemDefinition::Type(type_def)) => {
                    self.register_type_definition(type_def)?;
                }
                Definition::TypeSystem(TypeSystemDefinition::Schema(schema_def)) => {
                    self.process_schema_definition(schema_def);
                }
                Definition::TypeSystem(TypeSystemDefinition::Directive(directive_def)) => {
                    self.register_directive(directive_def)?;
                }
                Definition::Executable(_) => {}
                Definition::TypeSystemExtension(_) => {}
            }
        }
        Ok(())
    }

    fn register_type_definition(&mut self, type_def: &'a TypeDefinition<'a>) -> Result<()> {
        match type_def {
            TypeDefinition::Scalar(scalar) => self.register_scalar_type(scalar),
            TypeDefinition::Object(obj) => self.register_object_type(obj),
            TypeDefinition::Interface(iface) => self.register_interface_type(iface),
            TypeDefinition::Union(union) => self.register_union_type(union),
            TypeDefinition::Enum(enum_type) => self.register_enum_type(enum_type),
            TypeDefinition::InputObject(input) => self.register_input_object_type(input),
        }
    }

    fn register_object_type(&mut self, obj: &'a ObjectTypeDefinition<'a>) -> Result<()> {
        let type_name = obj.name.as_str();

        if self.types.contains_key(type_name) {
            return Err(MearieError::validation(format!(
                "Duplicate type definition: {}",
                type_name
            )));
        }

        self.types.insert(type_name, TypeInfo::Object(obj));

        let mut field_map = FxHashMap::default();
        for field in &obj.fields {
            field_map.insert(field.name.as_str(), field);
        }
        self.fields.insert(type_name, field_map);

        for interface_name in &obj.implements {
            self.interface_implementors
                .entry(interface_name.as_str())
                .or_default()
                .push(type_name);
        }

        Ok(())
    }

    fn register_interface_type(&mut self, iface: &'a InterfaceTypeDefinition<'a>) -> Result<()> {
        let type_name = iface.name.as_str();

        if self.types.contains_key(type_name) {
            return Err(MearieError::validation(format!(
                "Duplicate type definition: {}",
                type_name
            )));
        }

        self.types.insert(type_name, TypeInfo::Interface(iface));

        let mut field_map = FxHashMap::default();
        for field in &iface.fields {
            field_map.insert(field.name.as_str(), field);
        }
        self.fields.insert(type_name, field_map);

        self.interface_implementors.entry(type_name).or_default();

        Ok(())
    }

    fn register_union_type(&mut self, union: &'a UnionTypeDefinition<'a>) -> Result<()> {
        let type_name = union.name.as_str();

        if self.types.contains_key(type_name) {
            return Err(MearieError::validation(format!(
                "Duplicate type definition: {}",
                type_name
            )));
        }

        self.types.insert(type_name, TypeInfo::Union(union));

        let members: Vec<&'a str> = union.members.iter().map(|t| t.as_str()).collect();
        self.union_members.insert(type_name, members);

        Ok(())
    }

    fn register_enum_type(&mut self, enum_type: &'a EnumTypeDefinition<'a>) -> Result<()> {
        let type_name = enum_type.name.as_str();

        if self.types.contains_key(type_name) {
            return Err(MearieError::validation(format!(
                "Duplicate type definition: {}",
                type_name
            )));
        }

        self.types.insert(type_name, TypeInfo::Enum(enum_type));

        Ok(())
    }

    fn register_scalar_type(&mut self, scalar: &'a ScalarTypeDefinition<'a>) -> Result<()> {
        let type_name = scalar.name.as_str();

        if self.types.contains_key(type_name) {
            return Err(MearieError::validation(format!(
                "Duplicate type definition: {}",
                type_name
            )));
        }

        self.types.insert(type_name, TypeInfo::Scalar(scalar));

        const BUILT_INS: &[&str] = &["Int", "Float", "String", "Boolean", "ID"];
        if !BUILT_INS.contains(&type_name) {
            self.custom_scalars.push(type_name);
        }

        Ok(())
    }

    fn register_input_object_type(&mut self, input: &'a InputObjectTypeDefinition<'a>) -> Result<()> {
        let type_name = input.name.as_str();

        if self.types.contains_key(type_name) {
            return Err(MearieError::validation(format!(
                "Duplicate type definition: {}",
                type_name
            )));
        }

        self.types.insert(type_name, TypeInfo::InputObject(input));

        Ok(())
    }

    fn register_directive(&mut self, directive: &'a DirectiveDefinition<'a>) -> Result<()> {
        let directive_name = directive.name.as_str();

        if self.directives.contains_key(directive_name) {
            return Err(MearieError::validation(format!(
                "Duplicate directive definition: @{}",
                directive_name
            )));
        }

        self.directives.insert(directive_name, directive);

        Ok(())
    }

    fn process_schema_definition(&mut self, schema_def: &'a SchemaDefinition<'a>) {
        if let Some(query) = schema_def.query {
            self.query_type = Some(query.as_str());
        }
        if let Some(mutation) = schema_def.mutation {
            self.mutation_type = Some(mutation.as_str());
        }
        if let Some(subscription) = schema_def.subscription {
            self.subscription_type = Some(subscription.as_str());
        }
    }

    /// Consumes the builder and returns an immutable [`SchemaIndex`].
    ///
    /// After calling this method, the builder cannot be used again.
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::arena::Arena;
    /// # use mearie_native::schema::SchemaBuilder;
    /// # let arena = Arena::new();
    /// let builder = SchemaBuilder::new(&arena);
    /// let index = builder.build();
    /// ```
    pub fn build(self) -> SchemaIndex<'a> {
        SchemaIndex::new(
            self.types,
            self.fields,
            self.interface_implementors,
            self.union_members,
            self.directives,
            self.custom_scalars,
            self.query_type,
            self.mutation_type,
            self.subscription_type,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::ast::{FieldName, Name, TypeName};
    use crate::source::Source;
    use assertables::*;

    #[test]
    fn test_new_builder_has_built_in_scalars() {
        let arena = Arena::new();
        let builder = SchemaBuilder::new(&arena);
        let index = builder.build();

        assert!(index.is_scalar("Int"));
        assert!(index.is_scalar("Float"));
        assert!(index.is_scalar("String"));
        assert!(index.is_scalar("Boolean"));
        assert!(index.is_scalar("ID"));
    }

    #[test]
    fn test_add_object_type() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let user_name = TypeName::new(Name::new(arena.intern("User")));
        let obj = ObjectTypeDefinition {
            name: user_name,
            implements: arena.alloc_vec(),
            directives: arena.alloc_vec(),
            fields: arena.alloc_vec(),
            description: None,
        };

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(obj)))
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        assert!(index.is_object("User"));
        assert_some!(index.get_object_type("User"));
    }

    #[test]
    fn test_add_object_with_interfaces() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let node_name = TypeName::new(Name::new(arena.intern("Node")));
        let user_name = TypeName::new(Name::new(arena.intern("User")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Interface(InterfaceTypeDefinition {
                    name: node_name,
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: arena.alloc_vec(),
                    description: None,
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: user_name,
                    implements: bumpalo::vec![in arena.allocator(); node_name],
                    directives: arena.alloc_vec(),
                    fields: arena.alloc_vec(),
                    description: None,
                }))),
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        let possible = index.get_possible_types("Node");
        assert!(index.implements("User", "Node"));
        assert_len_eq_x!(possible, 1);
        assert_eq!(possible[0], "User");
    }

    #[test]
    fn test_add_union_type() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let user_name = TypeName::new(Name::new(arena.intern("User")));
        let union_name = TypeName::new(Name::new(arena.intern("SearchResult")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: user_name,
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: arena.alloc_vec(),
                    description: None,
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Union(UnionTypeDefinition {
                    name: union_name,
                    directives: arena.alloc_vec(),
                    members: bumpalo::vec![in arena.allocator(); user_name],
                    description: None,
                }))),
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        let members = index.get_possible_types("SearchResult");
        assert!(index.is_union("SearchResult"));
        assert_len_eq_x!(members, 1);
        assert_eq!(members[0], "User");
    }

    #[test]
    fn test_field_index_creation_for_object() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let user_name = TypeName::new(Name::new(arena.intern("User")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: user_name,
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: bumpalo::vec![in arena.allocator();
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("id"))),
                            typ: Type::Named(NamedType {
                                name: TypeName::new(Name::new(arena.intern("ID"))),
                            }),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        },
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("name"))),
                            typ: Type::Named(NamedType {
                                name: TypeName::new(Name::new(arena.intern("String"))),
                            }),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        }
                    ],
                    description: None,
                })))
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        assert_some!(index.get_field("User", "id"));
        assert_some!(index.get_field("User", "name"));
        assert_none!(index.get_field("User", "nonexistent"));

        assert_len_eq_x!(index.get_object_fields("User").unwrap(), 2);
    }

    #[test]
    fn test_field_index_creation_for_interface() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let node_name = TypeName::new(Name::new(arena.intern("Node")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Interface(InterfaceTypeDefinition {
                    name: node_name,
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: bumpalo::vec![in arena.allocator();
                        FieldDefinition {
                            name: FieldName::new(Name::new(arena.intern("id"))),
                            typ: Type::Named(NamedType {
                                name: TypeName::new(Name::new(arena.intern("ID"))),
                            }),
                            arguments: arena.alloc_vec(),
                            directives: arena.alloc_vec(),
                            description: None,
                        }
                    ],
                    description: None,
                })))
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        assert_some!(index.get_field("Node", "id"));
        assert_len_eq_x!(index.get_object_fields("Node").unwrap(), 1);
    }

    #[test]
    fn test_custom_scalar_tracking() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let datetime_name = TypeName::new(Name::new(arena.intern("DateTime")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Scalar(ScalarTypeDefinition {
                    name: datetime_name,
                    directives: arena.alloc_vec(),
                    description: None,
                })))
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        let custom_scalars = index.custom_scalars();
        assert_len_eq_x!(custom_scalars, 1);
        assert_eq!(custom_scalars[0], "DateTime");

        assert_not_contains!(custom_scalars, &"String");
    }

    #[test]
    fn test_schema_definition_processing() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Schema(SchemaDefinition {
                    description: None,
                    query: Some(TypeName::new(Name::new(arena.intern("Query")))),
                    mutation: Some(TypeName::new(Name::new(arena.intern("Mutation")))),
                    subscription: Some(TypeName::new(Name::new(arena.intern("Subscription")))),
                    directives: arena.alloc_vec(),
                }))
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        assert_some_eq_x!(index.query_type(), "Query");
        assert_some_eq_x!(index.mutation_type(), "Mutation");
        assert_some_eq_x!(index.subscription_type(), "Subscription");
    }

    #[test]
    fn test_duplicate_type_detection() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let user_name = TypeName::new(Name::new(arena.intern("User")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: user_name,
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: arena.alloc_vec(),
                    description: None,
                }))),
                Definition::TypeSystem(TypeSystemDefinition::Type(TypeDefinition::Object(ObjectTypeDefinition {
                    name: user_name,
                    implements: arena.alloc_vec(),
                    directives: arena.alloc_vec(),
                    fields: arena.alloc_vec(),
                    description: None,
                }))),
            ],
        });

        assert_err!(builder.add_document(doc));
    }

    #[test]
    fn test_directive_registration() {
        let arena = Arena::new();
        let mut builder = SchemaBuilder::new(&arena);

        let directive_name = DirectiveName::new(Name::new(arena.intern("deprecated")));

        let source = Source::ephemeral("");
        let doc = arena.alloc(Document {
            source: &source,
            definitions: bumpalo::vec![in arena.allocator();
                Definition::TypeSystem(TypeSystemDefinition::Directive(DirectiveDefinition {
                    name: directive_name,
                    arguments: arena.alloc_vec(),
                    locations: bumpalo::vec![in arena.allocator(); ],
                    repeatable: false,
                    description: None,
                }))
            ],
        });

        builder.add_document(doc).unwrap();
        let index = builder.build();

        assert_some!(index.get_directive("deprecated"));
    }
}
