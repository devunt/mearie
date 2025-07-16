use crate::{parser::lexer::TokenKind, span::Location};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Clone)]
#[error("{kind}")]
pub struct MearieError {
    pub kind: ErrorKind,
    pub location: Option<Location>,
}

impl Serialize for MearieError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct SerializableError<'a> {
            message: String,
            #[serde(flatten)]
            kind: &'a ErrorKind,
            #[serde(skip_serializing_if = "Option::is_none")]
            location: &'a Option<Location>,
        }

        SerializableError {
            message: self.to_string(),
            kind: &self.kind,
            location: &self.location,
        }
        .serialize(serializer)
    }
}

#[derive(Debug, Error, Serialize, Clone)]
#[serde(tag = "type")]
pub enum ErrorKind {
    #[error("Failed to parse JavaScript/TypeScript: {message}")]
    JavaScriptParseError { message: String },

    #[error("Template literal contains interpolation which is not allowed in GraphQL")]
    InterpolationNotAllowed,

    #[error("graphql() function must use template literal (backticks), not string literal (quotes)")]
    StringLiteralNotAllowed,

    #[error("unexpected token: expected {expected}, found {found}")]
    UnexpectedToken { expected: &'static str, found: TokenKind },

    #[error("unexpected end of input: expected {expected}")]
    UnexpectedEof { expected: &'static str },

    #[error("invalid token")]
    InvalidToken,

    #[error("invalid syntax: {message}")]
    InvalidSyntax { message: &'static str },

    #[error("Type '{name}' not found in schema")]
    TypeNotFound { name: String },

    #[error("Field '{field}' not found in type '{type_name}'")]
    FieldNotFound { type_name: String, field: String },

    #[error("Fragment '{name}' not found")]
    FragmentNotFound { name: String },

    #[error("Invalid GraphQL type: {message}")]
    InvalidType { message: String },

    #[error("Empty selection set for field '{field}'")]
    EmptySelectionSet { field: String },

    #[error("Schema registry error: {message}")]
    SchemaRegistryError { message: String },

    #[error("Cannot resolve type for selection")]
    TypeResolutionError,

    #[error("Invalid operation: {message}")]
    InvalidOperation { message: String },

    #[error("Unknown argument '{arg}' on field '{field}' of type '{type_name}'")]
    UnknownArgument {
        type_name: String,
        field: String,
        arg: String,
    },

    #[error("Required argument '{arg}' on field '{field}' of type '{type_name}' is missing")]
    MissingRequiredArgument {
        type_name: String,
        field: String,
        arg: String,
    },

    #[error("{message}")]
    ValidationError { message: String },
}
