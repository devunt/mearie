use super::context::GraphQLContext;
use super::lexer::Token;
use crate::error::MearieError;
use crate::span::*;
use crate::{ast::*, error::ErrorKind};
use bumpalo::{Bump, collections::Vec};
use logos::{Lexer, Logos};

struct State<'a> {
    alloc: &'a Bump,
    peek: Option<Token<'a>>,
    iter: Lexer<'a, Token<'a>>,
    source: &'a Source<'a>,
}

impl<'a> State<'a> {
    fn new(ctx: &'a GraphQLContext, source: &'a Source<'a>) -> Self {
        State {
            alloc: ctx.allocator(),
            peek: None,
            iter: Token::lexer(source.code),
            source,
        }
    }

    #[inline]
    fn next(&mut self) -> Token<'a> {
        self.peek
            .take()
            .unwrap_or_else(|| self.iter.next().and_then(|r| r.ok()).unwrap_or(Token::BraceClose))
    }

    #[inline]
    fn peek(&mut self) -> Token<'a> {
        match self.peek {
            Some(token) => token,
            None => {
                self.peek = self.iter.next().and_then(|r| r.ok());
                self.peek.unwrap_or(Token::BraceClose)
            }
        }
    }

    #[inline]
    fn span(&self) -> Span {
        let range = self.iter.span();
        Span::new(range.start, range.end)
    }

    fn error(&mut self, expected: &'static str) -> MearieError {
        let token = self.peek();
        let location = Location::from_span(self.source, self.span());

        MearieError {
            kind: ErrorKind::UnexpectedToken {
                expected,
                found: token.kind(),
            },
            location: Some(location),
        }
    }

    fn next_name_or_keyword(&mut self, error_msg: &'static str) -> Result<&'a str, MearieError> {
        match self.next() {
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
            _ => Err(self.error(error_msg)),
        }
    }
}

fn unescape_string<'a>(s: &'a str, alloc: &'a Bump) -> Result<&'a str, MearieError> {
    // GraphQL string value includes surrounding quotes, so we need to remove them
    if s.len() < 2 || !s.starts_with('"') || !s.ends_with('"') {
        return Ok(s); // Return as-is if not properly quoted
    }

    let inner = &s[1..s.len() - 1];

    // If there are no escape sequences, we can return the string as-is
    if !inner.contains('\\') {
        return Ok(alloc.alloc_str(inner));
    }

    // Process escape sequences
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
                    // Unicode escape sequence: \uXXXX
                    let hex: String = chars.by_ref().take(4).collect();
                    if hex.len() == 4
                        && let Ok(code) = u32::from_str_radix(&hex, 16)
                    {
                        if let Some(unicode_char) = char::from_u32(code) {
                            result.push(unicode_char);
                        } else {
                            result.push_str("\\u");
                            result.push_str(&hex);
                        }
                    }
                }
                Some(c) => {
                    // Invalid escape sequence, keep as-is
                    result.push('\\');
                    result.push(c);
                }
                None => result.push('\\'),
            }
        } else {
            result.push(ch);
        }
    }

    Ok(alloc.alloc_str(&result))
}

fn unescape_block_string<'a>(s: &'a str, alloc: &'a Bump) -> Result<&'a str, MearieError> {
    // Block strings are delimited by """
    if s.len() < 6 || !s.starts_with("\"\"\"") || !s.ends_with("\"\"\"") {
        return Ok(s); // Return as-is if not properly quoted
    }

    let inner = &s[3..s.len() - 3];

    // Block strings only process \""" escape sequence
    if !inner.contains("\\\"\"\"") {
        return Ok(alloc.alloc_str(inner));
    }

    // Replace \""" with """
    let result = inner.replace("\\\"\"\"", "\"\"\"");
    Ok(alloc.alloc_str(&result))
}

fn parse_description<'a>(state: &mut State<'a>) -> Result<Option<Description<'a>>, MearieError> {
    match state.peek() {
        Token::StringValue(val) => {
            state.next();
            let unescaped = unescape_string(val, state.alloc)?;
            Ok(Some(Description { value: unescaped }))
        }
        Token::BlockStringValue(val) => {
            state.next();
            let unescaped = unescape_block_string(val, state.alloc)?;
            Ok(Some(Description { value: unescaped }))
        }
        _ => Ok(None),
    }
}

fn parse_arguments<'a>(state: &mut State<'a>) -> Result<Vec<'a, Argument<'a>>, MearieError> {
    let mut arguments = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::ParenOpen) {
        state.next();
        while !matches!(state.peek(), Token::ParenClose) {
            let start = state.span().start;
            let name = state.next_name_or_keyword("argument name")?;

            if !matches!(state.next(), Token::Colon) {
                return Err(state.error(":"));
            }
            let value = parse_value(state)?;
            let end = state.span().end;
            arguments.push(Argument {
                span: Span::new(start, end),
                name: Name::new(name),
                value,
            });
        }
        state.next();
    }
    Ok(arguments)
}

fn parse_directives<'a>(state: &mut State<'a>) -> Result<Vec<'a, Directive<'a>>, MearieError> {
    let mut directives = Vec::new_in(state.alloc);
    while matches!(state.peek(), Token::At) {
        let start = state.span().start;
        state.next();
        if let Token::Name(name) = state.next() {
            let arguments = parse_arguments(state)?;
            let end = state.span().end;
            directives.push(Directive {
                span: Span::new(start, end),
                name: Name::new(name),
                arguments,
            });
        } else {
            return Err(state.error("directive name"));
        }
    }
    Ok(directives)
}

fn parse_value<'a>(state: &mut State<'a>) -> Result<Value<'a>, MearieError> {
    match state.peek() {
        Token::Null => {
            state.next();
            Ok(Value::Null)
        }
        Token::True => {
            state.next();
            Ok(Value::Boolean(true))
        }
        Token::False => {
            state.next();
            Ok(Value::Boolean(false))
        }
        Token::Dollar => {
            state.next();
            let name = state.next_name_or_keyword("variable name")?;
            Ok(Value::Variable(Name::new(name)))
        }
        Token::Name(name) => {
            state.next();
            Ok(Value::Enum(Name::new(name)))
        }
        Token::IntValue(val) => {
            state.next();
            Ok(Value::Int(val))
        }
        Token::FloatValue(val) => {
            state.next();
            Ok(Value::Float(val))
        }
        Token::StringValue(val) => {
            state.next();
            let unescaped = unescape_string(val, state.alloc)?;
            Ok(Value::String(unescaped))
        }
        Token::BlockStringValue(val) => {
            state.next();
            let unescaped = unescape_block_string(val, state.alloc)?;
            Ok(Value::String(unescaped))
        }
        Token::BracketOpen => {
            state.next();
            let mut values = Vec::new_in(state.alloc);
            while !matches!(state.peek(), Token::BracketClose) {
                values.push(parse_value(state)?);
            }
            state.next();
            Ok(Value::List(values))
        }
        Token::BraceOpen => {
            state.next();
            let mut fields = Vec::new_in(state.alloc);
            while !matches!(state.peek(), Token::BraceClose) {
                let name = state.next_name_or_keyword("field name")?;

                if !matches!(state.next(), Token::Colon) {
                    return Err(state.error(":"));
                }
                let value = parse_value(state)?;
                fields.push(ObjectField {
                    name: Name::new(name),
                    value,
                });
            }
            state.next();
            Ok(Value::Object(fields))
        }
        _ => Err(state.error("value")),
    }
}

fn parse_type<'a>(state: &mut State<'a>) -> Result<Type<'a>, MearieError> {
    let base_type = match state.next() {
        Token::Name(name) => Type::Named(NamedType { name }),
        Token::BracketOpen => {
            let inner = parse_type(state)?;
            if !matches!(state.next(), Token::BracketClose) {
                return Err(state.error("]"));
            }
            Type::List(state.alloc.alloc(inner))
        }
        _ => return Err(state.error("type")),
    };

    if matches!(state.peek(), Token::Bang) {
        state.next();
        Ok(Type::NonNull(state.alloc.alloc(match base_type {
            Type::Named(named) => NonNullType::Named(named),
            Type::List(inner) => NonNullType::List(inner),
            Type::NonNull(_) => return Err(state.error("non-null type")),
        })))
    } else {
        Ok(base_type)
    }
}

fn parse_variable_definition<'a>(state: &mut State<'a>) -> Result<VariableDefinition<'a>, MearieError> {
    let start = state.span().start;

    if !matches!(state.next(), Token::Dollar) {
        return Err(state.error("$"));
    }

    let variable = Name::new(state.next_name_or_keyword("variable name")?);

    if !matches!(state.next(), Token::Colon) {
        return Err(state.error(":"));
    }

    let typ = parse_type(state)?;

    let default_value = if matches!(state.peek(), Token::Equals) {
        state.next();
        Some(parse_value(state)?)
    } else {
        None
    };

    let directives = parse_directives(state)?;
    let end = state.span().end;

    Ok(VariableDefinition {
        span: Span::new(start, end),
        variable,
        typ,
        default_value,
        directives,
    })
}

fn parse_selection_set<'a>(state: &mut State<'a>) -> Result<SelectionSet<'a>, MearieError> {
    let mut selections = Vec::new_in(state.alloc);

    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            selections.push(parse_selection(state)?);
        }
        state.next();
    }

    Ok(SelectionSet { selections })
}

fn parse_selection<'a>(state: &mut State<'a>) -> Result<Selection<'a>, MearieError> {
    match state.peek() {
        Token::Spread => {
            let start = state.span().start;
            state.next();
            if matches!(state.peek(), Token::On) {
                state.next();
                let type_condition = if let Token::Name(name) = state.next() {
                    Some(Name::new(name))
                } else {
                    return Err(state.error("type name"));
                };
                let directives = parse_directives(state)?;
                let selection_set = parse_selection_set(state)?;
                let end = state.span().end;
                Ok(Selection::InlineFragment(InlineFragment {
                    span: Span::new(start, end),
                    type_condition,
                    directives,
                    selection_set,
                }))
            } else if matches!(state.peek(), Token::BraceOpen | Token::At) {
                let directives = parse_directives(state)?;
                let selection_set = parse_selection_set(state)?;
                let end = state.span().end;
                Ok(Selection::InlineFragment(InlineFragment {
                    span: Span::new(start, end),
                    type_condition: None,
                    directives,
                    selection_set,
                }))
            } else if let Token::Name(fragment_name) = state.next() {
                let directives = parse_directives(state)?;
                let end = state.span().end;
                Ok(Selection::FragmentSpread(FragmentSpread {
                    span: Span::new(start, end),
                    fragment_name: Name::new(fragment_name),
                    directives,
                }))
            } else {
                Err(state.error("fragment"))
            }
        }
        Token::Name(_) => Ok(Selection::Field(parse_field(state)?)),
        _ => Err(state.error("selection")),
    }
}

fn parse_field<'a>(state: &mut State<'a>) -> Result<Field<'a>, MearieError> {
    let start = state.span().start;
    let name_or_alias = if let Token::Name(name) = state.next() {
        name
    } else {
        return Err(state.error("field name"));
    };

    let (alias, name) = if matches!(state.peek(), Token::Colon) {
        state.next();
        if let Token::Name(name) = state.next() {
            (Some(Name::new(name_or_alias)), Name::new(name))
        } else {
            return Err(state.error("field name"));
        }
    } else {
        (None, Name::new(name_or_alias))
    };

    let arguments = parse_arguments(state)?;
    let directives = parse_directives(state)?;
    let selection_set = parse_selection_set(state)?;
    let end = state.span().end;

    Ok(Field {
        span: Span::new(start, end),
        alias,
        name,
        arguments,
        directives,
        selection_set,
    })
}

fn parse_operation_definition<'a>(state: &mut State<'a>) -> Result<OperationDefinition<'a>, MearieError> {
    let start = state.span().start;
    let operation_type = match state.peek() {
        Token::BraceOpen => {
            let selection_set = parse_selection_set(state)?;
            let end = state.span().end;
            return Ok(OperationDefinition {
                span: Span::new(start, end),
                operation_type: OperationType::Query,
                name: None,
                variable_definitions: Vec::new_in(state.alloc),
                directives: Vec::new_in(state.alloc),
                selection_set,
            });
        }
        Token::Query => {
            state.next();
            OperationType::Query
        }
        Token::Mutation => {
            state.next();
            OperationType::Mutation
        }
        Token::Subscription => {
            state.next();
            OperationType::Subscription
        }
        _ => return Err(state.error("operation type")),
    };

    let name = if let Token::Name(name) = state.peek() {
        state.next();
        Some(Name::new(name))
    } else {
        None
    };

    let mut variable_definitions = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::ParenOpen) {
        state.next();
        while !matches!(state.peek(), Token::ParenClose) {
            variable_definitions.push(parse_variable_definition(state)?);
        }
        state.next();
    }

    let directives = parse_directives(state)?;
    let selection_set = parse_selection_set(state)?;
    let end = state.span().end;

    Ok(OperationDefinition {
        span: Span::new(start, end),
        operation_type,
        name,
        variable_definitions,
        directives,
        selection_set,
    })
}

fn parse_fragment_definition<'a>(state: &mut State<'a>) -> Result<FragmentDefinition<'a>, MearieError> {
    let start = state.span().start;

    if !matches!(state.next(), Token::Fragment) {
        return Err(state.error("fragment"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("fragment name"));
    };

    if !matches!(state.next(), Token::On) {
        return Err(state.error("on"));
    }

    let type_condition = if let Token::Name(type_name) = state.next() {
        Name::new(type_name)
    } else {
        return Err(state.error("type name"));
    };

    let directives = parse_directives(state)?;
    let selection_set = parse_selection_set(state)?;
    let end = state.span().end;

    Ok(FragmentDefinition {
        span: Span::new(start, end),
        name,
        type_condition,
        directives,
        selection_set,
    })
}

fn parse_field_definition<'a>(state: &mut State<'a>) -> Result<FieldDefinition<'a>, MearieError> {
    let description = parse_description(state)?;

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("field name"));
    };

    let mut arguments = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::ParenOpen) {
        state.next();
        while !matches!(state.peek(), Token::ParenClose) {
            arguments.push(parse_input_value_definition(state)?);
        }
        state.next();
    }

    if !matches!(state.next(), Token::Colon) {
        return Err(state.error(":"));
    }

    let typ = parse_type(state)?;
    let directives = parse_directives(state)?;

    Ok(FieldDefinition {
        description,
        name,
        arguments,
        typ,
        directives,
    })
}

fn parse_object_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<ObjectTypeDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Type) {
        return Err(state.error("type"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("type name"));
    };

    let mut implements = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Implements) {
        state.next();
        while let Token::Name(iface) = state.peek() {
            state.next();
            implements.push(Name::new(iface));
            if !matches!(state.peek(), Token::Ampersand) {
                break;
            }
            state.next();
        }
    }

    let directives = parse_directives(state)?;

    let mut fields = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            fields.push(parse_field_definition(state)?);
        }
        state.next();
    }

    Ok(ObjectTypeDefinition {
        description,
        name,
        implements,
        directives,
        fields,
    })
}

fn parse_interface_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<InterfaceTypeDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Interface) {
        return Err(state.error("interface"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("interface name"));
    };

    let mut implements = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Implements) {
        state.next();
        while let Token::Name(iface) = state.peek() {
            state.next();
            implements.push(Name::new(iface));
            if !matches!(state.peek(), Token::Ampersand) {
                break;
            }
            state.next();
        }
    }

    let directives = parse_directives(state)?;

    let mut fields = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            fields.push(parse_field_definition(state)?);
        }
        state.next();
    }

    Ok(InterfaceTypeDefinition {
        description,
        name,
        implements,
        directives,
        fields,
    })
}

fn parse_enum_value_definition<'a>(state: &mut State<'a>) -> Result<EnumValueDefinition<'a>, MearieError> {
    let description = parse_description(state)?;

    let value = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("enum value"));
    };

    let directives = parse_directives(state)?;

    Ok(EnumValueDefinition {
        description,
        value,
        directives,
    })
}

fn parse_enum_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<EnumTypeDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Enum) {
        return Err(state.error("enum"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("enum name"));
    };

    let directives = parse_directives(state)?;

    let mut values = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            values.push(parse_enum_value_definition(state)?);
        }
        state.next();
    }

    Ok(EnumTypeDefinition {
        description,
        name,
        directives,
        values,
    })
}

fn parse_union_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<UnionTypeDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Union) {
        return Err(state.error("union"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("union name"));
    };

    let directives = parse_directives(state)?;

    let mut members = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Equals) {
        state.next();
        if matches!(state.peek(), Token::Pipe) {
            state.next();
        }
        while let Token::Name(member) = state.peek() {
            state.next();
            members.push(Name::new(member));
            if !matches!(state.peek(), Token::Pipe) {
                break;
            }
            state.next();
        }
    }

    Ok(UnionTypeDefinition {
        description,
        name,
        directives,
        members,
    })
}

fn parse_scalar_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<ScalarTypeDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Scalar) {
        return Err(state.error("scalar"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("scalar name"));
    };

    let directives = parse_directives(state)?;

    Ok(ScalarTypeDefinition {
        description,
        name,
        directives,
    })
}

fn parse_input_value_definition<'a>(state: &mut State<'a>) -> Result<InputValueDefinition<'a>, MearieError> {
    let description = parse_description(state)?;

    let name = Name::new(state.next_name_or_keyword("input field name")?);

    if !matches!(state.next(), Token::Colon) {
        return Err(state.error(":"));
    }

    let typ = parse_type(state)?;

    let default_value = if matches!(state.peek(), Token::Equals) {
        state.next();
        Some(parse_value(state)?)
    } else {
        None
    };

    let directives = parse_directives(state)?;

    Ok(InputValueDefinition {
        description,
        name,
        typ,
        default_value,
        directives,
    })
}

fn parse_input_object_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<InputObjectTypeDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Input) {
        return Err(state.error("input"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("input name"));
    };

    let directives = parse_directives(state)?;

    let mut fields = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            fields.push(parse_input_value_definition(state)?);
        }
        state.next();
    }

    Ok(InputObjectTypeDefinition {
        description,
        name,
        directives,
        fields,
    })
}

fn parse_type_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<TypeDefinition<'a>, MearieError> {
    match state.peek() {
        Token::Type => Ok(TypeDefinition::Object(parse_object_type_definition(
            state,
            description,
        )?)),
        Token::Interface => Ok(TypeDefinition::Interface(parse_interface_type_definition(
            state,
            description,
        )?)),
        Token::Enum => Ok(TypeDefinition::Enum(parse_enum_type_definition(state, description)?)),
        Token::Union => Ok(TypeDefinition::Union(parse_union_type_definition(state, description)?)),
        Token::Scalar => Ok(TypeDefinition::Scalar(parse_scalar_type_definition(
            state,
            description,
        )?)),
        Token::Input => Ok(TypeDefinition::InputObject(parse_input_object_type_definition(
            state,
            description,
        )?)),
        _ => Err(state.error("type definition")),
    }
}

fn parse_directive_location(name: &str) -> Option<DirectiveLocation> {
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

fn parse_directive_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<DirectiveDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Directive) {
        return Err(state.error("directive"));
    }

    if !matches!(state.next(), Token::At) {
        return Err(state.error("@"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("directive name"));
    };

    let mut arguments = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::ParenOpen) {
        state.next();
        while !matches!(state.peek(), Token::ParenClose) {
            arguments.push(parse_input_value_definition(state)?);
        }
        state.next();
    }

    let repeatable = if matches!(state.peek(), Token::Repeatable) {
        state.next();
        true
    } else {
        false
    };

    if !matches!(state.next(), Token::On) {
        return Err(state.error("on"));
    }

    let mut locations = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Pipe) {
        state.next();
    }

    while let Token::Name(loc_name) = state.peek() {
        if let Some(location) = parse_directive_location(loc_name) {
            state.next();
            locations.push(location);
            if matches!(state.peek(), Token::Pipe) {
                state.next();
            } else {
                break;
            }
        } else {
            return Err(state.error("directive location"));
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

fn parse_schema_definition<'a>(
    state: &mut State<'a>,
    description: Option<Description<'a>>,
) -> Result<SchemaDefinition<'a>, MearieError> {
    if !matches!(state.next(), Token::Schema) {
        return Err(state.error("schema"));
    }

    let directives = parse_directives(state)?;

    if !matches!(state.next(), Token::BraceOpen) {
        return Err(state.error("{"));
    }

    let mut query = None;
    let mut mutation = None;
    let mut subscription = None;

    while !matches!(state.peek(), Token::BraceClose) {
        let op_type = match state.next() {
            Token::Name(name) => name,
            Token::Query => "query",
            Token::Mutation => "mutation",
            Token::Subscription => "subscription",
            _ => return Err(state.error("operation type")),
        };

        if !matches!(state.next(), Token::Colon) {
            return Err(state.error(":"));
        }

        let type_name = if let Token::Name(name) = state.next() {
            Name::new(name)
        } else {
            return Err(state.error("type name"));
        };

        match op_type {
            "query" => query = Some(type_name),
            "mutation" => mutation = Some(type_name),
            "subscription" => subscription = Some(type_name),
            _ => return Err(state.error("operation type")),
        }
    }

    state.next();

    Ok(SchemaDefinition {
        description,
        directives,
        query,
        mutation,
        subscription,
    })
}

fn parse_type_system_definition<'a>(state: &mut State<'a>) -> Result<TypeSystemDefinition<'a>, MearieError> {
    let description = parse_description(state)?;
    match state.peek() {
        Token::Schema => Ok(TypeSystemDefinition::Schema(parse_schema_definition(
            state,
            description,
        )?)),
        Token::Directive => Ok(TypeSystemDefinition::Directive(parse_directive_definition(
            state,
            description,
        )?)),
        _ => Ok(TypeSystemDefinition::Type(parse_type_definition(state, description)?)),
    }
}

fn parse_object_type_extension<'a>(state: &mut State<'a>) -> Result<ObjectTypeExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Type) {
        return Err(state.error("type"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("type name"));
    };

    let mut implements = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Implements) {
        state.next();
        while let Token::Name(iface) = state.peek() {
            state.next();
            implements.push(Name::new(iface));
            if !matches!(state.peek(), Token::Ampersand) {
                break;
            }
            state.next();
        }
    }

    let directives = parse_directives(state)?;

    let mut fields = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            fields.push(parse_field_definition(state)?);
        }
        state.next();
    }

    Ok(ObjectTypeExtension {
        name,
        implements,
        directives,
        fields,
    })
}

fn parse_interface_type_extension<'a>(state: &mut State<'a>) -> Result<InterfaceTypeExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Interface) {
        return Err(state.error("interface"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("interface name"));
    };

    let mut implements = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Implements) {
        state.next();
        while let Token::Name(iface) = state.peek() {
            state.next();
            implements.push(Name::new(iface));
            if !matches!(state.peek(), Token::Ampersand) {
                break;
            }
            state.next();
        }
    }

    let directives = parse_directives(state)?;

    let mut fields = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            fields.push(parse_field_definition(state)?);
        }
        state.next();
    }

    Ok(InterfaceTypeExtension {
        name,
        implements,
        directives,
        fields,
    })
}

fn parse_scalar_type_extension<'a>(state: &mut State<'a>) -> Result<ScalarTypeExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Scalar) {
        return Err(state.error("scalar"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("scalar name"));
    };

    let directives = parse_directives(state)?;

    Ok(ScalarTypeExtension { name, directives })
}

fn parse_union_type_extension<'a>(state: &mut State<'a>) -> Result<UnionTypeExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Union) {
        return Err(state.error("union"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("union name"));
    };

    let directives = parse_directives(state)?;

    let mut members = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::Equals) {
        state.next();
        if matches!(state.peek(), Token::Pipe) {
            state.next();
        }
        while let Token::Name(member) = state.peek() {
            state.next();
            members.push(Name::new(member));
            if !matches!(state.peek(), Token::Pipe) {
                break;
            }
            state.next();
        }
    }

    Ok(UnionTypeExtension {
        name,
        directives,
        members,
    })
}

fn parse_enum_type_extension<'a>(state: &mut State<'a>) -> Result<EnumTypeExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Enum) {
        return Err(state.error("enum"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("enum name"));
    };

    let directives = parse_directives(state)?;

    let mut values = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            values.push(parse_enum_value_definition(state)?);
        }
        state.next();
    }

    Ok(EnumTypeExtension {
        name,
        directives,
        values,
    })
}

fn parse_input_object_type_extension<'a>(state: &mut State<'a>) -> Result<InputObjectTypeExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Input) {
        return Err(state.error("input"));
    }

    let name = if let Token::Name(name) = state.next() {
        Name::new(name)
    } else {
        return Err(state.error("input name"));
    };

    let directives = parse_directives(state)?;

    let mut fields = Vec::new_in(state.alloc);
    if matches!(state.peek(), Token::BraceOpen) {
        state.next();
        while !matches!(state.peek(), Token::BraceClose) {
            fields.push(parse_input_value_definition(state)?);
        }
        state.next();
    }

    Ok(InputObjectTypeExtension {
        name,
        directives,
        fields,
    })
}

fn parse_type_extension<'a>(state: &mut State<'a>) -> Result<TypeExtension<'a>, MearieError> {
    match state.peek() {
        Token::Scalar => Ok(TypeExtension::Scalar(parse_scalar_type_extension(state)?)),
        Token::Type => Ok(TypeExtension::Object(parse_object_type_extension(state)?)),
        Token::Interface => Ok(TypeExtension::Interface(parse_interface_type_extension(state)?)),
        Token::Union => Ok(TypeExtension::Union(parse_union_type_extension(state)?)),
        Token::Enum => Ok(TypeExtension::Enum(parse_enum_type_extension(state)?)),
        Token::Input => Ok(TypeExtension::InputObject(parse_input_object_type_extension(state)?)),
        _ => Err(state.error("type extension")),
    }
}

fn parse_type_system_extension<'a>(state: &mut State<'a>) -> Result<TypeSystemExtension<'a>, MearieError> {
    if !matches!(state.next(), Token::Extend) {
        return Err(state.error("extend"));
    }

    match state.peek() {
        Token::Scalar | Token::Type | Token::Interface | Token::Union | Token::Enum | Token::Input => {
            Ok(TypeSystemExtension::Type(parse_type_extension(state)?))
        }
        _ => Err(state.error("extend target")),
    }
}

fn parse_definition<'a>(state: &mut State<'a>) -> Result<Definition<'a>, MearieError> {
    match state.peek() {
        Token::Type
        | Token::Interface
        | Token::Enum
        | Token::Union
        | Token::Scalar
        | Token::Input
        | Token::Schema
        | Token::Directive
        | Token::StringValue(_)
        | Token::BlockStringValue(_) => Ok(Definition::TypeSystem(parse_type_system_definition(state)?)),
        Token::Extend => Ok(Definition::TypeSystemExtension(parse_type_system_extension(state)?)),
        Token::Fragment => Ok(Definition::Executable(ExecutableDefinition::Fragment(
            parse_fragment_definition(state)?,
        ))),
        _ => Ok(Definition::Executable(ExecutableDefinition::Operation(
            parse_operation_definition(state)?,
        ))),
    }
}

fn parse_document<'a>(state: &mut State<'a>) -> Result<Document<'a>, MearieError> {
    let mut definitions = Vec::new_in(state.alloc);

    loop {
        match state.peek() {
            Token::BraceClose => break,
            _ => {
                definitions.push(parse_definition(state)?);
            }
        }
    }

    Ok(Document {
        source: state.source,
        definitions,
    })
}

pub trait ParseNode<'a>: Sized {
    fn parse(state: &'a GraphQLContext, source: &'a Source<'a>) -> Result<&'a Self, MearieError>;
}

impl<'a> ParseNode<'a> for Document<'a> {
    fn parse(state: &'a GraphQLContext, source: &'a Source<'a>) -> Result<&'a Self, MearieError> {
        let mut parser_state = State::new(state, source);
        parse_document(&mut parser_state).map(|doc| state.alloc(doc))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assertables::*;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_parse_simple_query() {
        let state = GraphQLContext::new();
        let source = "query { user { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
        let doc = result.unwrap();
        assert_eq!(doc.definitions.len(), 1);
    }

    #[test]
    fn test_parse_query_with_variables() {
        let state = GraphQLContext::new();
        let source = "query GetUser($id: ID!) { user(id: $id) { id name } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_type_definition() {
        let state = GraphQLContext::new();
        let source = "type User { id: ID! name: String! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_enum() {
        let state = GraphQLContext::new();
        let source = "enum Status { ACTIVE INACTIVE }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_interface() {
        let state = GraphQLContext::new();
        let source = "interface Node { id: ID! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_union() {
        let state = GraphQLContext::new();
        let source = "union SearchResult = User | Post";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_unescape_string_simple() {
        let state = GraphQLContext::new();
        let result = unescape_string(r#""hello world""#, state.allocator());
        assert_ok!(&result);
        assert_eq!(result.unwrap(), "hello world");
    }

    #[test]
    fn test_unescape_string_with_newline() {
        let state = GraphQLContext::new();
        let result = unescape_string(r#""hello\nworld""#, state.allocator());
        assert_ok!(&result);
        assert_eq!(result.unwrap(), "hello\nworld");
    }

    #[test]
    fn test_unescape_string_with_unicode() {
        let state = GraphQLContext::new();
        let result = unescape_string(r#""hello\u0041""#, state.allocator());
        assert_ok!(&result);
        assert_eq!(result.unwrap(), "helloA");
    }

    #[test]
    fn test_parse_query_with_directive() {
        let state = GraphQLContext::new();
        let source = "query { user @skip(if: true) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_field_with_alias() {
        let state = GraphQLContext::new();
        let source = "query { userId: user { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_field_with_multiple_arguments() {
        let state = GraphQLContext::new();
        let source = "query { users(first: 10, offset: 20, orderBy: NAME) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_nested_selection_sets() {
        let state = GraphQLContext::new();
        let source = "query { user { posts { comments { author { name } } } } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_inline_fragment() {
        let state = GraphQLContext::new();
        let source = "query { search { ... { id } } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_inline_fragment_with_type_condition() {
        let state = GraphQLContext::new();
        let source = "query { search { ... on User { name } } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_variable_with_default_value() {
        let state = GraphQLContext::new();
        let source = "query($limit: Int = 10) { users(first: $limit) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_variable_with_list_type() {
        let state = GraphQLContext::new();
        let source = "query($ids: [ID!]!) { users(ids: $ids) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_mutation_with_input() {
        let state = GraphQLContext::new();
        let source = "mutation { createUser(input: { name: \"John\" }) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_subscription() {
        let state = GraphQLContext::new();
        let source = "subscription { userAdded { id name } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_multiple_operations() {
        let state = GraphQLContext::new();
        let source = r#"
            query GetUser { user { id } }
            query GetPosts { posts { id } }
        "#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
        let doc = result.unwrap();
        assert_eq!(doc.definitions.len(), 2);
    }

    #[test]
    fn test_parse_query_with_fragment_spread() {
        let state = GraphQLContext::new();
        let source = r#"
            query { user { ...UserFields } }
            fragment UserFields on User { id name }
        "#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_type_with_implements() {
        let state = GraphQLContext::new();
        let source = "type User implements Node { id: ID! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_type_with_multiple_interfaces() {
        let state = GraphQLContext::new();
        let source = "type User implements Node & Timestamped { id: ID! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_input_type() {
        let state = GraphQLContext::new();
        let source = "input UserInput { name: String! email: String! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_scalar_type() {
        let state = GraphQLContext::new();
        let source = "scalar DateTime";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_directive_definition() {
        let state = GraphQLContext::new();
        let source = "directive @auth on FIELD | OBJECT";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_schema_definition() {
        let state = GraphQLContext::new();
        let source = "schema { query: Query mutation: Mutation }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_extend_type() {
        let state = GraphQLContext::new();
        let source = "extend type User { avatar: String }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_extend_interface() {
        let state = GraphQLContext::new();
        let source = "extend interface Node { createdAt: String }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_type_with_description() {
        let state = GraphQLContext::new();
        let source = r#""A user in the system" type User { id: ID! }"#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_field_with_description() {
        let state = GraphQLContext::new();
        let source = r#"type User { "User ID" id: ID! }"#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_enum_with_description() {
        let state = GraphQLContext::new();
        let source = r#""User status" enum Status { ACTIVE INACTIVE }"#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_union_single_type() {
        let state = GraphQLContext::new();
        let source = "union Result = User";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_complex_query() {
        let state = GraphQLContext::new();
        let source = r#"
            query GetUserData($id: ID!, $includeEmail: Boolean = false) {
                user(id: $id) {
                    id
                    name
                    email @include(if: $includeEmail)
                    posts(first: 10) {
                        edges {
                            node {
                                title
                            }
                        }
                    }
                }
            }
        "#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_array_type() {
        let state = GraphQLContext::new();
        let source = "type User { tags: [String] }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_non_null_array() {
        let state = GraphQLContext::new();
        let source = "type User { tags: [String!]! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_field_with_arguments() {
        let state = GraphQLContext::new();
        let source = "type Query { users(limit: Int, offset: Int): [User] }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_repeatable_directive() {
        let state = GraphQLContext::new();
        let source = "directive @tag(name: String!) repeatable on FIELD";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_query_with_multiple_fields() {
        let state = GraphQLContext::new();
        let source = "query { user { id name email } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_mutation_with_multiple_inputs() {
        let state = GraphQLContext::new();
        let source = "mutation { createUser(name: \"John\", email: \"john@example.com\", age: 30) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_fragment_with_multiple_fields() {
        let state = GraphQLContext::new();
        let source = "fragment UserFields on User { id name email createdAt }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_enum_with_multiple_values() {
        let state = GraphQLContext::new();
        let source = "enum Role { ADMIN USER GUEST MODERATOR }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_input_with_default_values() {
        let state = GraphQLContext::new();
        let source = "input UserInput { name: String! age: Int = 18 }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_schema_with_all_operations() {
        let state = GraphQLContext::new();
        let source = "schema { query: Query mutation: Mutation subscription: Subscription }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_nested_fragments() {
        let state = GraphQLContext::new();
        let source = r#"
            query { user { ...UserWithPosts } }
            fragment UserWithPosts on User { id ...UserBasic }
            fragment UserBasic on User { name email }
        "#;
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_query_with_list_argument() {
        let state = GraphQLContext::new();
        let source = "query { users(ids: [1, 2, 3]) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_query_with_object_argument() {
        let state = GraphQLContext::new();
        let source = "query { createUser(input: { name: \"John\", age: 30 }) { id } }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_interface_with_fields() {
        let state = GraphQLContext::new();
        let source = "interface Node { id: ID! createdAt: String! }";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }

    #[test]
    fn test_parse_union_with_multiple_types() {
        let state = GraphQLContext::new();
        let source = "union SearchResult = User | Post | Comment";
        let binding = parse_source(source);
        let result = Document::parse(&state, &binding);
        assert_ok!(&result);
    }
}
