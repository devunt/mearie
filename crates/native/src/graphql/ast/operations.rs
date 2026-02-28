use super::common::Name;
use super::directives::{Argument, Directive};
use super::types::{FieldName, Type, VariableName};
use super::values::Value;
use crate::error::location::Span;
use bumpalo::collections::Vec;

/// Represents a GraphQL operation definition (query, mutation, or subscription).
#[derive(Debug, Clone, PartialEq)]
pub struct OperationDefinition<'a> {
    pub span: Span,
    pub operation_type: OperationType,
    pub name: Option<Name<'a>>,
    pub variable_definitions: Vec<'a, VariableDefinition<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

impl<'a> OperationDefinition<'a> {
    /// Returns true if this is an anonymous operation.
    #[inline]
    pub fn is_anonymous(&self) -> bool {
        self.name.is_none()
    }

    /// Returns the operation type as a string literal.
    #[inline]
    pub fn kind_str(&self) -> &'static str {
        match self.operation_type {
            OperationType::Query => "query",
            OperationType::Mutation => "mutation",
            OperationType::Subscription => "subscription",
        }
    }
}

/// Represents the type of a GraphQL operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OperationType {
    Query,
    Mutation,
    Subscription,
}

/// Represents a variable definition in a GraphQL operation.
#[derive(Debug, Clone, PartialEq)]
pub struct VariableDefinition<'a> {
    pub span: Span,
    pub variable: VariableName<'a>,
    pub typ: Type<'a>,
    pub default_value: Option<Value<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents a set of GraphQL selections.
#[derive(Debug, Clone, PartialEq)]
pub struct SelectionSet<'a> {
    pub selections: Vec<'a, Selection<'a>>,
}

impl<'a> SelectionSet<'a> {
    /// Returns true if this selection set has no selections.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.selections.is_empty()
    }

    /// Returns an iterator over all fields in this selection set.
    pub fn fields(&self) -> impl Iterator<Item = &Field<'a>> {
        self.selections.iter().filter_map(|s| match s {
            Selection::Field(f) => Some(f),
            _ => None,
        })
    }

    /// Returns an iterator over all fragment spreads in this selection set.
    pub fn fragments(&self) -> impl Iterator<Item = &FragmentSpread<'a>> {
        self.selections.iter().filter_map(|s| match s {
            Selection::FragmentSpread(fs) => Some(fs),
            _ => None,
        })
    }
}

/// Represents a GraphQL selection, which can be a field, fragment spread, or inline fragment.
#[derive(Debug, Clone, PartialEq)]
pub enum Selection<'a> {
    Field(Field<'a>),
    FragmentSpread(FragmentSpread<'a>),
    InlineFragment(InlineFragment<'a>),
}

/// Represents a GraphQL field selection.
#[derive(Debug, Clone, PartialEq)]
pub struct Field<'a> {
    pub span: Span,
    pub alias: Option<FieldName<'a>>,
    pub name: FieldName<'a>,
    pub arguments: Vec<'a, Argument<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

impl<'a> Field<'a> {
    /// Returns the alias if present, otherwise returns the field name.
    #[inline]
    pub fn alias_or_name(&self) -> FieldName<'a> {
        self.alias.unwrap_or(self.name)
    }
}

/// Represents a fragment spread in a GraphQL selection.
#[derive(Debug, Clone, PartialEq)]
pub struct FragmentSpread<'a> {
    pub span: Span,
    pub fragment_name: super::types::FragmentName<'a>,
    pub arguments: Vec<'a, Argument<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
}

/// Represents an inline fragment in a GraphQL selection.
#[derive(Debug, Clone, PartialEq)]
pub struct InlineFragment<'a> {
    pub span: Span,
    pub type_condition: Option<super::types::TypeName<'a>>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}
