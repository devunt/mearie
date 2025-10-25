pub mod location;

pub use location::{Location, Span};

use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Extraction,
    Parse,
    Validation,
    Codegen,
}

#[derive(Debug, Clone)]
struct ErrorInner {
    message: String,
    location: Option<Location>,
    stage: Stage,
}

#[derive(Debug, Clone)]
pub struct MearieError {
    inner: Box<ErrorInner>,
}

impl MearieError {
    pub fn extraction(message: impl Into<String>) -> Self {
        Self {
            inner: Box::new(ErrorInner {
                message: message.into(),
                location: None,
                stage: Stage::Extraction,
            }),
        }
    }

    pub fn parse(message: impl Into<String>) -> Self {
        Self {
            inner: Box::new(ErrorInner {
                message: message.into(),
                location: None,
                stage: Stage::Parse,
            }),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            inner: Box::new(ErrorInner {
                message: message.into(),
                location: None,
                stage: Stage::Validation,
            }),
        }
    }

    pub fn codegen(message: impl Into<String>) -> Self {
        Self {
            inner: Box::new(ErrorInner {
                message: message.into(),
                location: None,
                stage: Stage::Codegen,
            }),
        }
    }

    pub fn at(mut self, location: Location) -> Self {
        self.inner.location = Some(location);
        self
    }

    pub fn at_opt(mut self, location: Option<Location>) -> Self {
        self.inner.location = location;
        self
    }

    pub fn location(&self) -> Option<&Location> {
        self.inner.location.as_ref()
    }

    pub fn message(&self) -> &str {
        &self.inner.message
    }

    pub fn stage(&self) -> Stage {
        self.inner.stage
    }
}

impl fmt::Display for MearieError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.inner.message)
    }
}

impl std::error::Error for MearieError {}

impl Serialize for MearieError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct SerializableError<'a> {
            message: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            location: &'a Option<Location>,
            stage: Stage,
        }

        SerializableError {
            message: &self.inner.message,
            location: &self.inner.location,
            stage: self.inner.stage,
        }
        .serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, MearieError>;
