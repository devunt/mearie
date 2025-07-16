use crate::ast::*;
use std::{fmt, fmt::Write};

pub trait PrintNode {
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result;

    fn print(&self) -> String {
        let mut buf = String::new();
        match self.write_to_buffer(0, &mut buf) {
            Ok(()) => buf,
            Err(_) => String::new(),
        }
    }
}

impl fmt::Display for dyn PrintNode {
    #[inline]
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.write_to_buffer(0, f)
    }
}

const INDENT_SIZE: usize = 2;

#[inline(always)]
fn write_indent(level: usize, buffer: &mut dyn Write) -> fmt::Result {
    for _ in 0..(level * INDENT_SIZE) {
        buffer.write_char(' ')?;
    }
    Ok(())
}

#[inline]
fn write_arguments<'a>(arguments: &[Argument<'a>], level: usize, buffer: &mut dyn Write) -> fmt::Result {
    let mut first = true;
    for arg in arguments {
        if !first {
            buffer.write_str(", ")?;
        }
        first = false;
        write!(buffer, "{}: ", arg.name)?;
        arg.value.write_to_buffer(level, buffer)?;
    }
    Ok(())
}

#[inline]
fn write_directives<'a>(directives: &[Directive<'a>], level: usize, buffer: &mut dyn Write) -> fmt::Result {
    for directive in directives {
        buffer.write_str(" @")?;
        buffer.write_str(&directive.name)?;
        if !directive.arguments.is_empty() {
            buffer.write_char('(')?;
            write_arguments(&directive.arguments, level, buffer)?;
            buffer.write_char(')')?;
        }
    }
    Ok(())
}

impl<'a> PrintNode for Value<'a> {
    #[inline]
    fn write_to_buffer(&self, _level: usize, buffer: &mut dyn Write) -> fmt::Result {
        match self {
            Value::Variable(name) => write!(buffer, "${}", name),
            Value::Int(value) => buffer.write_str(value),
            Value::Float(value) => buffer.write_str(value),
            Value::String(value) => {
                buffer.write_char('"')?;
                for c in value.chars() {
                    match c {
                        '\r' => buffer.write_str(r"\r")?,
                        '\n' => buffer.write_str(r"\n")?,
                        '\t' => buffer.write_str(r"\t")?,
                        '"' => buffer.write_str("\\\"")?,
                        '\\' => buffer.write_str(r"\\")?,
                        '\u{0020}'..='\u{FFFF}' => buffer.write_char(c)?,
                        _ => write!(buffer, "\\u{:04x}", c as u32)?,
                    }
                }
                buffer.write_char('"')
            }
            Value::Boolean(true) => buffer.write_str("true"),
            Value::Boolean(false) => buffer.write_str("false"),
            Value::Null => buffer.write_str("null"),
            Value::Enum(value) => buffer.write_str(value),
            Value::List(values) => {
                buffer.write_str("[")?;
                let mut first = true;
                for value in values.iter() {
                    if first {
                        first = false;
                    } else {
                        buffer.write_str(", ")?;
                    }
                    value.write_to_buffer(_level, buffer)?;
                }
                buffer.write_str("]")
            }
            Value::Object(fields) => {
                buffer.write_str("{")?;
                let mut first = true;
                for field in fields.iter() {
                    if first {
                        first = false;
                    } else {
                        buffer.write_str(", ")?;
                    }
                    write!(buffer, "{}: ", field.name)?;
                    field.value.write_to_buffer(_level, buffer)?;
                }
                buffer.write_str("}")
            }
        }
    }
}

impl<'a> PrintNode for Type<'a> {
    #[inline]
    fn write_to_buffer(&self, _level: usize, buffer: &mut dyn Write) -> fmt::Result {
        match self {
            Type::Named(named) => buffer.write_str(named.name),
            Type::List(inner) => {
                buffer.write_str("[")?;
                inner.write_to_buffer(_level, buffer)?;
                buffer.write_str("]")
            }
            Type::NonNull(inner) => match inner {
                NonNullType::Named(named) => {
                    buffer.write_str(named.name)?;
                    buffer.write_str("!")
                }
                NonNullType::List(inner) => {
                    buffer.write_str("[")?;
                    inner.write_to_buffer(_level, buffer)?;
                    buffer.write_str("]!")
                }
            },
        }
    }
}

impl<'a> PrintNode for SelectionSet<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        if !self.is_empty() {
            let level = level + 1;
            buffer.write_str("{")?;
            for selection in self.selections.iter() {
                buffer.write_char('\n')?;
                write_indent(level, buffer)?;
                match selection {
                    Selection::Field(field) => field.write_to_buffer(level, buffer)?,
                    Selection::FragmentSpread(spread) => spread.write_to_buffer(level, buffer)?,
                    Selection::InlineFragment(inline) => inline.write_to_buffer(level, buffer)?,
                };
            }
            buffer.write_char('\n')?;
            write_indent(level - 1, buffer)?;
            buffer.write_char('}')
        } else {
            Ok(())
        }
    }
}

impl<'a> PrintNode for Field<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        if let Some(alias) = self.alias {
            write!(buffer, "{}: {}", alias, self.name)?;
        } else {
            buffer.write_str(&self.name)?;
        }

        if !self.arguments.is_empty() {
            buffer.write_char('(')?;
            write_arguments(&self.arguments, level, buffer)?;
            buffer.write_char(')')?;
        }

        write_directives(&self.directives, level, buffer)?;

        if !self.selection_set.is_empty() {
            buffer.write_str(" ")?;
        }
        self.selection_set.write_to_buffer(level, buffer)
    }
}

impl<'a> PrintNode for FragmentSpread<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        write!(buffer, "...{}", self.fragment_name)?;
        write_directives(&self.directives, level, buffer)
    }
}

impl<'a> PrintNode for InlineFragment<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        buffer.write_str("...")?;
        if let Some(type_condition) = self.type_condition {
            write!(buffer, " on {}", type_condition)?;
        }
        write_directives(&self.directives, level, buffer)?;
        buffer.write_char(' ')?;
        self.selection_set.write_to_buffer(level, buffer)
    }
}

impl<'a> PrintNode for VariableDefinition<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        write!(buffer, "${}: ", self.variable)?;
        self.typ.write_to_buffer(level, buffer)?;
        if let Some(default_value) = &self.default_value {
            buffer.write_str(" = ")?;
            default_value.write_to_buffer(level, buffer)?;
        }
        write_directives(&self.directives, level, buffer)
    }
}

impl<'a> PrintNode for OperationDefinition<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        if self.operation_type == OperationType::Query
            && self.name.is_none()
            && self.variable_definitions.is_empty()
            && self.directives.is_empty()
        {
            return self.selection_set.write_to_buffer(level, buffer);
        }

        match self.operation_type {
            OperationType::Query => buffer.write_str("query")?,
            OperationType::Mutation => buffer.write_str("mutation")?,
            OperationType::Subscription => buffer.write_str("subscription")?,
        }

        if let Some(name) = self.name {
            write!(buffer, " {}", name)?;
        }

        if !self.variable_definitions.is_empty() {
            if self.name.is_none() {
                buffer.write_char(' ')?;
            }
            buffer.write_char('(')?;
            let mut first = true;
            for var_def in &self.variable_definitions {
                if !first {
                    buffer.write_str(", ")?;
                }
                first = false;
                var_def.write_to_buffer(level, buffer)?;
            }
            buffer.write_char(')')?;
        }

        write_directives(&self.directives, level, buffer)?;

        buffer.write_str(" ")?;
        self.selection_set.write_to_buffer(level, buffer)
    }
}

impl<'a> PrintNode for FragmentDefinition<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        write!(buffer, "fragment {} on {}", self.name, self.type_condition)?;
        write_directives(&self.directives, level, buffer)?;
        buffer.write_char(' ')?;
        self.selection_set.write_to_buffer(level, buffer)
    }
}

impl<'a> PrintNode for ExecutableDefinition<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        match self {
            ExecutableDefinition::Operation(op) => op.write_to_buffer(level, buffer),
            ExecutableDefinition::Fragment(frag) => frag.write_to_buffer(level, buffer),
        }
    }
}

impl<'a> PrintNode for Document<'a> {
    #[inline]
    fn write_to_buffer(&self, level: usize, buffer: &mut dyn Write) -> fmt::Result {
        let mut first = true;
        for definition in self.definitions.iter() {
            if first {
                first = false;
            } else {
                buffer.write_str("\n\n")?;
            }
            if let Definition::Executable(exec) = definition {
                exec.write_to_buffer(level, buffer)?
            }
        }
        Ok(())
    }

    #[inline]
    fn print(&self) -> String {
        let capacity = self.source.code.len();
        let mut buf = String::with_capacity(capacity);
        match self.write_to_buffer(0, &mut buf) {
            Ok(()) => buf,
            Err(_) => String::new(),
        }
    }
}
