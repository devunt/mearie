use crate::graphql::ast::*;
use rustc_hash::{FxHashMap, FxHashSet};

/// Fast O(1) schema index for GraphQL type lookups.
///
/// `SchemaIndex` provides constant-time lookups for types, fields, and type relationships
/// by pre-computing all necessary indices during construction via [`SchemaBuilder`](crate::schema::SchemaBuilder).
///
/// # Design
///
/// - **Immutable**: Once built, the index cannot be modified
/// - **O(1) Lookups**: All queries use hash maps for constant-time access
/// - **Pre-computed Relationships**: Interface implementations and union members are computed during build
/// - **Separated Concerns**: Schema types only - fragments and operations are managed by [`DocumentIndex`](crate::schema::DocumentIndex)
///
/// # Example
///
/// ```
/// use mearie_native::arena::Arena;
/// use mearie_native::schema::{SchemaBuilder, SchemaIndex};
/// use mearie_native::graphql::ast::*;
///
/// let arena = Arena::new();
/// let mut builder = SchemaBuilder::new(&arena);
///
/// // Build schema from documents
/// // builder.add_document(schema_doc).unwrap();
///
/// let index = builder.build();
///
/// // O(1) type lookups
/// if index.is_object("User") {
///     let user_type = index.get_object_type("User").unwrap();
/// }
///
/// // O(1) field lookups
/// if let Some(field) = index.get_field("User", "id") {
///     // Use field definition
/// }
///
/// // O(1) interface implementations
/// let implementors = index.get_possible_types("Node");
/// ```
pub struct SchemaIndex<'a> {
    types: FxHashMap<&'a str, TypeInfo<'a>>,
    fields: FxHashMap<&'a str, FxHashMap<&'a str, &'a FieldDefinition<'a>>>,
    interface_implementors: FxHashMap<&'a str, FxHashSet<&'a str>>,
    union_members: FxHashMap<&'a str, FxHashSet<&'a str>>,
    directives: FxHashMap<&'a str, &'a DirectiveDefinition<'a>>,
    custom_scalars: Vec<&'a str>,
    query_type: Option<&'a str>,
    mutation_type: Option<&'a str>,
    subscription_type: Option<&'a str>,
}

/// Type information wrapper for GraphQL type definitions.
///
/// Provides a unified enum for accessing different kinds of GraphQL types
/// with zero-cost abstraction (just wraps references).
#[derive(Debug, Clone, Copy)]
pub enum TypeInfo<'a> {
    /// Object type definition
    Object(&'a ObjectTypeDefinition<'a>),
    /// Interface type definition
    Interface(&'a InterfaceTypeDefinition<'a>),
    /// Union type definition
    Union(&'a UnionTypeDefinition<'a>),
    /// Enum type definition
    Enum(&'a EnumTypeDefinition<'a>),
    /// Scalar type definition
    Scalar(&'a ScalarTypeDefinition<'a>),
    /// Input object type definition
    InputObject(&'a InputObjectTypeDefinition<'a>),
}

impl<'a> SchemaIndex<'a> {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn new(
        types: FxHashMap<&'a str, TypeInfo<'a>>,
        fields: FxHashMap<&'a str, FxHashMap<&'a str, &'a FieldDefinition<'a>>>,
        interface_implementors: FxHashMap<&'a str, FxHashSet<&'a str>>,
        union_members: FxHashMap<&'a str, FxHashSet<&'a str>>,
        directives: FxHashMap<&'a str, &'a DirectiveDefinition<'a>>,
        custom_scalars: Vec<&'a str>,
        query_type: Option<&'a str>,
        mutation_type: Option<&'a str>,
        subscription_type: Option<&'a str>,
    ) -> Self {
        Self {
            types,
            fields,
            interface_implementors,
            union_members,
            directives,
            custom_scalars,
            query_type,
            mutation_type,
            subscription_type,
        }
    }

    /// Gets type information by name.
    ///
    /// # Time Complexity
    ///
    /// O(1)
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::arena::Arena;
    /// # use mearie_native::schema::{SchemaBuilder, TypeInfo};
    /// # let arena = Arena::new();
    /// # let builder = SchemaBuilder::new(&arena);
    /// # let index = builder.build();
    /// if let Some(TypeInfo::Object(obj)) = index.get_type("User") {
    ///     println!("Found object type: {}", obj.name);
    /// }
    /// ```
    pub fn get_type(&self, name: &str) -> Option<TypeInfo<'a>> {
        self.types.get(name).copied()
    }

    pub fn is_object(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(TypeInfo::Object(_)))
    }

    pub fn is_interface(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(TypeInfo::Interface(_)))
    }

    pub fn is_union(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(TypeInfo::Union(_)))
    }

    pub fn is_composite(&self, name: &str) -> bool {
        matches!(
            self.get_type(name),
            Some(TypeInfo::Object(_) | TypeInfo::Interface(_) | TypeInfo::Union(_))
        )
    }

    pub fn is_enum(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(TypeInfo::Enum(_)))
    }

    pub fn is_scalar(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(TypeInfo::Scalar(_)))
    }

    pub fn is_input_object(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(TypeInfo::InputObject(_)))
    }

    pub fn get_object_type(&self, name: &str) -> Option<&'a ObjectTypeDefinition<'a>> {
        match self.get_type(name) {
            Some(TypeInfo::Object(obj)) => Some(obj),
            _ => None,
        }
    }

    pub fn get_interface_type(&self, name: &str) -> Option<&'a InterfaceTypeDefinition<'a>> {
        match self.get_type(name) {
            Some(TypeInfo::Interface(iface)) => Some(iface),
            _ => None,
        }
    }

    pub fn get_union_type(&self, name: &str) -> Option<&'a UnionTypeDefinition<'a>> {
        match self.get_type(name) {
            Some(TypeInfo::Union(union)) => Some(union),
            _ => None,
        }
    }

    pub fn get_enum_type(&self, name: &str) -> Option<&'a EnumTypeDefinition<'a>> {
        match self.get_type(name) {
            Some(TypeInfo::Enum(enum_type)) => Some(enum_type),
            _ => None,
        }
    }

    pub fn get_scalar_type(&self, name: &str) -> Option<&'a ScalarTypeDefinition<'a>> {
        match self.get_type(name) {
            Some(TypeInfo::Scalar(scalar)) => Some(scalar),
            _ => None,
        }
    }

    pub fn get_input_object_type(&self, name: &str) -> Option<&'a InputObjectTypeDefinition<'a>> {
        match self.get_type(name) {
            Some(TypeInfo::InputObject(input)) => Some(input),
            _ => None,
        }
    }

    /// Gets a field definition from a type.
    ///
    /// Works for both object types and interface types.
    ///
    /// # Time Complexity
    ///
    /// O(1) - uses nested hash map lookup
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::arena::Arena;
    /// # use mearie_native::schema::SchemaBuilder;
    /// # let arena = Arena::new();
    /// # let builder = SchemaBuilder::new(&arena);
    /// # let index = builder.build();
    /// if let Some(field) = index.get_field("User", "id") {
    ///     println!("Field type: {:?}", field.typ);
    /// }
    /// ```
    pub fn get_field(&self, type_name: &str, field_name: &str) -> Option<&'a FieldDefinition<'a>> {
        self.fields
            .get(type_name)
            .and_then(|field_map| field_map.get(field_name).copied())
    }

    pub fn get_object_fields(&self, type_name: &str) -> Option<&FxHashMap<&'a str, &'a FieldDefinition<'a>>> {
        self.fields.get(type_name)
    }

    /// Gets possible concrete types for an interface or union.
    ///
    /// Returns a pre-computed set of type names that either:
    /// - Implement the given interface
    /// - Are members of the given union
    ///
    /// # Time Complexity
    ///
    /// O(1) - returns pre-computed set
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::arena::Arena;
    /// # use mearie_native::schema::SchemaBuilder;
    /// # let arena = Arena::new();
    /// # let builder = SchemaBuilder::new(&arena);
    /// # let index = builder.build();
    /// for type_name in index.get_possible_types("Node") {
    ///     println!("Type {} implements Node", type_name);
    /// }
    /// ```
    pub fn get_possible_types(&self, type_name: &str) -> impl Iterator<Item = &'a str> + '_ {
        self.interface_implementors
            .get(type_name)
            .or_else(|| self.union_members.get(type_name))
            .into_iter()
            .flat_map(|set| set.iter().copied())
    }

    /// Checks if a type implements an interface.
    ///
    /// # Time Complexity
    ///
    /// O(1) - uses hash map and hash set lookups
    ///
    /// # Example
    ///
    /// ```
    /// # use mearie_native::arena::Arena;
    /// # use mearie_native::schema::SchemaBuilder;
    /// # let arena = Arena::new();
    /// # let builder = SchemaBuilder::new(&arena);
    /// # let index = builder.build();
    /// if index.implements("User", "Node") {
    ///     println!("User implements Node interface");
    /// }
    /// ```
    pub fn implements(&self, type_name: &str, interface_name: &str) -> bool {
        self.interface_implementors
            .get(interface_name)
            .is_some_and(|implementors| implementors.contains(type_name))
    }

    pub fn get_directive(&self, name: &str) -> Option<&'a DirectiveDefinition<'a>> {
        self.directives.get(name).copied()
    }

    pub fn custom_scalars(&self) -> &[&'a str] {
        &self.custom_scalars
    }

    pub fn query_type(&self) -> Option<&'a str> {
        self.query_type
    }

    pub fn mutation_type(&self) -> Option<&'a str> {
        self.mutation_type
    }

    pub fn subscription_type(&self) -> Option<&'a str> {
        self.subscription_type
    }

    pub fn has_type(&self, name: &str) -> bool {
        self.types.contains_key(name)
    }

    pub fn types(&self) -> impl Iterator<Item = (&'a str, TypeInfo<'a>)> + '_ {
        self.types.iter().map(|(&name, &type_info)| (name, type_info))
    }

    pub fn enums(&self) -> impl Iterator<Item = &'a EnumTypeDefinition<'a>> + '_ {
        self.types.values().filter_map(|&type_info| {
            if let TypeInfo::Enum(enum_def) = type_info {
                Some(enum_def)
            } else {
                None
            }
        })
    }

    pub fn input_objects(&self) -> impl Iterator<Item = &'a InputObjectTypeDefinition<'a>> + '_ {
        self.types.values().filter_map(|&type_info| {
            if let TypeInfo::InputObject(input_def) = type_info {
                Some(input_def)
            } else {
                None
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arena::Arena;
    use crate::graphql::ast::{FieldName, Name, TypeName};

    #[allow(clippy::type_complexity)]
    fn create_test_index<'a>(
        arena: &'a Arena,
    ) -> (
        FxHashMap<&'a str, TypeInfo<'a>>,
        FxHashMap<&'a str, FxHashMap<&'a str, &'a FieldDefinition<'a>>>,
        FxHashMap<&'a str, FxHashSet<&'a str>>,
        FxHashMap<&'a str, FxHashSet<&'a str>>,
    ) {
        let mut types = FxHashMap::default();
        let mut fields = FxHashMap::default();
        let mut interface_implementors = FxHashMap::default();
        let mut union_members = FxHashMap::default();

        let obj_name = TypeName::new(Name::new(arena.intern("User")));
        let obj_def = arena.alloc(ObjectTypeDefinition {
            name: obj_name,
            implements: arena.alloc_vec(),
            directives: arena.alloc_vec(),
            fields: arena.alloc_vec(),
            description: None,
        });
        types.insert(obj_name.as_str(), TypeInfo::Object(obj_def));

        let iface_name = TypeName::new(Name::new(arena.intern("Node")));
        let iface_def = arena.alloc(InterfaceTypeDefinition {
            name: iface_name,
            implements: arena.alloc_vec(),
            directives: arena.alloc_vec(),
            fields: arena.alloc_vec(),
            description: None,
        });
        types.insert(iface_name.as_str(), TypeInfo::Interface(iface_def));

        let mut iface_impls = FxHashSet::default();
        iface_impls.insert(obj_name.as_str());
        interface_implementors.insert(iface_name.as_str(), iface_impls);

        let union_name = TypeName::new(Name::new(arena.intern("SearchResult")));
        let union_def = arena.alloc(UnionTypeDefinition {
            name: union_name,
            directives: arena.alloc_vec(),
            members: bumpalo::vec![in arena.allocator(); obj_name],
            description: None,
        });
        types.insert(union_name.as_str(), TypeInfo::Union(union_def));
        let mut union_member_set = FxHashSet::default();
        union_member_set.insert(obj_name.as_str());
        union_members.insert(union_name.as_str(), union_member_set);

        let enum_name = TypeName::new(Name::new(arena.intern("Status")));
        let enum_def = arena.alloc(EnumTypeDefinition {
            name: enum_name,
            directives: arena.alloc_vec(),
            values: arena.alloc_vec(),
            description: None,
        });
        types.insert(enum_name.as_str(), TypeInfo::Enum(enum_def));

        let scalar_name = TypeName::new(Name::new(arena.intern("DateTime")));
        let scalar_def = arena.alloc(ScalarTypeDefinition {
            name: scalar_name,
            directives: arena.alloc_vec(),
            description: None,
        });
        types.insert(scalar_name.as_str(), TypeInfo::Scalar(scalar_def));

        let input_name = TypeName::new(Name::new(arena.intern("UserInput")));
        let input_def = arena.alloc(InputObjectTypeDefinition {
            name: input_name,
            directives: arena.alloc_vec(),
            fields: arena.alloc_vec(),
            description: None,
        });
        types.insert(input_name.as_str(), TypeInfo::InputObject(input_def));

        let field_def = arena.alloc(FieldDefinition {
            name: FieldName::new(Name::new(arena.intern("id"))),
            typ: Type::Named(NamedType {
                name: TypeName::new(Name::new(arena.intern("ID"))),
            }),
            arguments: arena.alloc_vec(),
            directives: arena.alloc_vec(),
            description: None,
        });
        let mut obj_fields = FxHashMap::default();
        obj_fields.insert("id", field_def);
        fields.insert(obj_name.as_str(), obj_fields);

        (types, fields, interface_implementors, union_members)
    }

    #[test]
    fn test_empty_index() {
        let index = SchemaIndex::new(
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        assert!(index.get_type("User").is_none());
        assert!(!index.has_type("User"));
        assert_eq!(index.types().count(), 0);
    }

    #[test]
    fn test_type_lookup() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        assert!(matches!(index.get_type("User"), Some(TypeInfo::Object(_))));
        assert!(matches!(index.get_type("Node"), Some(TypeInfo::Interface(_))));
        assert!(matches!(index.get_type("SearchResult"), Some(TypeInfo::Union(_))));
        assert!(matches!(index.get_type("Status"), Some(TypeInfo::Enum(_))));
        assert!(matches!(index.get_type("DateTime"), Some(TypeInfo::Scalar(_))));
        assert!(matches!(index.get_type("UserInput"), Some(TypeInfo::InputObject(_))));
        assert!(index.get_type("NonExistent").is_none());
    }

    #[test]
    fn test_type_checkers() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        assert!(index.is_object("User"));
        assert!(!index.is_interface("User"));

        assert!(index.is_interface("Node"));
        assert!(!index.is_object("Node"));

        assert!(index.is_union("SearchResult"));
        assert!(!index.is_enum("SearchResult"));

        assert!(index.is_enum("Status"));
        assert!(!index.is_scalar("Status"));

        assert!(index.is_scalar("DateTime"));
        assert!(!index.is_input_object("DateTime"));

        assert!(index.is_input_object("UserInput"));
        assert!(!index.is_object("UserInput"));
    }

    #[test]
    fn test_field_lookup() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        let field = index.get_field("User", "id");
        assert!(field.is_some());
        assert_eq!(field.unwrap().name, "id");

        assert!(index.get_field("User", "nonexistent").is_none());
        assert!(index.get_field("NonExistentType", "id").is_none());
    }

    #[test]
    fn test_get_object_fields() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        let obj_fields = index.get_object_fields("User");
        assert!(obj_fields.is_some());
        assert_eq!(obj_fields.unwrap().len(), 1);

        assert!(index.get_object_fields("NonExistent").is_none());
    }

    #[test]
    fn test_get_possible_types_for_interface() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        let possible: Vec<_> = index.get_possible_types("Node").collect();
        assert_eq!(possible.len(), 1);
        assert_eq!(possible[0], "User");

        let empty: Vec<_> = index.get_possible_types("NonExistent").collect();
        assert_eq!(empty.len(), 0);
    }

    #[test]
    fn test_get_possible_types_for_union() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        let possible: Vec<_> = index.get_possible_types("SearchResult").collect();
        assert_eq!(possible.len(), 1);
        assert_eq!(possible[0], "User");
    }

    #[test]
    fn test_implements() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        assert!(index.implements("User", "Node"));
        assert!(!index.implements("Status", "Node"));
        assert!(!index.implements("User", "NonExistent"));
    }

    #[test]
    fn test_custom_scalars() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let custom_scalars = vec!["DateTime"];
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            custom_scalars,
            None,
            None,
            None,
        );

        let scalars = index.custom_scalars();
        assert_eq!(scalars.len(), 1);
        assert_eq!(scalars[0], "DateTime");
    }

    #[test]
    fn test_directive_lookup() {
        let arena = Arena::new();
        let directive_name = DirectiveName::new(Name::new(arena.intern("deprecated")));
        let directive_def = arena.alloc(DirectiveDefinition {
            name: directive_name,
            arguments: arena.alloc_vec(),
            locations: arena.alloc_vec(),
            repeatable: false,
            description: None,
        });

        let mut directives = FxHashMap::default();
        directives.insert(directive_name.as_str(), directive_def);

        let index = SchemaIndex::new(
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            directives,
            Vec::new(),
            None,
            None,
            None,
        );

        assert!(index.get_directive("deprecated").is_some());
        assert!(index.get_directive("nonexistent").is_none());
    }

    #[test]
    fn test_root_operation_types() {
        let index = SchemaIndex::new(
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            FxHashMap::default(),
            Vec::new(),
            Some("Query"),
            Some("Mutation"),
            Some("Subscription"),
        );

        assert_eq!(index.query_type(), Some("Query"));
        assert_eq!(index.mutation_type(), Some("Mutation"));
        assert_eq!(index.subscription_type(), Some("Subscription"));
    }

    #[test]
    fn test_has_type() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        assert!(index.has_type("User"));
        assert!(index.has_type("Node"));
        assert!(!index.has_type("NonExistent"));
    }

    #[test]
    fn test_types_iterator() {
        let arena = Arena::new();
        let (types, fields, interface_implementors, union_members) = create_test_index(&arena);
        let index = SchemaIndex::new(
            types,
            fields,
            interface_implementors,
            union_members,
            FxHashMap::default(),
            Vec::new(),
            None,
            None,
            None,
        );

        let type_names: Vec<&str> = index.types().map(|(name, _)| name).collect();
        assert_eq!(type_names.len(), 6);
        assert!(type_names.contains(&"User"));
        assert!(type_names.contains(&"Node"));
        assert!(type_names.contains(&"SearchResult"));
        assert!(type_names.contains(&"Status"));
        assert!(type_names.contains(&"DateTime"));
        assert!(type_names.contains(&"UserInput"));
    }
}
