use serde::Serialize;

use crate::source::Source;

#[cfg_attr(feature = "napi", napi_derive::napi(object))]
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Location {
    pub file_path: String,
    pub line: u32,
    pub column: Option<u32>,
}

impl Location {
    #[inline]
    pub const fn empty() -> Self {
        Self {
            file_path: String::new(),
            line: 0,
            column: None,
        }
    }

    pub fn from_span(source: &Source, span: Span) -> Self {
        let (line, column) = Self::calculate_position(source.code, span.start);

        Self {
            file_path: source.file_path.to_string(),
            line: source.start_line + line as u32 - 1,
            column: Some(column as u32),
        }
    }

    fn calculate_position(code: &str, pos: usize) -> (usize, usize) {
        let mut line = 1;
        let mut column = 1;

        for (idx, ch) in code.char_indices() {
            if idx >= pos {
                break;
            }
            if ch == '\n' {
                line += 1;
                column = 1;
            } else {
                column += 1;
            }
        }

        (line, column)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

impl Span {
    #[inline]
    pub const fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    #[inline]
    pub const fn empty() -> Self {
        Self { start: 0, end: 0 }
    }
}

impl From<std::ops::Range<usize>> for Span {
    #[inline]
    fn from(range: std::ops::Range<usize>) -> Self {
        Self {
            start: range.start,
            end: range.end,
        }
    }
}
