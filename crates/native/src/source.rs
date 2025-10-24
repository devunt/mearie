use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "napi", napi_derive::napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceBuf {
    pub code: String,
    pub file_path: String,
    pub start_line: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Source<'a> {
    pub code: &'a str,
    pub file_path: &'a str,
    pub start_line: u32,
}

impl<'a> Source<'a> {
    pub fn ephemeral(code: &'a str) -> Self {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }
}

impl<'a> From<&'a SourceBuf> for Source<'a> {
    fn from(owned: &'a SourceBuf) -> Self {
        Source {
            code: &owned.code,
            file_path: &owned.file_path,
            start_line: owned.start_line,
        }
    }
}
