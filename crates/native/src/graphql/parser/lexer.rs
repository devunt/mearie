use logos::{Lexer, Logos};
use serde::Serialize;
use std::fmt;

fn parse_block_string<'a>(lex: &mut Lexer<'a, Token<'a>>) -> Option<&'a str> {
    let start = lex.span().start;
    let after_opening = lex.span().end;
    let remainder = lex.remainder();
    let bytes = remainder.as_bytes();

    let mut i = 0;
    let mut consecutive_quotes = 0;

    while i < bytes.len() {
        if bytes[i] == b'"' {
            consecutive_quotes += 1;
            i += 1;
        } else if bytes[i] == b'\\' && i + 1 < bytes.len() && bytes[i + 1] == b'"' {
            i += 2;
            consecutive_quotes = 0;
        } else {
            if consecutive_quotes >= 3 {
                let end = after_opening + i;
                lex.bump(i);
                return Some(&lex.source()[start..end]);
            }
            consecutive_quotes = 0;
            i += 1;
        }
    }

    if consecutive_quotes >= 3 {
        let end = after_opening + i;
        lex.bump(i);
        return Some(&lex.source()[start..end]);
    }

    None
}

#[derive(Logos, Debug, Clone, Copy, PartialEq, Eq)]
#[logos(skip r"[ \t\n\r,]+")]
#[logos(skip r"#[^\n]*")]
pub enum Token<'a> {
    #[token("!")]
    Bang,

    #[token("$")]
    Dollar,

    #[token("(")]
    ParenOpen,

    #[token(")")]
    ParenClose,

    #[token("...")]
    Spread,

    #[token(":")]
    Colon,

    #[token("=")]
    Equals,

    #[token("@")]
    At,

    #[token("[")]
    BracketOpen,

    #[token("]")]
    BracketClose,

    #[token("{")]
    BraceOpen,

    #[token("}")]
    BraceClose,

    #[token("|")]
    Pipe,

    #[token("&")]
    Ampersand,

    #[token("query")]
    Query,

    #[token("mutation")]
    Mutation,

    #[token("subscription")]
    Subscription,

    #[token("fragment")]
    Fragment,

    #[token("on")]
    On,

    #[token("type")]
    Type,

    #[token("interface")]
    Interface,

    #[token("union")]
    Union,

    #[token("enum")]
    Enum,

    #[token("input")]
    Input,

    #[token("scalar")]
    Scalar,

    #[token("schema")]
    Schema,

    #[token("extend")]
    Extend,

    #[token("implements")]
    Implements,

    #[token("directive")]
    Directive,

    #[token("repeatable")]
    Repeatable,

    #[token("null")]
    Null,

    #[token("true")]
    True,

    #[token("false")]
    False,

    #[regex(r"[_A-Za-z][_0-9A-Za-z]*", |lex| lex.slice())]
    Name(&'a str),

    #[regex(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+(?:[eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)", |lex| lex.slice())]
    FloatValue(&'a str),

    #[regex(r"-?(?:0|[1-9][0-9]*)", |lex| lex.slice())]
    IntValue(&'a str),

    // spell-checker:disable-next-line
    #[regex(r#""([^"\\]|\\["\\\/bfnrt]|\\u[0-9a-fA-F]{4})*""#, |lex| lex.slice())]
    StringValue(&'a str),

    #[token(r#"""""#, parse_block_string)]
    BlockStringValue(&'a str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum TokenKind {
    Bang,
    Dollar,
    ParenOpen,
    ParenClose,
    Spread,
    Colon,
    Equals,
    At,
    BracketOpen,
    BracketClose,
    BraceOpen,
    BraceClose,
    Pipe,
    Ampersand,
    Query,
    Mutation,
    Subscription,
    Fragment,
    On,
    Type,
    Interface,
    Union,
    Enum,
    Input,
    Scalar,
    Schema,
    Extend,
    Implements,
    Directive,
    Repeatable,
    Null,
    True,
    False,
    Name,
    IntValue,
    FloatValue,
    StringValue,
    Eof,
}

impl<'a> Token<'a> {
    #[inline]
    pub const fn kind(&self) -> TokenKind {
        match self {
            Self::Bang => TokenKind::Bang,
            Self::Dollar => TokenKind::Dollar,
            Self::ParenOpen => TokenKind::ParenOpen,
            Self::ParenClose => TokenKind::ParenClose,
            Self::Spread => TokenKind::Spread,
            Self::Colon => TokenKind::Colon,
            Self::Equals => TokenKind::Equals,
            Self::At => TokenKind::At,
            Self::BracketOpen => TokenKind::BracketOpen,
            Self::BracketClose => TokenKind::BracketClose,
            Self::BraceOpen => TokenKind::BraceOpen,
            Self::BraceClose => TokenKind::BraceClose,
            Self::Pipe => TokenKind::Pipe,
            Self::Ampersand => TokenKind::Ampersand,
            Self::Query => TokenKind::Query,
            Self::Mutation => TokenKind::Mutation,
            Self::Subscription => TokenKind::Subscription,
            Self::Fragment => TokenKind::Fragment,
            Self::On => TokenKind::On,
            Self::Type => TokenKind::Type,
            Self::Interface => TokenKind::Interface,
            Self::Union => TokenKind::Union,
            Self::Enum => TokenKind::Enum,
            Self::Input => TokenKind::Input,
            Self::Scalar => TokenKind::Scalar,
            Self::Schema => TokenKind::Schema,
            Self::Extend => TokenKind::Extend,
            Self::Implements => TokenKind::Implements,
            Self::Directive => TokenKind::Directive,
            Self::Repeatable => TokenKind::Repeatable,
            Self::Null => TokenKind::Null,
            Self::True => TokenKind::True,
            Self::False => TokenKind::False,
            Self::Name(_) => TokenKind::Name,
            Self::IntValue(_) => TokenKind::IntValue,
            Self::FloatValue(_) => TokenKind::FloatValue,
            Self::StringValue(_) | Self::BlockStringValue(_) => TokenKind::StringValue,
        }
    }
}

impl fmt::Display for TokenKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bang => write!(f, "!"),
            Self::Dollar => write!(f, "$"),
            Self::ParenOpen => write!(f, "("),
            Self::ParenClose => write!(f, ")"),
            Self::Spread => write!(f, "..."),
            Self::Colon => write!(f, ":"),
            Self::Equals => write!(f, "="),
            Self::At => write!(f, "@"),
            Self::BracketOpen => write!(f, "["),
            Self::BracketClose => write!(f, "]"),
            Self::BraceOpen => write!(f, "{{"),
            Self::BraceClose => write!(f, "}}"),
            Self::Pipe => write!(f, "|"),
            Self::Ampersand => write!(f, "&"),
            Self::Query => write!(f, "query"),
            Self::Mutation => write!(f, "mutation"),
            Self::Subscription => write!(f, "subscription"),
            Self::Fragment => write!(f, "fragment"),
            Self::On => write!(f, "on"),
            Self::Type => write!(f, "type"),
            Self::Interface => write!(f, "interface"),
            Self::Union => write!(f, "union"),
            Self::Enum => write!(f, "enum"),
            Self::Input => write!(f, "input"),
            Self::Scalar => write!(f, "scalar"),
            Self::Schema => write!(f, "schema"),
            Self::Extend => write!(f, "extend"),
            Self::Implements => write!(f, "implements"),
            Self::Directive => write!(f, "directive"),
            Self::Repeatable => write!(f, "repeatable"),
            Self::Null => write!(f, "null"),
            Self::True => write!(f, "true"),
            Self::False => write!(f, "false"),
            Self::Name => write!(f, "name"),
            Self::IntValue => write!(f, "integer"),
            Self::FloatValue => write!(f, "float"),
            Self::StringValue => write!(f, "string"),
            Self::Eof => write!(f, "end of input"),
        }
    }
}

impl fmt::Display for Token<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Token::Bang => write!(f, "!"),
            Token::Dollar => write!(f, "$"),
            Token::ParenOpen => write!(f, "("),
            Token::ParenClose => write!(f, ")"),
            Token::Spread => write!(f, "..."),
            Token::Colon => write!(f, ":"),
            Token::Equals => write!(f, "="),
            Token::At => write!(f, "@"),
            Token::BracketOpen => write!(f, "["),
            Token::BracketClose => write!(f, "]"),
            Token::BraceOpen => write!(f, "{{"),
            Token::BraceClose => write!(f, "}}"),
            Token::Pipe => write!(f, "|"),
            Token::Ampersand => write!(f, "&"),
            Token::Query => write!(f, "query"),
            Token::Mutation => write!(f, "mutation"),
            Token::Subscription => write!(f, "subscription"),
            Token::Fragment => write!(f, "fragment"),
            Token::On => write!(f, "on"),
            Token::Type => write!(f, "type"),
            Token::Interface => write!(f, "interface"),
            Token::Union => write!(f, "union"),
            Token::Enum => write!(f, "enum"),
            Token::Input => write!(f, "input"),
            Token::Scalar => write!(f, "scalar"),
            Token::Schema => write!(f, "schema"),
            Token::Extend => write!(f, "extend"),
            Token::Implements => write!(f, "implements"),
            Token::Directive => write!(f, "directive"),
            Token::Repeatable => write!(f, "repeatable"),
            Token::Null => write!(f, "null"),
            Token::True => write!(f, "true"),
            Token::False => write!(f, "false"),
            Token::Name(name) => write!(f, "{}", name),
            Token::IntValue(val) => write!(f, "{}", val),
            Token::FloatValue(val) => write!(f, "{}", val),
            Token::StringValue(val) => write!(f, "\"{}\"", val),
            Token::BlockStringValue(val) => write!(f, "\"\"\"{}\"\"\"", val),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::location::Span;
    use assertables::*;
    use logos::Logos;

    fn lex_all(input: &str) -> Vec<(Token<'_>, Span)> {
        Token::lexer(input)
            .spanned()
            .map(|(token, span)| (token.unwrap(), Span::from(span)))
            .collect()
    }

    #[test]
    fn test_tokenize_query_keyword() {
        let input = "query";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Query);
        assert_eq!(tokens[0].1, Span::new(0, 5));
    }

    #[test]
    fn test_tokenize_mutation_keyword() {
        let input = "mutation";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Mutation);
    }

    #[test]
    fn test_tokenize_fragment_keyword() {
        let input = "fragment";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Fragment);
    }

    #[test]
    fn test_tokenize_type_keyword() {
        let input = "type";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Type);
    }

    #[test]
    fn test_tokenize_punctuation() {
        let input = "{ } ( ) [ ] : ... @ | & = ! $";
        let tokens = lex_all(input);
        let expected = vec![
            Token::BraceOpen,
            Token::BraceClose,
            Token::ParenOpen,
            Token::ParenClose,
            Token::BracketOpen,
            Token::BracketClose,
            Token::Colon,
            Token::Spread,
            Token::At,
            Token::Pipe,
            Token::Ampersand,
            Token::Equals,
            Token::Bang,
            Token::Dollar,
        ];
        assert_eq!(tokens.len(), expected.len());
        for (i, expected_token) in expected.iter().enumerate() {
            assert_eq!(tokens[i].0, *expected_token);
        }
    }

    #[test]
    fn test_tokenize_simple_string() {
        let input = r#""hello world""#;
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0.kind(), TokenKind::StringValue);
    }

    #[test]
    fn test_tokenize_integer() {
        let input = "42";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::IntValue("42"));
    }

    #[test]
    fn test_tokenize_negative_integer() {
        let input = "-42";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::IntValue("-42"));
    }

    #[test]
    fn test_tokenize_float() {
        let input = "3.14";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::FloatValue("3.14"));
    }

    #[test]
    fn test_tokenize_name() {
        let input = "myVariable";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Name("myVariable"));
    }

    #[test]
    fn test_tokenize_boolean_true() {
        let input = "true";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::True);
    }

    #[test]
    fn test_tokenize_boolean_false() {
        let input = "false";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::False);
    }

    #[test]
    fn test_tokenize_null() {
        let input = "null";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Null);
    }

    #[test]
    fn test_tokenize_skips_whitespace() {
        let input = "query    \t\n  mutation";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].0, Token::Query);
        assert_eq!(tokens[1].0, Token::Mutation);
    }

    #[test]
    fn test_tokenize_skips_comments() {
        let input = "query # this is a comment\nmutation";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].0, Token::Query);
        assert_eq!(tokens[1].0, Token::Mutation);
    }

    #[test]
    fn test_token_kind_consistency() {
        assert_eq!(Token::Bang.kind(), TokenKind::Bang);
        assert_eq!(Token::Query.kind(), TokenKind::Query);
        assert_eq!(Token::Name("test").kind(), TokenKind::Name);
        assert_eq!(Token::IntValue("42").kind(), TokenKind::IntValue);
    }

    #[test]
    fn test_span_calculation() {
        let input = "query";
        let tokens = lex_all(input);
        assert_eq!(tokens[0].1.start, 0);
        assert_eq!(tokens[0].1.end, 5);
    }

    #[test]
    fn test_tokenize_block_string_basic() {
        let input = r#""""hello""""#;
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0.kind(), TokenKind::StringValue);
        if let Token::BlockStringValue(val) = tokens[0].0 {
            assert_contains!(val, "hello");
        } else {
            panic!("Expected BlockStringValue");
        }
    }

    #[test]
    fn test_tokenize_block_string_multiline() {
        let input = r#""""
line 1
line 2
""""#;
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0.kind(), TokenKind::StringValue);
    }

    #[test]
    fn test_tokenize_block_string_with_quotes() {
        let input = r#""""he said "hello"""""#;
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0.kind(), TokenKind::StringValue);
    }

    #[test]
    fn test_tokenize_string_with_escape_sequences() {
        let input = r#""hello\nworld\t!""#;
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0.kind(), TokenKind::StringValue);
        if let Token::StringValue(val) = tokens[0].0 {
            assert_contains!(val, r"\n");
            assert_contains!(val, r"\t");
        }
    }

    #[test]
    fn test_tokenize_string_with_unicode_escape() {
        let input = r#""\u0041BC""#;
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0.kind(), TokenKind::StringValue);
        if let Token::StringValue(val) = tokens[0].0 {
            assert_contains!(val, r"\u0041");
        }
    }

    #[test]
    fn test_tokenize_float_with_exponent() {
        let input = "1e10";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::FloatValue("1e10"));
    }

    #[test]
    fn test_tokenize_float_with_negative_exponent() {
        let input = "2.5E-3";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::FloatValue("2.5E-3"));
    }

    #[test]
    fn test_tokenize_name_with_underscore() {
        let input = "_myVar";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Name("_myVar"));
    }

    #[test]
    fn test_tokenize_name_with_numbers() {
        let input = "var123name";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Name("var123name"));
    }

    #[test]
    fn test_tokenize_empty_input() {
        let input = "";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 0);
    }

    #[test]
    fn test_tokenize_multiple_commas() {
        let input = "query,,mutation";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].0, Token::Query);
        assert_eq!(tokens[1].0, Token::Mutation);
    }

    #[test]
    fn test_tokenize_interface_keyword() {
        let input = "interface";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, Token::Interface);
    }

    #[test]
    fn test_tokenize_all_type_keywords() {
        let input = "type interface union enum input scalar";
        let tokens = lex_all(input);
        assert_eq!(tokens.len(), 6);
        assert_eq!(tokens[0].0, Token::Type);
        assert_eq!(tokens[1].0, Token::Interface);
        assert_eq!(tokens[2].0, Token::Union);
        assert_eq!(tokens[3].0, Token::Enum);
        assert_eq!(tokens[4].0, Token::Input);
        assert_eq!(tokens[5].0, Token::Scalar);
    }
}
