use crate::span::*;
use bumpalo::collections::Vec;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Name<'a>(&'a str);

impl<'a> Name<'a> {
    #[inline]
    pub const fn new(value: &'a str) -> Self {
        Self(value)
    }

    #[inline]
    pub const fn as_str(self) -> &'a str {
        self.0
    }
}

impl<'a> From<&'a str> for Name<'a> {
    #[inline]
    fn from(s: &'a str) -> Self {
        Self::new(s)
    }
}

impl<'a> std::ops::Deref for Name<'a> {
    type Target = str;

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl<'a> std::fmt::Display for Name<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}

impl<'a> PartialEq<str> for Name<'a> {
    #[inline]
    fn eq(&self, other: &str) -> bool {
        self.0 == other
    }
}

impl<'a> PartialEq<&str> for Name<'a> {
    #[inline]
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value<'a> {
    Variable(Name<'a>),
    Int(&'a str),
    Float(&'a str),
    String(&'a str),
    Boolean(bool),
    Null,
    Enum(Name<'a>),
    List(Vec<'a, Value<'a>>),
    Object(Vec<'a, ObjectField<'a>>),
}

#[allow(dead_code)]
impl<'a> Value<'a> {
    #[inline]
    pub fn as_string(&self) -> Option<&'a str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    #[inline]
    pub fn as_int(&self) -> Option<Result<i64, std::num::ParseIntError>> {
        match self {
            Value::Int(s) => Some(s.parse()),
            _ => None,
        }
    }

    #[inline]
    pub fn as_float(&self) -> Option<Result<f64, std::num::ParseFloatError>> {
        match self {
            Value::Float(s) => Some(s.parse()),
            _ => None,
        }
    }

    #[inline]
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    #[inline]
    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectField<'a> {
    pub name: Name<'a>,
    pub value: Value<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Type<'a> {
    Named(NamedType<'a>),
    List(&'a Type<'a>),
    NonNull(&'a NonNullType<'a>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NamedType<'a> {
    pub name: &'a str,
}

impl<'a> NamedType<'a> {
    #[inline]
    pub const fn new(name: &'a str) -> Self {
        Self { name }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum NonNullType<'a> {
    Named(NamedType<'a>),
    List(&'a Type<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Directive<'a> {
    pub span: Span,
    pub name: Name<'a>,
    pub arguments: Vec<'a, Argument<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Argument<'a> {
    pub span: Span,
    pub name: Name<'a>,
    pub value: Value<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Description<'a> {
    pub value: &'a str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OperationDefinition<'a> {
    pub span: Span,
    pub operation_type: OperationType,
    pub name: Option<Name<'a>>,
    pub variable_definitions: Vec<'a, VariableDefinition<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OperationType {
    Query,
    Mutation,
    Subscription,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VariableDefinition<'a> {
    pub span: Span,
    pub variable: Name<'a>,
    pub typ: Type<'a>,
    pub default_value: Option<Value<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectionSet<'a> {
    pub selections: Vec<'a, Selection<'a>>,
}

impl<'a> SelectionSet<'a> {
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.selections.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Selection<'a> {
    Field(Field<'a>),
    FragmentSpread(FragmentSpread<'a>),
    InlineFragment(InlineFragment<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field<'a> {
    pub span: Span,
    pub alias: Option<Name<'a>>,
    pub name: Name<'a>,
    pub arguments: Vec<'a, Argument<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

impl<'a> Field<'a> {
    #[inline]
    pub fn alias_or_name(&self) -> Name<'a> {
        self.alias.unwrap_or(self.name)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentSpread<'a> {
    pub span: Span,
    pub fragment_name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InlineFragment<'a> {
    pub span: Span,
    pub type_condition: Option<Name<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentDefinition<'a> {
    pub span: Span,
    pub name: Name<'a>,
    pub type_condition: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SchemaDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub query: Option<Name<'a>>,
    pub mutation: Option<Name<'a>>,
    pub subscription: Option<Name<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SchemaExtension<'a> {
    pub directives: Vec<'a, Directive<'a>>,
    pub query: Option<Name<'a>>,
    pub mutation: Option<Name<'a>>,
    pub subscription: Option<Name<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeDefinition<'a> {
    Scalar(ScalarTypeDefinition<'a>),
    Object(ObjectTypeDefinition<'a>),
    Interface(InterfaceTypeDefinition<'a>),
    Union(UnionTypeDefinition<'a>),
    Enum(EnumTypeDefinition<'a>),
    InputObject(InputObjectTypeDefinition<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeExtension<'a> {
    Scalar(ScalarTypeExtension<'a>),
    Object(ObjectTypeExtension<'a>),
    Interface(InterfaceTypeExtension<'a>),
    Union(UnionTypeExtension<'a>),
    Enum(EnumTypeExtension<'a>),
    InputObject(InputObjectTypeExtension<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScalarTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScalarTypeExtension<'a> {
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub implements: Vec<'a, Name<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeExtension<'a> {
    pub name: Name<'a>,
    pub implements: Vec<'a, Name<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FieldDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub arguments: Vec<'a, InputValueDefinition<'a>>,
    pub typ: Type<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputValueDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub typ: Type<'a>,
    pub default_value: Option<Value<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub implements: Vec<'a, Name<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceTypeExtension<'a> {
    pub name: Name<'a>,
    pub implements: Vec<'a, Name<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, FieldDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnionTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub members: Vec<'a, Name<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnionTypeExtension<'a> {
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub members: Vec<'a, Name<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub values: Vec<'a, EnumValueDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumTypeExtension<'a> {
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub values: Vec<'a, EnumValueDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumValueDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub value: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectTypeDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, InputValueDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectTypeExtension<'a> {
    pub name: Name<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub fields: Vec<'a, InputValueDefinition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DirectiveDefinition<'a> {
    pub description: Option<Description<'a>>,
    pub name: Name<'a>,
    pub arguments: Vec<'a, InputValueDefinition<'a>>,
    pub repeatable: bool,
    pub locations: Vec<'a, DirectiveLocation>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DirectiveLocation {
    Query,
    Mutation,
    Subscription,
    Field,
    FragmentDefinition,
    FragmentSpread,
    InlineFragment,
    VariableDefinition,
    Schema,
    Scalar,
    Object,
    FieldDefinition,
    ArgumentDefinition,
    Interface,
    Union,
    Enum,
    EnumValue,
    InputObject,
    InputFieldDefinition,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Document<'a> {
    pub source: &'a Source<'a>,
    pub definitions: Vec<'a, Definition<'a>>,
}

impl<'a> Document<'a> {
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.definitions.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Definition<'a> {
    Executable(ExecutableDefinition<'a>),
    TypeSystem(TypeSystemDefinition<'a>),
    TypeSystemExtension(TypeSystemExtension<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExecutableDefinition<'a> {
    Operation(OperationDefinition<'a>),
    Fragment(FragmentDefinition<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeSystemDefinition<'a> {
    Schema(SchemaDefinition<'a>),
    Type(TypeDefinition<'a>),
    Directive(DirectiveDefinition<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeSystemExtension<'a> {
    Schema(SchemaExtension<'a>),
    Type(TypeExtension<'a>),
}
