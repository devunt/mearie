use super::types::{ArgumentName, DirectiveName};
use super::values::Value;
use crate::error::location::Span;
use bumpalo::collections::Vec;

/// Represents a GraphQL directive with its name and arguments.
#[derive(Debug, Clone, PartialEq)]
pub struct Directive<'a> {
    pub span: Span,
    pub name: DirectiveName<'a>,
    pub arguments: Vec<'a, Argument<'a>>,
}

impl<'a> Directive<'a> {
    /// Gets the value of an argument by name.
    pub fn get_argument(&self, name: &str) -> Option<&Value<'a>> {
        self.arguments.iter().find(|arg| arg.name == name).map(|arg| &arg.value)
    }

    /// Returns true if this directive has an argument with the given name.
    #[inline]
    pub fn has_argument(&self, name: &str) -> bool {
        self.arguments.iter().any(|arg| arg.name == name)
    }
}

/// Represents an argument in a directive or field.
#[derive(Debug, Clone, PartialEq)]
pub struct Argument<'a> {
    pub span: Span,
    pub name: ArgumentName<'a>,
    pub value: Value<'a>,
}

/// Represents the locations where a directive can be applied in a GraphQL schema.
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
