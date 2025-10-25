use super::common::Name;
use super::types::ArgumentName;
use bumpalo::collections::Vec;

/// Represents a GraphQL value, which can be a variable reference, literal, or composite structure.
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

/// Represents a field in a GraphQL object value.
#[derive(Debug, Clone, PartialEq)]
pub struct ObjectField<'a> {
    pub name: ArgumentName<'a>,
    pub value: Value<'a>,
}
