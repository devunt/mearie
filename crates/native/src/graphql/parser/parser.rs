use super::lexer::Token;
use super::state::*;
use crate::arena::Arena;
use crate::error::MearieError;
use crate::error::location::*;
use crate::graphql::ast::*;
use crate::source::Source;
use bumpalo::{Bump, collections::Vec};
use logos::{Lexer, Logos};
use std::marker::PhantomData;

/// A type-state GraphQL parser that enforces correct usage at compile time.
pub struct Parser<'a, State = Uninitialized> {
    arena: Option<&'a Arena>,
    source: Option<&'a Source<'a>>,
    lexer: Option<Lexer<'a, Token<'a>>>,
    peek: Option<Token<'a>>,
    _state: PhantomData<State>,
}

impl<'a> Parser<'a, Uninitialized> {
    /// Creates a new parser with the given arena allocator.
    pub fn new(arena: &'a Arena) -> Parser<'a, Ready> {
        Parser {
            arena: Some(arena),
            source: None,
            lexer: None,
            peek: None,
            _state: PhantomData,
        }
    }
}

impl<'a> Parser<'a, Ready> {
    /// Initializes the parser with a source to parse.
    pub fn with_source(self, source: &'a Source<'a>) -> Parser<'a, Parsing> {
        Parser {
            arena: self.arena,
            source: Some(source),
            lexer: Some(Token::lexer(source.code)),
            peek: None,
            _state: PhantomData,
        }
    }
}

impl<'a> Parser<'a, Parsing> {
    /// Parses the source into a Document, performing strict validation.
    pub fn parse(mut self) -> Result<&'a Document<'a>, MearieError> {
        let doc = self.parse_document()?;
        let arena = self.arena.unwrap();
        Ok(arena.alloc(doc))
    }

    fn allocator(&self) -> &'a Bump {
        self.arena.unwrap().allocator()
    }

    fn peek_token(&mut self) -> Token<'a> {
        if self.peek.is_none() {
            self.peek = self.lexer.as_mut().unwrap().next().and_then(|r| r.ok());
        }
        self.peek.unwrap_or(Token::BraceClose)
    }

    fn next_token(&mut self) -> Token<'a> {
        if let Some(token) = self.peek.take() {
            return token;
        }
        self.lexer
            .as_mut()
            .unwrap()
            .next()
            .and_then(|r| r.ok())
            .unwrap_or(Token::BraceClose)
    }

    #[inline]
    fn span(&self) -> Span {
        let range = self.lexer.as_ref().unwrap().span();
        Span::new(range.start, range.end)
    }

    fn error(&self, expected: &'static str) -> MearieError {
        let token = self.peek.unwrap_or(Token::BraceClose);
        let location = Location::from_span(self.source.unwrap(), self.span());

        MearieError::parse(format!(
            "unexpected token: expected {}, found {:?}",
            expected,
            token.kind()
        ))
        .at(location)
    }

    fn peek_is_name_or_keyword(&mut self) -> bool {
        matches!(
            self.peek_token(),
            Token::Name(_)
                | Token::Type
                | Token::Interface
                | Token::Union
                | Token::Enum
                | Token::Input
                | Token::Scalar
                | Token::Schema
                | Token::Query
                | Token::Mutation
                | Token::Subscription
                | Token::Fragment
                | Token::On
                | Token::Extend
                | Token::Implements
                | Token::Directive
                | Token::Repeatable
        )
    }

    fn next_name_or_keyword(&mut self, error_msg: &'static str) -> Result<&'a str, MearieError> {
        match self.next_token() {
            Token::Name(name) => Ok(name),
            Token::Input => Ok("input"),
            Token::Query => Ok("query"),
            Token::Mutation => Ok("mutation"),
            Token::Subscription => Ok("subscription"),
            Token::Type => Ok("type"),
            Token::Interface => Ok("interface"),
            Token::Union => Ok("union"),
            Token::Enum => Ok("enum"),
            Token::Scalar => Ok("scalar"),
            Token::Schema => Ok("schema"),
            Token::Fragment => Ok("fragment"),
            Token::On => Ok("on"),
            Token::Extend => Ok("extend"),
            Token::Implements => Ok("implements"),
            Token::Directive => Ok("directive"),
            Token::Repeatable => Ok("repeatable"),
            _ => Err(self.error(error_msg)),
        }
    }

    fn unescape_string(&self, s: &'a str) -> Result<&'a str, MearieError> {
        if s.len() < 2 || !s.starts_with('"') || !s.ends_with('"') {
            return Ok(s);
        }

        let inner = &s[1..s.len() - 1];

        if !inner.contains('\\') {
            return Ok(self.allocator().alloc_str(inner));
        }

        let mut result = String::new();
        let mut chars = inner.chars();

        while let Some(ch) = chars.next() {
            if ch == '\\' {
                match chars.next() {
                    Some('"') => result.push('"'),
                    Some('\\') => result.push('\\'),
                    Some('/') => result.push('/'),
                    Some('b') => result.push('\u{0008}'),
                    Some('f') => result.push('\u{000C}'),
                    Some('n') => result.push('\n'),
                    Some('r') => result.push('\r'),
                    Some('t') => result.push('\t'),
                    Some('u') => {
                        let hex: String = chars.by_ref().take(4).collect();
                        if hex.len() == 4
                            && let Ok(code) = u32::from_str_radix(&hex, 16)
                            && let Some(unicode_char) = char::from_u32(code)
                        {
                            result.push(unicode_char);
                            continue;
                        }
                        result.push_str("\\u");
                        result.push_str(&hex);
                    }
                    Some(c) => {
                        result.push('\\');
                        result.push(c);
                    }
                    None => result.push('\\'),
                }
            } else {
                result.push(ch);
            }
        }

        Ok(self.allocator().alloc_str(&result))
    }

    fn unescape_block_string(&self, s: &'a str) -> Result<&'a str, MearieError> {
        if s.len() < 6 || !s.starts_with("\"\"\"") || !s.ends_with("\"\"\"") {
            return Ok(s);
        }

        let inner = &s[3..s.len() - 3];

        if !inner.contains("\\\"\"\"") {
            return Ok(self.allocator().alloc_str(inner));
        }

        let result = inner.replace("\\\"\"\"", "\"\"\"");
        Ok(self.allocator().alloc_str(&result))
    }

    fn parse_description(&mut self) -> Result<Option<Description<'a>>, MearieError> {
        match self.peek_token() {
            Token::StringValue(val) => {
                self.next_token();
                let unescaped = self.unescape_string(val)?;
                Ok(Some(Description { value: unescaped }))
            }
            Token::BlockStringValue(val) => {
                self.next_token();
                let unescaped = self.unescape_block_string(val)?;
                Ok(Some(Description { value: unescaped }))
            }
            _ => Ok(None),
        }
    }

    fn parse_arguments(&mut self) -> Result<Vec<'a, Argument<'a>>, MearieError> {
        let mut arguments = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::ParenOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::ParenClose) {
                let start = self.span().start;
                let name = ArgumentName::from(self.next_name_or_keyword("argument name")?);

                if !matches!(self.next_token(), Token::Colon) {
                    return Err(self.error(":"));
                }
                let value = self.parse_value()?;
                let end = self.span().end;
                arguments.push(Argument {
                    span: Span::new(start, end),
                    name,
                    value,
                });
            }
            self.next_token();
        }
        Ok(arguments)
    }

    fn parse_directives(&mut self) -> Result<Vec<'a, Directive<'a>>, MearieError> {
        let mut directives = Vec::new_in(self.allocator());
        while matches!(self.peek_token(), Token::At) {
            let start = self.span().start;
            self.next_token();
            let name = self.next_name_or_keyword("directive name")?;
            let arguments = self.parse_arguments()?;
            let end = self.span().end;
            directives.push(Directive {
                span: Span::new(start, end),
                name: DirectiveName::from(name),
                arguments,
            });
        }
        Ok(directives)
    }

    fn parse_value(&mut self) -> Result<Value<'a>, MearieError> {
        match self.peek_token() {
            Token::Null => {
                self.next_token();
                Ok(Value::Null)
            }
            Token::True => {
                self.next_token();
                Ok(Value::Boolean(true))
            }
            Token::False => {
                self.next_token();
                Ok(Value::Boolean(false))
            }
            Token::Dollar => {
                self.next_token();
                let name = Name::from(self.next_name_or_keyword("variable name")?);
                Ok(Value::Variable(name))
            }
            Token::IntValue(val) => {
                self.next_token();
                Ok(Value::Int(val))
            }
            Token::FloatValue(val) => {
                self.next_token();
                Ok(Value::Float(val))
            }
            Token::StringValue(val) => {
                self.next_token();
                let unescaped = self.unescape_string(val)?;
                Ok(Value::String(unescaped))
            }
            Token::BlockStringValue(val) => {
                self.next_token();
                let unescaped = self.unescape_block_string(val)?;
                Ok(Value::String(unescaped))
            }
            Token::BracketOpen => {
                self.next_token();
                let mut values = Vec::new_in(self.allocator());
                while !matches!(self.peek_token(), Token::BracketClose) {
                    values.push(self.parse_value()?);
                }
                self.next_token();
                Ok(Value::List(values))
            }
            Token::BraceOpen => {
                self.next_token();
                let mut fields = Vec::new_in(self.allocator());
                while !matches!(self.peek_token(), Token::BraceClose) {
                    let name = ArgumentName::from(self.next_name_or_keyword("field name")?);

                    if !matches!(self.next_token(), Token::Colon) {
                        return Err(self.error(":"));
                    }
                    let value = self.parse_value()?;
                    fields.push(ObjectField { name, value });
                }
                self.next_token();
                Ok(Value::Object(fields))
            }
            _ if self.peek_is_name_or_keyword() => {
                let name = self.next_name_or_keyword("enum value")?;
                Ok(Value::Enum(Name::from(name)))
            }
            _ => Err(self.error("value")),
        }
    }

    fn parse_type(&mut self) -> Result<Type<'a>, MearieError> {
        let base_type = if self.peek_is_name_or_keyword() {
            let name = self.next_name_or_keyword("type name")?;
            Type::Named(NamedType {
                name: TypeName::from(name),
            })
        } else if matches!(self.peek_token(), Token::BracketOpen) {
            self.next_token();
            let inner = self.parse_type()?;
            if !matches!(self.next_token(), Token::BracketClose) {
                return Err(self.error("]"));
            }
            Type::List(self.allocator().alloc(inner))
        } else {
            return Err(self.error("type"));
        };

        if matches!(self.peek_token(), Token::Bang) {
            self.next_token();
            Ok(Type::NonNull(self.allocator().alloc(match base_type {
                Type::Named(named) => NonNullType::Named(named),
                Type::List(inner) => NonNullType::List(inner),
                Type::NonNull(_) => return Err(self.error("non-null type")),
            })))
        } else {
            Ok(base_type)
        }
    }

    fn parse_variable_definition(&mut self) -> Result<VariableDefinition<'a>, MearieError> {
        let start = self.span().start;

        if !matches!(self.next_token(), Token::Dollar) {
            return Err(self.error("$"));
        }

        let variable = VariableName::from(self.next_name_or_keyword("variable name")?);

        if !matches!(self.next_token(), Token::Colon) {
            return Err(self.error(":"));
        }

        let typ = self.parse_type()?;

        let default_value = if matches!(self.peek_token(), Token::Equals) {
            self.next_token();
            Some(self.parse_value()?)
        } else {
            None
        };

        let directives = self.parse_directives()?;
        let end = self.span().end;

        Ok(VariableDefinition {
            span: Span::new(start, end),
            variable,
            typ,
            default_value,
            directives,
        })
    }

    fn parse_selection_set(&mut self) -> Result<SelectionSet<'a>, MearieError> {
        let mut selections = Vec::new_in(self.allocator());

        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                selections.push(self.parse_selection()?);
            }
            self.next_token();
        }

        Ok(SelectionSet { selections })
    }

    fn parse_selection(&mut self) -> Result<Selection<'a>, MearieError> {
        match self.peek_token() {
            Token::Spread => {
                let start = self.span().start;
                self.next_token();
                if matches!(self.peek_token(), Token::On) {
                    self.next_token();
                    let name = self.next_name_or_keyword("type name")?;
                    let type_condition = Some(TypeName::from(name));
                    let directives = self.parse_directives()?;
                    let selection_set = self.parse_selection_set()?;
                    let end = self.span().end;
                    Ok(Selection::InlineFragment(InlineFragment {
                        span: Span::new(start, end),
                        type_condition,
                        directives,
                        selection_set,
                    }))
                } else if matches!(self.peek_token(), Token::BraceOpen | Token::At) {
                    let directives = self.parse_directives()?;
                    let selection_set = self.parse_selection_set()?;
                    let end = self.span().end;
                    Ok(Selection::InlineFragment(InlineFragment {
                        span: Span::new(start, end),
                        type_condition: None,
                        directives,
                        selection_set,
                    }))
                } else if self.peek_is_name_or_keyword() {
                    let fragment_name = self.next_name_or_keyword("fragment name")?;
                    let directives = self.parse_directives()?;
                    let end = self.span().end;
                    Ok(Selection::FragmentSpread(FragmentSpread {
                        span: Span::new(start, end),
                        fragment_name: FragmentName::from(fragment_name),
                        directives,
                    }))
                } else {
                    Err(self.error("fragment"))
                }
            }
            _ if self.peek_is_name_or_keyword() => Ok(Selection::Field(self.parse_field()?)),
            _ => Err(self.error("selection")),
        }
    }

    fn parse_field(&mut self) -> Result<Field<'a>, MearieError> {
        let start = self.span().start;
        let name_or_alias = self.next_name_or_keyword("field name")?;

        let (alias, name) = if matches!(self.peek_token(), Token::Colon) {
            self.next_token();
            let name = self.next_name_or_keyword("field name")?;
            (Some(FieldName::from(name_or_alias)), FieldName::from(name))
        } else {
            (None, FieldName::from(name_or_alias))
        };

        let arguments = self.parse_arguments()?;
        let directives = self.parse_directives()?;
        let selection_set = self.parse_selection_set()?;
        let end = self.span().end;

        Ok(Field {
            span: Span::new(start, end),
            alias,
            name,
            arguments,
            directives,
            selection_set,
        })
    }

    fn parse_operation_definition(&mut self) -> Result<OperationDefinition<'a>, MearieError> {
        let start = self.span().start;
        let operation_type = match self.peek_token() {
            Token::BraceOpen => {
                let selection_set = self.parse_selection_set()?;
                let end = self.span().end;
                return Ok(OperationDefinition {
                    span: Span::new(start, end),
                    operation_type: OperationType::Query,
                    name: None,
                    variable_definitions: Vec::new_in(self.allocator()),
                    directives: Vec::new_in(self.allocator()),
                    selection_set,
                });
            }
            Token::Query => {
                self.next_token();
                OperationType::Query
            }
            Token::Mutation => {
                self.next_token();
                OperationType::Mutation
            }
            Token::Subscription => {
                self.next_token();
                OperationType::Subscription
            }
            _ => return Err(self.error("operation type")),
        };

        let name = if self.peek_is_name_or_keyword() {
            Some(Name::from(self.next_name_or_keyword("operation name")?))
        } else {
            None
        };

        let mut variable_definitions = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::ParenOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::ParenClose) {
                variable_definitions.push(self.parse_variable_definition()?);
            }
            self.next_token();
        }

        let directives = self.parse_directives()?;
        let selection_set = self.parse_selection_set()?;
        let end = self.span().end;

        Ok(OperationDefinition {
            span: Span::new(start, end),
            operation_type,
            name,
            variable_definitions,
            directives,
            selection_set,
        })
    }

    fn parse_fragment_definition(&mut self) -> Result<FragmentDefinition<'a>, MearieError> {
        let start = self.span().start;

        if !matches!(self.next_token(), Token::Fragment) {
            return Err(self.error("fragment"));
        }

        let name = FragmentName::from(self.next_name_or_keyword("fragment name")?);

        if !matches!(self.next_token(), Token::On) {
            return Err(self.error("on"));
        }

        let type_condition = TypeName::from(self.next_name_or_keyword("type name")?);

        let directives = self.parse_directives()?;
        let selection_set = self.parse_selection_set()?;
        let end = self.span().end;

        Ok(FragmentDefinition {
            span: Span::new(start, end),
            name,
            type_condition,
            directives,
            selection_set,
        })
    }

    fn parse_document(&mut self) -> Result<Document<'a>, MearieError> {
        let source = self.source.unwrap();
        let mut definitions = Vec::new_in(self.allocator());

        loop {
            match self.peek_token() {
                Token::BraceClose => break,
                _ => {
                    definitions.push(self.parse_definition()?);
                }
            }
        }

        Ok(Document { source, definitions })
    }

    fn parse_definition(&mut self) -> Result<Definition<'a>, MearieError> {
        match self.peek_token() {
            Token::Type
            | Token::Interface
            | Token::Enum
            | Token::Union
            | Token::Scalar
            | Token::Input
            | Token::Schema
            | Token::Directive
            | Token::StringValue(_)
            | Token::BlockStringValue(_) => Ok(Definition::TypeSystem(self.parse_type_system_definition()?)),
            Token::Extend => Ok(Definition::TypeSystemExtension(self.parse_type_system_extension()?)),
            Token::Fragment => Ok(Definition::Executable(ExecutableDefinition::Fragment(
                self.parse_fragment_definition()?,
            ))),
            _ => Ok(Definition::Executable(ExecutableDefinition::Operation(
                self.parse_operation_definition()?,
            ))),
        }
    }

    fn parse_type_system_definition(&mut self) -> Result<TypeSystemDefinition<'a>, MearieError> {
        let description = self.parse_description()?;
        match self.peek_token() {
            Token::Schema => Ok(TypeSystemDefinition::Schema(self.parse_schema_definition(description)?)),
            Token::Directive => Ok(TypeSystemDefinition::Directive(
                self.parse_directive_definition(description)?,
            )),
            _ => Ok(TypeSystemDefinition::Type(self.parse_type_definition(description)?)),
        }
    }

    fn parse_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<TypeDefinition<'a>, MearieError> {
        match self.peek_token() {
            Token::Type => Ok(TypeDefinition::Object(self.parse_object_type_definition(description)?)),
            Token::Interface => Ok(TypeDefinition::Interface(
                self.parse_interface_type_definition(description)?,
            )),
            Token::Enum => Ok(TypeDefinition::Enum(self.parse_enum_type_definition(description)?)),
            Token::Union => Ok(TypeDefinition::Union(self.parse_union_type_definition(description)?)),
            Token::Scalar => Ok(TypeDefinition::Scalar(self.parse_scalar_type_definition(description)?)),
            Token::Input => Ok(TypeDefinition::InputObject(
                self.parse_input_object_type_definition(description)?,
            )),
            _ => Err(self.error("type definition")),
        }
    }

    fn parse_type_system_extension(&mut self) -> Result<TypeSystemExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Extend) {
            return Err(self.error("extend"));
        }

        match self.peek_token() {
            Token::Scalar | Token::Type | Token::Interface | Token::Union | Token::Enum | Token::Input => {
                Ok(TypeSystemExtension::Type(self.parse_type_extension()?))
            }
            _ => Err(self.error("extend target")),
        }
    }

    fn parse_type_extension(&mut self) -> Result<TypeExtension<'a>, MearieError> {
        match self.peek_token() {
            Token::Scalar => Ok(TypeExtension::Scalar(self.parse_scalar_type_extension()?)),
            Token::Type => Ok(TypeExtension::Object(self.parse_object_type_extension()?)),
            Token::Interface => Ok(TypeExtension::Interface(self.parse_interface_type_extension()?)),
            Token::Union => Ok(TypeExtension::Union(self.parse_union_type_extension()?)),
            Token::Enum => Ok(TypeExtension::Enum(self.parse_enum_type_extension()?)),
            Token::Input => Ok(TypeExtension::InputObject(self.parse_input_object_type_extension()?)),
            _ => Err(self.error("type extension")),
        }
    }

    fn parse_field_definition(&mut self) -> Result<FieldDefinition<'a>, MearieError> {
        let description = self.parse_description()?;

        let name = FieldName::from(self.next_name_or_keyword("field name")?);

        let mut arguments = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::ParenOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::ParenClose) {
                arguments.push(self.parse_input_value_definition()?);
            }
            self.next_token();
        }

        if !matches!(self.next_token(), Token::Colon) {
            return Err(self.error(":"));
        }

        let typ = self.parse_type()?;
        let directives = self.parse_directives()?;

        Ok(FieldDefinition {
            description,
            name,
            arguments,
            typ,
            directives,
        })
    }

    fn parse_input_value_definition(&mut self) -> Result<InputValueDefinition<'a>, MearieError> {
        let description = self.parse_description()?;

        let name = ArgumentName::from(self.next_name_or_keyword("input field name")?);

        if !matches!(self.next_token(), Token::Colon) {
            return Err(self.error(":"));
        }

        let typ = self.parse_type()?;

        let default_value = if matches!(self.peek_token(), Token::Equals) {
            self.next_token();
            Some(self.parse_value()?)
        } else {
            None
        };

        let directives = self.parse_directives()?;

        Ok(InputValueDefinition {
            description,
            name,
            typ,
            default_value,
            directives,
        })
    }

    fn parse_object_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<ObjectTypeDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Type) {
            return Err(self.error("type"));
        }

        let name = TypeName::from(self.next_name_or_keyword("type name")?);

        let mut implements = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Implements) {
            self.next_token();
            while self.peek_is_name_or_keyword() {
                let iface = self.next_name_or_keyword("interface name")?;
                implements.push(TypeName::from(iface));
                if !matches!(self.peek_token(), Token::Ampersand) {
                    break;
                }
                self.next_token();
            }
        }

        let directives = self.parse_directives()?;

        let mut fields = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                fields.push(self.parse_field_definition()?);
            }
            self.next_token();
        }

        Ok(ObjectTypeDefinition {
            description,
            name,
            implements,
            directives,
            fields,
        })
    }

    fn parse_interface_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<InterfaceTypeDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Interface) {
            return Err(self.error("interface"));
        }

        let name = TypeName::from(self.next_name_or_keyword("interface name")?);

        let mut implements = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Implements) {
            self.next_token();
            while self.peek_is_name_or_keyword() {
                let iface = self.next_name_or_keyword("interface name")?;
                implements.push(TypeName::from(iface));
                if !matches!(self.peek_token(), Token::Ampersand) {
                    break;
                }
                self.next_token();
            }
        }

        let directives = self.parse_directives()?;

        let mut fields = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                fields.push(self.parse_field_definition()?);
            }
            self.next_token();
        }

        Ok(InterfaceTypeDefinition {
            description,
            name,
            implements,
            directives,
            fields,
        })
    }

    fn parse_enum_value_definition(&mut self) -> Result<EnumValueDefinition<'a>, MearieError> {
        let description = self.parse_description()?;

        let value = Name::from(self.next_name_or_keyword("enum value")?);

        let directives = self.parse_directives()?;

        Ok(EnumValueDefinition {
            description,
            value,
            directives,
        })
    }

    fn parse_enum_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<EnumTypeDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Enum) {
            return Err(self.error("enum"));
        }

        let name = TypeName::from(self.next_name_or_keyword("enum name")?);

        let directives = self.parse_directives()?;

        let mut values = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                values.push(self.parse_enum_value_definition()?);
            }
            self.next_token();
        }

        Ok(EnumTypeDefinition {
            description,
            name,
            directives,
            values,
        })
    }

    fn parse_union_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<UnionTypeDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Union) {
            return Err(self.error("union"));
        }

        let name = TypeName::from(self.next_name_or_keyword("union name")?);

        let directives = self.parse_directives()?;

        let mut members = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Equals) {
            self.next_token();
            if matches!(self.peek_token(), Token::Pipe) {
                self.next_token();
            }
            while self.peek_is_name_or_keyword() {
                let member = self.next_name_or_keyword("union member")?;
                members.push(TypeName::from(member));
                if !matches!(self.peek_token(), Token::Pipe) {
                    break;
                }
                self.next_token();
            }
        }

        Ok(UnionTypeDefinition {
            description,
            name,
            directives,
            members,
        })
    }

    fn parse_scalar_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<ScalarTypeDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Scalar) {
            return Err(self.error("scalar"));
        }

        let name = TypeName::from(self.next_name_or_keyword("scalar name")?);

        let directives = self.parse_directives()?;

        Ok(ScalarTypeDefinition {
            description,
            name,
            directives,
        })
    }

    fn parse_input_object_type_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<InputObjectTypeDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Input) {
            return Err(self.error("input"));
        }

        let name = TypeName::from(self.next_name_or_keyword("input name")?);

        let directives = self.parse_directives()?;

        let mut fields = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                fields.push(self.parse_input_value_definition()?);
            }
            self.next_token();
        }

        Ok(InputObjectTypeDefinition {
            description,
            name,
            directives,
            fields,
        })
    }

    fn parse_directive_location(&self, name: &str) -> Option<DirectiveLocation> {
        use DirectiveLocation::*;
        match name {
            "QUERY" => Some(Query),
            "MUTATION" => Some(Mutation),
            "SUBSCRIPTION" => Some(Subscription),
            "FIELD" => Some(Field),
            "FRAGMENT_DEFINITION" => Some(FragmentDefinition),
            "FRAGMENT_SPREAD" => Some(FragmentSpread),
            "INLINE_FRAGMENT" => Some(InlineFragment),
            "VARIABLE_DEFINITION" => Some(VariableDefinition),
            "SCHEMA" => Some(Schema),
            "SCALAR" => Some(Scalar),
            "OBJECT" => Some(Object),
            "FIELD_DEFINITION" => Some(FieldDefinition),
            "ARGUMENT_DEFINITION" => Some(ArgumentDefinition),
            "INTERFACE" => Some(Interface),
            "UNION" => Some(Union),
            "ENUM" => Some(Enum),
            "ENUM_VALUE" => Some(EnumValue),
            "INPUT_OBJECT" => Some(InputObject),
            "INPUT_FIELD_DEFINITION" => Some(InputFieldDefinition),
            _ => None,
        }
    }

    fn parse_directive_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<DirectiveDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Directive) {
            return Err(self.error("directive"));
        }

        if !matches!(self.next_token(), Token::At) {
            return Err(self.error("@"));
        }

        let name = DirectiveName::from(self.next_name_or_keyword("directive name")?);

        let mut arguments = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::ParenOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::ParenClose) {
                arguments.push(self.parse_input_value_definition()?);
            }
            self.next_token();
        }

        let repeatable = if matches!(self.peek_token(), Token::Repeatable) {
            self.next_token();
            true
        } else {
            false
        };

        if !matches!(self.next_token(), Token::On) {
            return Err(self.error("on"));
        }

        let mut locations = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Pipe) {
            self.next_token();
        }

        while let Token::Name(loc_name) = self.peek_token() {
            if let Some(location) = self.parse_directive_location(loc_name) {
                self.next_token();
                locations.push(location);
                if matches!(self.peek_token(), Token::Pipe) {
                    self.next_token();
                } else {
                    break;
                }
            } else {
                return Err(self.error("directive location"));
            }
        }

        Ok(DirectiveDefinition {
            description,
            name,
            arguments,
            repeatable,
            locations,
        })
    }

    fn parse_schema_definition(
        &mut self,
        description: Option<Description<'a>>,
    ) -> Result<SchemaDefinition<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Schema) {
            return Err(self.error("schema"));
        }

        let directives = self.parse_directives()?;

        if !matches!(self.next_token(), Token::BraceOpen) {
            return Err(self.error("{"));
        }

        let mut query = None;
        let mut mutation = None;
        let mut subscription = None;

        while !matches!(self.peek_token(), Token::BraceClose) {
            let op_type = match self.next_token() {
                Token::Name(name) => name,
                Token::Query => "query",
                Token::Mutation => "mutation",
                Token::Subscription => "subscription",
                _ => return Err(self.error("operation type")),
            };

            if !matches!(self.next_token(), Token::Colon) {
                return Err(self.error(":"));
            }

            let type_name = TypeName::from(self.next_name_or_keyword("type name")?);

            match op_type {
                "query" => query = Some(type_name),
                "mutation" => mutation = Some(type_name),
                "subscription" => subscription = Some(type_name),
                _ => return Err(self.error("operation type")),
            }
        }

        self.next_token();

        Ok(SchemaDefinition {
            description,
            directives,
            query,
            mutation,
            subscription,
        })
    }

    fn parse_object_type_extension(&mut self) -> Result<ObjectTypeExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Type) {
            return Err(self.error("type"));
        }

        let name = TypeName::from(self.next_name_or_keyword("type name")?);

        let mut implements = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Implements) {
            self.next_token();
            while self.peek_is_name_or_keyword() {
                let iface = self.next_name_or_keyword("interface name")?;
                implements.push(TypeName::from(iface));
                if !matches!(self.peek_token(), Token::Ampersand) {
                    break;
                }
                self.next_token();
            }
        }

        let directives = self.parse_directives()?;

        let mut fields = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                fields.push(self.parse_field_definition()?);
            }
            self.next_token();
        }

        Ok(ObjectTypeExtension {
            name,
            implements,
            directives,
            fields,
        })
    }

    fn parse_interface_type_extension(&mut self) -> Result<InterfaceTypeExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Interface) {
            return Err(self.error("interface"));
        }

        let name = TypeName::from(self.next_name_or_keyword("interface name")?);

        let mut implements = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Implements) {
            self.next_token();
            while self.peek_is_name_or_keyword() {
                let iface = self.next_name_or_keyword("interface name")?;
                implements.push(TypeName::from(iface));
                if !matches!(self.peek_token(), Token::Ampersand) {
                    break;
                }
                self.next_token();
            }
        }

        let directives = self.parse_directives()?;

        let mut fields = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                fields.push(self.parse_field_definition()?);
            }
            self.next_token();
        }

        Ok(InterfaceTypeExtension {
            name,
            implements,
            directives,
            fields,
        })
    }

    fn parse_scalar_type_extension(&mut self) -> Result<ScalarTypeExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Scalar) {
            return Err(self.error("scalar"));
        }

        let name = TypeName::from(self.next_name_or_keyword("scalar name")?);

        let directives = self.parse_directives()?;

        Ok(ScalarTypeExtension { name, directives })
    }

    fn parse_union_type_extension(&mut self) -> Result<UnionTypeExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Union) {
            return Err(self.error("union"));
        }

        let name = TypeName::from(self.next_name_or_keyword("union name")?);

        let directives = self.parse_directives()?;

        let mut members = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::Equals) {
            self.next_token();
            if matches!(self.peek_token(), Token::Pipe) {
                self.next_token();
            }
            while self.peek_is_name_or_keyword() {
                let member = self.next_name_or_keyword("union member")?;
                members.push(TypeName::from(member));
                if !matches!(self.peek_token(), Token::Pipe) {
                    break;
                }
                self.next_token();
            }
        }

        Ok(UnionTypeExtension {
            name,
            directives,
            members,
        })
    }

    fn parse_enum_type_extension(&mut self) -> Result<EnumTypeExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Enum) {
            return Err(self.error("enum"));
        }

        let name = TypeName::from(self.next_name_or_keyword("enum name")?);

        let directives = self.parse_directives()?;

        let mut values = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                values.push(self.parse_enum_value_definition()?);
            }
            self.next_token();
        }

        Ok(EnumTypeExtension {
            name,
            directives,
            values,
        })
    }

    fn parse_input_object_type_extension(&mut self) -> Result<InputObjectTypeExtension<'a>, MearieError> {
        if !matches!(self.next_token(), Token::Input) {
            return Err(self.error("input"));
        }

        let name = TypeName::from(self.next_name_or_keyword("input name")?);

        let directives = self.parse_directives()?;

        let mut fields = Vec::new_in(self.allocator());
        if matches!(self.peek_token(), Token::BraceOpen) {
            self.next_token();
            while !matches!(self.peek_token(), Token::BraceClose) {
                fields.push(self.parse_input_value_definition()?);
            }
            self.next_token();
        }

        Ok(InputObjectTypeExtension {
            name,
            directives,
            fields,
        })
    }
}
