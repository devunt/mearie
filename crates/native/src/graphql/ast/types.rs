use super::common::Name;
use std::fmt;
use std::ops::Deref;

/// A type-safe wrapper for GraphQL type names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TypeName<'a>(Name<'a>);

/// A type-safe wrapper for GraphQL field names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FieldName<'a>(Name<'a>);

/// A type-safe wrapper for GraphQL argument names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ArgumentName<'a>(Name<'a>);

/// A type-safe wrapper for GraphQL variable names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct VariableName<'a>(Name<'a>);

/// A type-safe wrapper for GraphQL directive names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DirectiveName<'a>(Name<'a>);

/// A type-safe wrapper for GraphQL fragment names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FragmentName<'a>(Name<'a>);

macro_rules! impl_name_newtype {
    ($type:ident) => {
        impl<'a> $type<'a> {
            /// Creates a new instance from a Name.
            #[inline]
            pub const fn new(name: Name<'a>) -> Self {
                Self(name)
            }

            /// Returns the underlying Name.
            #[inline]
            pub const fn as_name(self) -> Name<'a> {
                self.0
            }

            /// Returns the underlying string slice.
            #[inline]
            pub fn as_str(self) -> &'a str {
                self.0.as_str()
            }
        }

        impl<'a> From<Name<'a>> for $type<'a> {
            #[inline]
            fn from(name: Name<'a>) -> Self {
                Self(name)
            }
        }

        impl<'a> From<&'a str> for $type<'a> {
            #[inline]
            fn from(s: &'a str) -> Self {
                Self(Name::new(s))
            }
        }

        impl<'a> Deref for $type<'a> {
            type Target = str;

            #[inline]
            fn deref(&self) -> &Self::Target {
                self.0.as_str()
            }
        }

        impl<'a> PartialEq<str> for $type<'a> {
            #[inline]
            fn eq(&self, other: &str) -> bool {
                self.as_str() == other
            }
        }

        impl<'a> PartialEq<&str> for $type<'a> {
            #[inline]
            fn eq(&self, other: &&str) -> bool {
                self.as_str() == *other
            }
        }

        impl<'a> fmt::Display for $type<'a> {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }
    };
}

impl_name_newtype!(TypeName);
impl_name_newtype!(FieldName);
impl_name_newtype!(ArgumentName);
impl_name_newtype!(VariableName);
impl_name_newtype!(DirectiveName);
impl_name_newtype!(FragmentName);

/// Represents a GraphQL type reference, including named types, lists, and non-null types.
#[derive(Debug, Clone, PartialEq)]
pub enum Type<'a> {
    Named(NamedType<'a>),
    List(&'a Type<'a>),
    NonNull(&'a NonNullType<'a>),
}

impl<'a> Type<'a> {
    /// Returns true if this type is nullable.
    #[inline]
    pub fn is_nullable(&self) -> bool {
        !matches!(self, Type::NonNull(_))
    }

    /// Returns the innermost named type, unwrapping all list and non-null wrappers.
    pub fn innermost_type(&self) -> TypeName<'a> {
        match self {
            Type::Named(n) => n.name,
            Type::List(t) => t.innermost_type(),
            Type::NonNull(nn) => match nn {
                NonNullType::Named(n) => n.name,
                NonNullType::List(t) => t.innermost_type(),
            },
        }
    }
}

/// Represents a named GraphQL type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NamedType<'a> {
    pub name: TypeName<'a>,
}

impl<'a> NamedType<'a> {
    /// Creates a new NamedType with the given type name.
    #[inline]
    pub const fn new(name: TypeName<'a>) -> Self {
        Self { name }
    }
}

/// Represents a non-null GraphQL type, which can wrap either a named type or a list.
#[derive(Debug, Clone, PartialEq)]
pub enum NonNullType<'a> {
    Named(NamedType<'a>),
    List(&'a Type<'a>),
}
