use std::fmt;
use std::ops::Deref;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Name<'a>(&'a str);

impl<'a> Name<'a> {
    /// Creates a new Name from a string slice.
    #[inline]
    pub const fn new(value: &'a str) -> Self {
        Self(value)
    }

    /// Returns the underlying string slice.
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

impl<'a> Deref for Name<'a> {
    type Target = str;

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl<'a> fmt::Display for Name<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
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

/// Represents a GraphQL description string that can be attached to various definitions.
#[derive(Debug, Clone, PartialEq)]
pub struct Description<'a> {
    pub value: &'a str,
}
