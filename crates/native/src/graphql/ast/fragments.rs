use super::directives::Directive;
use super::operations::{SelectionSet, VariableDefinition};
use super::types::{FragmentName, TypeName};
use crate::error::location::Span;
use bumpalo::collections::Vec;

/// Represents a GraphQL fragment definition.
#[derive(Debug, Clone, PartialEq)]
pub struct FragmentDefinition<'a> {
    pub span: Span,
    pub name: FragmentName<'a>,
    pub variable_definitions: Vec<'a, VariableDefinition<'a>>,
    pub type_condition: TypeName<'a>,
    pub directives: Vec<'a, Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

impl<'a> FragmentDefinition<'a> {
    /// Returns true if this fragment applies to the given type name.
    #[inline]
    pub fn applies_to(&self, type_name: TypeName<'a>) -> bool {
        self.type_condition == type_name
    }
}
