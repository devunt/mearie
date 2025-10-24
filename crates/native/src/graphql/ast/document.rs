use super::common::{Description, Name};
use super::directives::{Directive, DirectiveLocation};
use super::fragments::FragmentDefinition;
use super::operations::OperationDefinition;
use super::types::{Type, TypeName};
use super::values::Value;
use crate::source::Source;
use bumpalo::collections::Vec;

/// Represents a complete GraphQL document containing definitions.
#[derive(Debug, Clone, PartialEq)]
pub struct Document<'a> {
    pub source: &'a Source<'a>,
    pub definitions: Vec<'a, Definition<'a>>,
}

impl<'a> Document<'a> {
    /// Returns true if this document has no definitions.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.definitions.is_empty()
    }

    /// Returns an iterator over all operation definitions in this document.
    pub fn operations(&self) -> impl Iterator<Item = &OperationDefinition<'a>> {
        self.definitions.iter().filter_map(|def| match def {
            Definition::Executable(ExecutableDefinition::Operation(op)) => Some(op),
            _ => None,
        })
    }

    /// Returns an iterator over all fragment definitions in this document.
    pub fn fragments(&self) -> impl Iterator<Item = &FragmentDefinition<'a>> {
        self.definitions.iter().filter_map(|def| match def {
            Definition::Executable(ExecutableDefinition::Fragment(frag)) => Some(frag),
            _ => None,
        })
    }

    /// Finds a fragment definition by name.
    pub fn fragment_by_name(&self, name: super::types::FragmentName<'a>) -> Option<&FragmentDefinition<'a>> {
        self.fragments().find(|frag| frag.name == name)
    }

    /// Finds an operation definition by name.
    pub fn operation_by_name(&self, name: &str) -> Option<&OperationDefinition<'a>> {
        self.operations().find(|op| op.name.map(|n| n == name).unwrap_or(false))
    }

    /// Returns an iterator over all type definitions in this document.
    pub fn type_definitions(&self) -> impl Iterator<Item = &TypeDefinition<'a>> {
        self.definitions.iter().filter_map(|def| match def {
            Definition::TypeSystem(TypeSystemDefinition::Type(ty)) => Some(ty),
            _ => None,
        })
    }
}

/// Represents a top-level definition in a GraphQL document.
#[derive(Debug, Clone, PartialEq)]
pub enum Definition<'a> {
    Executable(ExecutableDefinition<'a>),
    TypeSystem(TypeSystemDefinition<'a>),
    TypeSystemExtension(TypeSystemExtension<'a>),
}

/// Represents an executable definition (operation or fragment).
#[derive(Debug, Clone, PartialEq)]
pub enum ExecutableDefinition<'a> {
    Operation(OperationDefinition<'a>),
    Fragment(FragmentDefinition<'a>),
}

/// Represents a type system definition.
#[derive(Debug, Clone, PartialEq)]
pub enum TypeSystemDefinition<'a> {
    Schema(SchemaDefinition<'a>),
    Type(TypeDefinition<'a>),
    Directive(DirectiveDefinition<'a>),
}

/// Represents a type system extension.
#[derive(Debug, Clone, PartialEq)]
pub enum TypeSystemExtension<'a> {
    Schema(SchemaExtension<'a>),
    Type(TypeExtension<'a>),
}

/// Represents a GraphQL schema definition.
#[derive(Debug, Clone, PartialEq)]
pub struct SchemaDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub query: Option<TypeName<'a>>,
    pub mutation: Option<TypeName<'a>>,
    pub subscription: Option<TypeName<'a>>,
}

/// Represents a schema extension.
#[derive(Debug, Clone, PartialEq)]
pub struct SchemaExtension<'a> {
    pub directives: Vec<'a, Directive<'a>>,
    pub query: Option<TypeName<'a>>,
    pub mutation: Option<TypeName<'a>>,
    pub subscription: Option<TypeName<'a>>,
}

/// Represents a type definition in a GraphQL schema.
#[derive(Debug, Clone, PartialEq)]
pub enum TypeDefinition<'a> {
    Scalar(ScalarTypeDefinition<'a>),
    Object(ObjectTypeDefinition<'a>),
    Interface(InterfaceTypeDefinition<'a>),
    Union(UnionTypeDefinition<'a>),
    Enum(EnumTypeDefinition<'a>),
    InputObject(InputObjectTypeDefinition<'a>),
}

/// Represents a type extension in a GraphQL schema.
#[derive(Debug, Clone, PartialEq)]
pub enum TypeExtension<'a> {
    Scalar(ScalarTypeExtension<'a>),
    Object(ObjectTypeExtension<'a>),
    Interface(InterfaceTypeExtension<'a>),
    Union(UnionTypeExtension<'a>),
    Enum(EnumTypeExtension<'a>),
    InputObject(InputObjectTypeExtension<'a>),
}

/// Represents a scalar type definition.
#[derive(Debug, Clone, PartialEq)]
pub struct ScalarTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents a scalar type extension.
#[derive(Debug, Clone, PartialEq)]
pub struct ScalarTypeExtension<'a> {
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents an object type definition.
#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: TypeName<'a>,
    pub implements: Vec<'a, TypeName<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

/// Represents an object type extension.
#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeExtension<'a> {
    pub name: TypeName<'a>,
    pub implements: Vec<'a, TypeName<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

/// Represents a field definition in an object or interface type.
#[derive(Debug, Clone, PartialEq)]
pub struct FieldDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: super::types::FieldName<'a>,
    pub arguments: Vec<'a, InputValueDefinition<'a>>,
    pub typ: Type<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents an input value definition (argument or input field).
#[derive(Debug, Clone, PartialEq)]
pub struct InputValueDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: super::types::ArgumentName<'a>,
    pub typ: Type<'a>,
    pub default_value: Option<Value<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents an interface type definition.
#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: TypeName<'a>,
    pub implements: Vec<'a, TypeName<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

/// Represents an interface type extension.
#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceTypeExtension<'a> {
    pub name: TypeName<'a>,
    pub implements: Vec<'a, TypeName<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

/// Represents a union type definition.
#[derive(Debug, Clone, PartialEq)]
pub struct UnionTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub members: Vec<'a, TypeName<'a>>,
}

/// Represents a union type extension.
#[derive(Debug, Clone, PartialEq)]
pub struct UnionTypeExtension<'a> {
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub members: Vec<'a, TypeName<'a>>,
}

/// Represents an enum type definition.
#[derive(Debug, Clone, PartialEq)]
pub struct EnumTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub values: Vec<'a, EnumValueDefinition<'a>>,
}

/// Represents an enum type extension.
#[derive(Debug, Clone, PartialEq)]
pub struct EnumTypeExtension<'a> {
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub values: Vec<'a, EnumValueDefinition<'a>>,
}

/// Represents an enum value definition.
#[derive(Debug, Clone, PartialEq)]
pub struct EnumValueDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub value: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents an input object type definition.
#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, InputValueDefinition<'a>>,
}

/// Represents an input object type extension.
#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectTypeExtension<'a> {
    pub name: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, InputValueDefinition<'a>>,
}

/// Represents a directive definition in a GraphQL schema.
#[derive(Debug, Clone, PartialEq)]
pub struct DirectiveDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: super::types::DirectiveName<'a>,
    pub arguments: Vec<'a, InputValueDefinition<'a>>,
    pub repeatable: bool,
    pub locations: Vec<'a, DirectiveLocation>,
}
