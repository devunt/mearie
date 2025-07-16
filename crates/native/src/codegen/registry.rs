use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::validation::context::SchemaProvider;
use crate::validation::rule::{ValidateNode, ValidationRule};
use crate::validation::rules::*;
use rustc_hash::FxHashMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GraphQLType<'a> {
    Object(&'a ObjectTypeDefinition<'a>),
    Interface(&'a InterfaceTypeDefinition<'a>),
    Union(&'a UnionTypeDefinition<'a>),
    Enum(&'a EnumTypeDefinition<'a>),
    Scalar(&'a ScalarTypeDefinition<'a>),
    InputObject(&'a InputObjectTypeDefinition<'a>),
}

#[derive(Default)]
pub struct Registry<'a> {
    types: FxHashMap<&'a str, GraphQLType<'a>>,
    fragments: FxHashMap<&'a str, &'a FragmentDefinition<'a>>,
    operations: Vec<&'a OperationDefinition<'a>>,
    directives: FxHashMap<&'a str, &'a DirectiveDefinition<'a>>,
    schemas: Vec<&'a Document<'a>>,
    documents: Vec<&'a Document<'a>>,
}

impl<'a> Registry<'a> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load_schema(&mut self, document: &'a Document<'a>) {
        for definition in &document.definitions {
            match definition {
                Definition::TypeSystem(TypeSystemDefinition::Type(type_def)) => {
                    self.register_type_definition(type_def);
                }
                Definition::TypeSystem(TypeSystemDefinition::Directive(directive_def)) => {
                    self.directives.insert(directive_def.name.as_str(), directive_def);
                }
                _ => {}
            }
        }

        self.schemas.push(document);
    }

    pub fn load_document(&mut self, document: &'a Document<'a>) -> Result<(), Vec<MearieError>> {
        self.validate_document(document)?;

        for definition in &document.definitions {
            match definition {
                Definition::Executable(ExecutableDefinition::Fragment(fragment)) => {
                    self.fragments.insert(fragment.name.as_str(), fragment);
                }
                Definition::Executable(ExecutableDefinition::Operation(operation)) => {
                    self.operations.push(operation);
                }
                _ => {}
            }
        }

        self.documents.push(document);
        Ok(())
    }

    fn register_type_definition(&mut self, type_def: &'a TypeDefinition<'a>) {
        let (name, type_) = match type_def {
            TypeDefinition::Scalar(scalar) => (scalar.name.as_str(), GraphQLType::Scalar(scalar)),
            TypeDefinition::Object(obj) => (obj.name.as_str(), GraphQLType::Object(obj)),
            TypeDefinition::Interface(interface) => (interface.name.as_str(), GraphQLType::Interface(interface)),
            TypeDefinition::Union(union) => (union.name.as_str(), GraphQLType::Union(union)),
            TypeDefinition::Enum(enum_def) => (enum_def.name.as_str(), GraphQLType::Enum(enum_def)),
            TypeDefinition::InputObject(input_obj) => (input_obj.name.as_str(), GraphQLType::InputObject(input_obj)),
        };

        self.types.insert(name, type_);
    }

    // Type-related methods
    pub fn get_type(&self, name: &str) -> Result<&GraphQLType<'a>, MearieError> {
        self.types.get(name).ok_or_else(|| MearieError {
            kind: ErrorKind::TypeNotFound { name: name.to_string() },
            location: None,
        })
    }

    pub fn get_field_type(&self, type_name: &str, field_name: &str) -> Result<&'a Type<'a>, MearieError> {
        let type_ = self.get_type(type_name)?;

        let field_type = match type_ {
            GraphQLType::Object(obj) => obj
                .fields
                .iter()
                .find(|field| field.name.as_str() == field_name)
                .map(|field| &field.typ),
            GraphQLType::Interface(interface) => interface
                .fields
                .iter()
                .find(|field| field.name.as_str() == field_name)
                .map(|field| &field.typ),
            _ => None,
        };

        field_type.ok_or_else(|| MearieError {
            kind: ErrorKind::FieldNotFound {
                type_name: type_name.to_string(),
                field: field_name.to_string(),
            },
            location: None,
        })
    }

    pub fn get_field_definition(
        &self,
        type_name: &str,
        field_name: &str,
    ) -> Result<&'a FieldDefinition<'a>, MearieError> {
        let type_ = self.get_type(type_name)?;

        let field_def = match type_ {
            GraphQLType::Object(obj) => obj.fields.iter().find(|field| field.name.as_str() == field_name),
            GraphQLType::Interface(interface) => {
                interface.fields.iter().find(|field| field.name.as_str() == field_name)
            }
            _ => None,
        };

        field_def.ok_or_else(|| MearieError {
            kind: ErrorKind::FieldNotFound {
                type_name: type_name.to_string(),
                field: field_name.to_string(),
            },
            location: None,
        })
    }

    pub fn is_object_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Ok(GraphQLType::Object(_)))
    }

    pub fn is_interface_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Ok(GraphQLType::Interface(_)))
    }

    pub fn is_union_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Ok(GraphQLType::Union(_)))
    }

    pub fn is_enum_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Ok(GraphQLType::Enum(_)))
    }

    pub fn get_possible_types(&self, name: &str) -> Vec<&'a str> {
        let type_ = match self.get_type(name) {
            Ok(info) => info,
            Err(_) => return Vec::new(),
        };

        match type_ {
            GraphQLType::Union(union) => union.members.iter().map(|member| member.as_str()).collect(),
            GraphQLType::Interface(interface) => {
                let interface_name = interface.name.as_str();
                self.types
                    .values()
                    .filter_map(|info| match info {
                        GraphQLType::Object(obj) => {
                            if obj
                                .implements
                                .iter()
                                .any(|impl_name| impl_name.as_str() == interface_name)
                            {
                                Some(obj.name.as_str())
                            } else {
                                None
                            }
                        }
                        _ => None,
                    })
                    .collect()
            }
            _ => Vec::new(),
        }
    }

    pub fn get_object_fields(&self, type_name: &str) -> Result<&'a [FieldDefinition<'a>], MearieError> {
        match self.get_type(type_name)? {
            GraphQLType::Object(obj) => Ok(&obj.fields),
            GraphQLType::Interface(interface) => Ok(&interface.fields),
            _ => Err(MearieError {
                kind: ErrorKind::InvalidType {
                    message: format!("Type '{}' is not an object or interface type", type_name),
                },
                location: None,
            }),
        }
    }

    // Fragment-related methods
    pub fn get_fragment(&self, name: &str) -> Option<&'a FragmentDefinition<'a>> {
        self.fragments.get(name).copied()
    }

    pub fn fragments(&self) -> impl Iterator<Item = &FragmentDefinition<'a>> + '_ {
        self.fragments.values().copied()
    }

    // Scalar-related methods
    pub fn is_scalar(&self, name: &str) -> bool {
        matches!(name, "ID" | "String" | "Int" | "Float" | "Boolean")
            || matches!(self.get_type(name), Ok(GraphQLType::Scalar(_)))
    }

    pub fn custom_scalars(&self) -> Vec<&'a str> {
        self.types
            .iter()
            .filter_map(|(name, type_)| match type_ {
                GraphQLType::Scalar(_) => Some(*name),
                _ => None,
            })
            .collect()
    }

    pub fn get_input_object(&self, name: &str) -> Option<&'a InputObjectTypeDefinition<'a>> {
        match self.get_type(name) {
            Ok(GraphQLType::InputObject(input_obj)) => Some(input_obj),
            _ => None,
        }
    }

    pub fn is_input_object(&self, name: &str) -> bool {
        matches!(self.get_type(name), Ok(GraphQLType::InputObject(_)))
    }

    pub fn has_custom_scalar(&self, name: &str) -> bool {
        matches!(self.get_type(name), Ok(GraphQLType::Scalar(_)))
    }

    pub fn get_custom_scalar(&self, name: &str) -> Option<&'a ScalarTypeDefinition<'a>> {
        match self.get_type(name) {
            Ok(GraphQLType::Scalar(scalar)) => Some(scalar),
            _ => None,
        }
    }

    pub fn get_custom_directive(&self, name: &str) -> Option<&'a DirectiveDefinition<'a>> {
        self.directives.get(name).copied()
    }

    pub fn operations(&self) -> &[&'a OperationDefinition<'a>] {
        &self.operations
    }

    pub fn schemas(&self) -> &[&'a Document<'a>] {
        &self.schemas
    }

    pub fn documents(&self) -> &[&'a Document<'a>] {
        &self.documents
    }

    pub fn validate_document(&self, document: &'a Document<'a>) -> Result<(), Vec<MearieError>> {
        let mut all_errors = Vec::new();

        macro_rules! validate_rule {
            ($rule:ty) => {
                if let Err(errors) = <$rule>::validate_all(self, document) {
                    all_errors.extend(errors);
                }
            };
        }

        // Operation rules
        validate_rule!(OperationNameUniqueness);
        validate_rule!(LoneAnonymousOperation);
        validate_rule!(SubscriptionSingleRootField);

        // Argument rules
        validate_rule!(ArgumentUniqueness);

        // Fragment rules
        validate_rule!(FragmentNameUniqueness);
        validate_rule!(FragmentSpreadTargetDefined);
        validate_rule!(NoFragmentCycles);

        // Variable rules
        validate_rule!(VariableUniqueness);
        validate_rule!(AllVariableUsesDefined);
        validate_rule!(AllVariablesUsed);

        // Input object rules
        validate_rule!(InputObjectFieldUniqueness);

        // Directive rules
        validate_rule!(DirectivesAreUniquePerLocation);

        // Schema-aware rules
        validate_rule!(LeafFieldSelections);
        validate_rule!(FieldSelections);
        validate_rule!(ArgumentNames);
        validate_rule!(RequiredArguments);
        validate_rule!(FragmentSpreadTypeExistence);
        validate_rule!(FragmentsOnCompositeTypes);
        validate_rule!(FragmentSpreadIsPossible);
        validate_rule!(DirectivesAreDefined);
        validate_rule!(DirectivesAreInValidLocations);
        validate_rule!(VariablesAreInputTypes);
        validate_rule!(InputObjectFieldNames);
        validate_rule!(InputObjectRequiredFields);

        if all_errors.is_empty() { Ok(()) } else { Err(all_errors) }
    }

    pub fn validate(&self) -> Result<(), MearieError> {
        for document in self.documents() {
            macro_rules! validate_rule {
                ($rule:ty) => {
                    document.validate::<$rule>(self)?
                };
            }

            // Operation rules
            validate_rule!(OperationNameUniqueness);
            validate_rule!(LoneAnonymousOperation);
            validate_rule!(SubscriptionSingleRootField);

            // Argument rules
            validate_rule!(ArgumentUniqueness);

            // Fragment rules
            validate_rule!(FragmentNameUniqueness);
            validate_rule!(FragmentSpreadTargetDefined);
            validate_rule!(NoFragmentCycles);

            // Variable rules
            validate_rule!(VariableUniqueness);
            validate_rule!(AllVariableUsesDefined);
            validate_rule!(AllVariablesUsed);

            // Input object rules
            validate_rule!(InputObjectFieldUniqueness);

            // Directive rules
            validate_rule!(DirectivesAreUniquePerLocation);

            // Schema-aware rules
            validate_rule!(LeafFieldSelections);
            validate_rule!(FieldSelections);
            validate_rule!(ArgumentNames);
            validate_rule!(RequiredArguments);
            validate_rule!(FragmentSpreadTypeExistence);
            validate_rule!(FragmentsOnCompositeTypes);
            validate_rule!(FragmentSpreadIsPossible);
            validate_rule!(DirectivesAreDefined);
            validate_rule!(DirectivesAreInValidLocations);
            validate_rule!(VariablesAreInputTypes);
            validate_rule!(InputObjectFieldNames);
            validate_rule!(InputObjectRequiredFields);
        }

        Ok(())
    }
}

impl<'a> SchemaProvider<'a> for Registry<'a> {
    fn get_field_type(&self, type_name: &str, field_name: &str) -> Option<&'a Type<'a>> {
        self.get_field_type(type_name, field_name).ok()
    }

    fn get_field_definition(&self, type_name: &str, field_name: &str) -> Option<&'a FieldDefinition<'a>> {
        self.get_field_definition(type_name, field_name).ok()
    }

    fn get_input_object_definition(&self, type_name: &str) -> Option<&'a InputObjectTypeDefinition<'a>> {
        match self.get_type(type_name) {
            Ok(GraphQLType::InputObject(input_obj)) => Some(input_obj),
            _ => None,
        }
    }

    fn get_possible_types(&self, type_name: &str) -> Vec<&'a str> {
        self.get_possible_types(type_name)
    }

    fn get_fragment(&self, name: &str) -> Option<&'a FragmentDefinition<'a>> {
        self.get_fragment(name)
    }

    fn get_custom_directive(&self, name: &str) -> Option<&'a DirectiveDefinition<'a>> {
        self.get_custom_directive(name)
    }

    fn is_scalar(&self, name: &str) -> bool {
        self.is_scalar(name)
    }

    fn is_enum_type(&self, name: &str) -> bool {
        self.is_enum_type(name)
    }

    fn is_input_type(&self, name: &str) -> bool {
        self.is_scalar(name)
            || self.is_enum_type(name)
            || matches!(self.get_type(name), Ok(GraphQLType::InputObject(_)))
    }

    fn is_composite_type(&self, name: &str) -> bool {
        self.is_object_type(name) || self.is_interface_type(name) || self.is_union_type(name)
    }

    fn has_type(&self, name: &str) -> bool {
        self.get_type(name).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::Document;
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::span::Source;
    use assertables::*;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    // Type registry tests (from SchemaRegistry)
    #[test]
    fn test_registry_new() {
        let registry = Registry::new();
        assert_eq!(registry.types.len(), 0);
        assert_eq!(registry.fragments.len(), 0);
        assert_eq!(registry.custom_scalars().len(), 0);
    }

    #[test]
    fn test_from_schema_with_single_type() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert_eq!(registry.types.len(), 1);
        assert_ok!(&registry.get_type("User"));
    }

    #[test]
    fn test_from_schema_with_multiple_types() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String!
            }

            type Post {
                id: ID!
                name: String
                title: String!
            }

            enum Status {
                ACTIVE
                INACTIVE
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert_eq!(registry.types.len(), 3);
        assert_ok!(&registry.get_type("User"));
        assert_ok!(&registry.get_type("Post"));
        assert_ok!(&registry.get_type("Status"));
    }

    #[test]
    fn test_get_type_not_found() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let result = registry.get_type("NonExistent");
        assert_matches!(
            result,
            Err(MearieError {
                kind: ErrorKind::TypeNotFound { .. },
                ..
            })
        );
    }

    #[test]
    fn test_get_field_type_success() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String!
                email: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let field_type = registry.get_field_type("User", "name");
        assert_ok!(&field_type);
    }

    #[test]
    fn test_get_field_type_field_not_found() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let result = registry.get_field_type("User", "nonexistent");
        assert_matches!(
            result,
            Err(MearieError {
                kind: ErrorKind::FieldNotFound { .. },
                ..
            })
        );
    }

    #[test]
    fn test_get_field_type_type_not_found() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let result = registry.get_field_type("NonExistent", "id");
        assert_matches!(
            result,
            Err(MearieError {
                kind: ErrorKind::TypeNotFound { .. },
                ..
            })
        );
    }

    #[test]
    fn test_is_object_type_true() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(registry.is_object_type("User"));
    }

    #[test]
    fn test_is_object_type_false() {
        let schema = r#"
            enum Status {
                ACTIVE
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(!registry.is_object_type("Status"));
    }

    #[test]
    fn test_is_interface_type_true() {
        let schema = r#"
            interface Node {
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(registry.is_interface_type("Node"));
    }

    #[test]
    fn test_is_interface_type_false() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(!registry.is_interface_type("User"));
    }

    #[test]
    fn test_is_union_type_true() {
        let schema = r#"
            union SearchResult = User | Post
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(registry.is_union_type("SearchResult"));
    }

    #[test]
    fn test_is_union_type_false() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(!registry.is_union_type("User"));
    }

    #[test]
    fn test_is_enum_type_true() {
        let schema = r#"
            enum Status {
                ACTIVE
                INACTIVE
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(registry.is_enum_type("Status"));
    }

    #[test]
    fn test_is_enum_type_false() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(!registry.is_enum_type("User"));
    }

    #[test]
    fn test_get_possible_types_for_union() {
        let schema = r#"
            union SearchResult = User | Post | Comment
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let types = registry.get_possible_types("SearchResult");
        assert_eq!(types.len(), 3);
        assert_contains!(types, &"User");
        assert_contains!(types, &"Post");
        assert_contains!(types, &"Comment");
    }

    #[test]
    fn test_get_possible_types_for_interface() {
        let schema = r#"
            interface Node {
                id: ID!
                name: String
            }

            type User implements Node {
                id: ID!
                name: String!
            }

            type Post implements Node {
                id: ID!
                name: String
                title: String!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let types = registry.get_possible_types("Node");
        assert_eq!(types.len(), 2);
        assert_contains!(types, &"User");
        assert_contains!(types, &"Post");
    }

    #[test]
    fn test_get_possible_types_for_non_abstract_type() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let types = registry.get_possible_types("User");
        assert_eq!(types.len(), 0);
    }

    #[test]
    fn test_get_object_fields_success() {
        let schema = r#"
            type User {
                name: String!
                email: String
                id: ID!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let fields = registry.get_object_fields("User");
        assert_ok!(&fields);
        assert_eq!(fields.unwrap().len(), 3);
    }

    #[test]
    fn test_get_object_fields_for_enum() {
        let schema = r#"
            enum Status {
                ACTIVE
                INACTIVE
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let result = registry.get_object_fields("Status");
        assert_matches!(
            result,
            Err(MearieError {
                kind: ErrorKind::InvalidType { .. },
                ..
            })
        );
    }

    #[test]
    fn test_register_scalar_type() {
        let schema = r#"
            scalar DateTime
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert_eq!(registry.types.len(), 1);
        let type_ = registry.get_type("DateTime");
        assert_matches!(type_, Ok(GraphQLType::Scalar(_)));
    }

    #[test]
    fn test_register_input_object_type() {
        let schema = r#"
            input CreateUserInput {
                name: String!
                email: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert_eq!(registry.types.len(), 1);
        let type_ = registry.get_type("CreateUserInput");
        assert_matches!(type_, Ok(GraphQLType::InputObject(_)));
    }

    // Fragment tests (from FragmentResolver)
    #[test]
    fn test_from_documents_with_single_fragment() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                email
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        assert_eq!(registry.fragments.len(), 1);
        assert!(registry.get_fragment("UserFields").is_some());
    }

    #[test]
    fn test_from_documents_with_multiple_fragments() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
            type Post {
                id: ID!
                name: String
                title: String
            }
            type Comment {
                id: ID!
                name: String
                text: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }

            fragment PostFields on Post {
                id
                title
            }

            fragment CommentFields on Comment {
                id
                text
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        assert_eq!(registry.fragments.len(), 3);
        assert!(registry.get_fragment("UserFields").is_some());
        assert!(registry.get_fragment("PostFields").is_some());
        assert!(registry.get_fragment("CommentFields").is_some());
    }

    #[test]
    fn test_get_fragment_existing() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        let fragment = registry.get_fragment("UserFields");
        assert_some!(fragment);
        let fragment = fragment.unwrap();
        assert_eq!(fragment.name.as_str(), "UserFields");
        assert_eq!(fragment.type_condition.as_str(), "User");
    }

    #[test]
    fn test_get_fragment_non_existing() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        let fragment = registry.get_fragment("NonExistent");
        assert_none!(fragment);
    }

    #[test]
    fn test_get_fragment_returns_some_when_exists() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        assert!(registry.get_fragment("UserFields").is_some());
    }

    #[test]
    fn test_get_fragment_returns_none_when_not_exists() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        assert!(registry.get_fragment("NonExistent").is_none());
    }

    #[test]
    fn test_from_documents_with_no_fragments() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }

            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        assert_eq!(registry.fragments.len(), 0);
    }

    #[test]
    fn test_from_documents_with_mixed_definitions() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }

            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let operations = r#"
            fragment UserFields on User {
                id
                name
            }

            query GetUser($id: ID!) {
                user(id: $id) {
                    ...UserFields
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let ops_source = parse_source(operations);
        let schema_doc = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let ops_doc = Document::parse(&graphql_ctx, &ops_source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(schema_doc);
        registry.load_document(ops_doc).unwrap();

        assert_eq!(registry.fragments.len(), 1);
        assert!(registry.get_fragment("UserFields").is_some());
    }

    // Custom scalar tests
    #[test]
    fn test_custom_scalars_extraction() {
        let schema = r#"
            scalar DateTime
            scalar JSON
            scalar URL

            type User {
                name: String
                email: String
                id: ID!
                name: String
                createdAt: DateTime!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        let scalars = registry.custom_scalars();
        assert_eq!(scalars.len(), 3);
        assert_contains!(scalars, &"DateTime");
        assert_contains!(scalars, &"JSON");
        assert_contains!(scalars, &"URL");
    }

    #[test]
    fn test_has_custom_scalar() {
        let schema = r#"
            scalar DateTime

            type User {
                name: String
                email: String
                id: ID!
                name: String
                createdAt: DateTime!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(registry.has_custom_scalar("DateTime"));
        assert!(!registry.has_custom_scalar("JSON"));
    }

    #[test]
    fn test_is_scalar_built_in() {
        let registry = Registry::new();

        assert!(registry.is_scalar("ID"));
        assert!(registry.is_scalar("String"));
        assert!(registry.is_scalar("Int"));
        assert!(registry.is_scalar("Float"));
        assert!(registry.is_scalar("Boolean"));
    }

    #[test]
    fn test_is_scalar_custom() {
        let schema = r#"
            scalar DateTime
            scalar JSON

            type User {
                name: String
                email: String
                id: ID!
                name: String
                createdAt: DateTime!
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(registry.is_scalar("DateTime"));
        assert!(registry.is_scalar("JSON"));
        assert!(registry.is_scalar("ID"));
        assert!(registry.is_scalar("String"));
    }

    #[test]
    fn test_is_scalar_not_scalar() {
        let schema = r#"
            type User {
                name: String
                email: String
                id: ID!
                name: String
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let source = parse_source(schema);
        let document = Document::parse(&graphql_ctx, &source).unwrap();
        let mut registry = Registry::new();
        registry.load_schema(document);

        assert!(!registry.is_scalar("User"));
        assert!(!registry.is_scalar("NonExistent"));
        assert!(!registry.is_scalar(""));
    }
}
