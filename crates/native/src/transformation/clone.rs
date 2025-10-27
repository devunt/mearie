use crate::arena::Arena;
use crate::graphql::ast::*;

pub fn clone_definition<'a>(_arena: &'a Arena, def: &Definition<'a>) -> Definition<'a> {
    match def {
        Definition::TypeSystem(ts) => Definition::TypeSystem(ts.clone()),
        Definition::TypeSystemExtension(ext) => Definition::TypeSystemExtension(ext.clone()),
        Definition::Executable(_) => {
            unreachable!("Executable definitions should be transformed, not cloned")
        }
    }
}

pub fn clone_variable_definition<'a>(arena: &'a Arena, var: &VariableDefinition<'a>) -> VariableDefinition<'a> {
    let mut directives = bumpalo::vec![in arena.allocator();];
    for d in &var.directives {
        directives.push(clone_directive(arena, d));
    }

    VariableDefinition {
        span: var.span,
        variable: var.variable,
        typ: clone_type(arena, &var.typ),
        default_value: var.default_value.as_ref().map(|v| clone_value(arena, v)),
        directives,
    }
}

pub fn clone_selection_set<'a>(arena: &'a Arena, sel_set: &SelectionSet<'a>) -> SelectionSet<'a> {
    let mut selections = bumpalo::vec![in arena.allocator();];
    for s in &sel_set.selections {
        selections.push(clone_selection(arena, s));
    }

    SelectionSet { selections }
}

pub fn clone_selection<'a>(arena: &'a Arena, sel: &Selection<'a>) -> Selection<'a> {
    match sel {
        Selection::Field(f) => Selection::Field(clone_field(arena, f)),
        Selection::FragmentSpread(fs) => Selection::FragmentSpread(clone_fragment_spread(arena, fs)),
        Selection::InlineFragment(inf) => Selection::InlineFragment(clone_inline_fragment(arena, inf)),
    }
}

pub fn clone_field<'a>(arena: &'a Arena, field: &Field<'a>) -> Field<'a> {
    let mut arguments = bumpalo::vec![in arena.allocator();];
    for a in &field.arguments {
        arguments.push(clone_argument(arena, a));
    }

    let mut directives = bumpalo::vec![in arena.allocator();];
    for d in &field.directives {
        directives.push(clone_directive(arena, d));
    }

    Field {
        span: field.span,
        alias: field.alias,
        name: field.name,
        arguments,
        directives,
        selection_set: clone_selection_set(arena, &field.selection_set),
    }
}

pub fn clone_fragment_spread<'a>(arena: &'a Arena, spread: &FragmentSpread<'a>) -> FragmentSpread<'a> {
    let mut directives = bumpalo::vec![in arena.allocator();];
    for d in &spread.directives {
        directives.push(clone_directive(arena, d));
    }

    FragmentSpread {
        span: spread.span,
        fragment_name: spread.fragment_name,
        directives,
    }
}

pub fn clone_inline_fragment<'a>(arena: &'a Arena, inline: &InlineFragment<'a>) -> InlineFragment<'a> {
    let mut directives = bumpalo::vec![in arena.allocator();];
    for d in &inline.directives {
        directives.push(clone_directive(arena, d));
    }

    InlineFragment {
        span: inline.span,
        type_condition: inline.type_condition,
        directives,
        selection_set: clone_selection_set(arena, &inline.selection_set),
    }
}

pub fn clone_directive<'a>(arena: &'a Arena, dir: &Directive<'a>) -> Directive<'a> {
    let mut arguments = bumpalo::vec![in arena.allocator();];
    for a in &dir.arguments {
        arguments.push(clone_argument(arena, a));
    }

    Directive {
        span: dir.span,
        name: dir.name,
        arguments,
    }
}

pub fn clone_argument<'a>(arena: &'a Arena, arg: &Argument<'a>) -> Argument<'a> {
    Argument {
        span: arg.span,
        name: arg.name,
        value: clone_value(arena, &arg.value),
    }
}

pub fn clone_value<'a>(arena: &'a Arena, val: &Value<'a>) -> Value<'a> {
    match val {
        Value::Variable(name) => Value::Variable(*name),
        Value::Int(s) => Value::Int(arena.intern(s)),
        Value::Float(s) => Value::Float(arena.intern(s)),
        Value::String(s) => Value::String(arena.intern(s)),
        Value::Boolean(b) => Value::Boolean(*b),
        Value::Null => Value::Null,
        Value::Enum(name) => Value::Enum(*name),
        Value::List(items) => {
            let mut new_items = bumpalo::vec![in arena.allocator();];
            for v in items {
                new_items.push(clone_value(arena, v));
            }
            Value::List(new_items)
        }
        Value::Object(fields) => {
            let mut new_fields = bumpalo::vec![in arena.allocator();];
            for f in fields {
                new_fields.push(clone_object_field(arena, f));
            }
            Value::Object(new_fields)
        }
    }
}

pub fn clone_object_field<'a>(arena: &'a Arena, field: &ObjectField<'a>) -> ObjectField<'a> {
    ObjectField {
        name: field.name,
        value: clone_value(arena, &field.value),
    }
}

pub fn clone_type<'a>(arena: &'a Arena, typ: &Type<'a>) -> Type<'a> {
    match typ {
        Type::Named(named) => Type::Named(NamedType { name: named.name }),
        Type::List(inner) => Type::List(arena.alloc(clone_type(arena, inner))),
        Type::NonNull(non_null) => Type::NonNull(arena.alloc(clone_non_null_type(arena, non_null))),
    }
}

pub fn clone_non_null_type<'a>(arena: &'a Arena, typ: &NonNullType<'a>) -> NonNullType<'a> {
    match typ {
        NonNullType::Named(named) => NonNullType::Named(NamedType { name: named.name }),
        NonNullType::List(inner) => NonNullType::List(arena.alloc(clone_type(arena, inner))),
    }
}
