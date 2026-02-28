use crate::graphql::ast::*;

pub struct Printer {
    output: String,
    indent_level: usize,
    indent_string: &'static str,
}

impl Printer {
    fn new() -> Self {
        Self {
            output: String::new(),
            indent_level: 0,
            indent_string: "  ",
        }
    }

    fn write(&mut self, s: &str) {
        self.output.push_str(s);
    }

    fn write_line(&mut self, s: &str) {
        self.write(s);
        self.output.push('\n');
    }

    fn write_indent(&mut self) {
        for _ in 0..self.indent_level {
            self.write(self.indent_string);
        }
    }

    fn indent(&mut self) {
        self.indent_level += 1;
    }

    fn dedent(&mut self) {
        self.indent_level = self.indent_level.saturating_sub(1);
    }

    fn print_document(&mut self, doc: &Document) {
        let mut first = true;
        for def in &doc.definitions {
            if !first {
                self.output.push('\n');
            }
            first = false;
            self.print_definition(def);
        }
    }

    fn print_definition(&mut self, def: &Definition) {
        match def {
            Definition::Executable(exec) => self.print_executable_definition(exec),
            Definition::TypeSystem(ts) => self.print_type_system_definition(ts),
            Definition::TypeSystemExtension(ext) => self.print_type_system_extension(ext),
        }
    }

    fn print_executable_definition(&mut self, def: &ExecutableDefinition) {
        match def {
            ExecutableDefinition::Operation(op) => self.print_operation(op),
            ExecutableDefinition::Fragment(frag) => self.print_fragment_definition(frag),
        }
    }

    fn print_operation(&mut self, op: &OperationDefinition) {
        self.write(op.kind_str());

        if let Some(name) = op.name {
            self.write(" ");
            self.write(name.as_str());
        }

        if !op.variable_definitions.is_empty() {
            self.write("(");
            for (i, var) in op.variable_definitions.iter().enumerate() {
                if i > 0 {
                    self.write(", ");
                }
                self.print_variable_definition(var);
            }
            self.write(")");
        }

        self.print_directives(&op.directives);

        self.write(" ");
        self.print_selection_set(&op.selection_set);
        self.output.push('\n');
    }

    fn print_variable_definition(&mut self, var: &VariableDefinition) {
        self.write("$");
        self.write(var.variable.as_str());
        self.write(": ");
        self.print_type(&var.typ);

        if let Some(default) = &var.default_value {
            self.write(" = ");
            self.print_value(default);
        }

        self.print_directives(&var.directives);
    }

    fn print_fragment_definition(&mut self, frag: &FragmentDefinition) {
        self.write("fragment ");
        self.write(frag.name.as_str());

        if !frag.variable_definitions.is_empty() {
            self.write("(");
            for (i, var) in frag.variable_definitions.iter().enumerate() {
                if i > 0 {
                    self.write(", ");
                }
                self.print_variable_definition(var);
            }
            self.write(")");
        }

        self.write(" on ");
        self.write(frag.type_condition.as_str());
        self.print_directives(&frag.directives);
        self.write(" ");
        self.print_selection_set(&frag.selection_set);
        self.output.push('\n');
    }

    fn print_selection_set(&mut self, sel_set: &SelectionSet) {
        if sel_set.is_empty() {
            return;
        }

        self.write_line("{");
        self.indent();

        for selection in &sel_set.selections {
            self.write_indent();
            self.print_selection(selection);
            self.output.push('\n');
        }

        self.dedent();
        self.write_indent();
        self.write("}");
    }

    fn print_selection(&mut self, sel: &Selection) {
        match sel {
            Selection::Field(field) => self.print_field(field),
            Selection::FragmentSpread(spread) => self.print_fragment_spread(spread),
            Selection::InlineFragment(inline) => self.print_inline_fragment(inline),
        }
    }

    fn print_field(&mut self, field: &Field) {
        if let Some(alias) = field.alias {
            self.write(alias.as_str());
            self.write(": ");
        }

        self.write(field.name.as_str());

        if !field.arguments.is_empty() {
            self.write("(");
            for (i, arg) in field.arguments.iter().enumerate() {
                if i > 0 {
                    self.write(", ");
                }
                self.print_argument(arg);
            }
            self.write(")");
        }

        self.print_directives(&field.directives);

        if !field.selection_set.is_empty() {
            self.write(" ");
            self.print_selection_set(&field.selection_set);
        }
    }

    fn print_fragment_spread(&mut self, spread: &FragmentSpread) {
        self.write("...");
        self.write(spread.fragment_name.as_str());

        if !spread.arguments.is_empty() {
            self.write("(");
            for (i, arg) in spread.arguments.iter().enumerate() {
                if i > 0 {
                    self.write(", ");
                }
                self.print_argument(arg);
            }
            self.write(")");
        }

        self.print_directives(&spread.directives);
    }

    fn print_inline_fragment(&mut self, inline: &InlineFragment) {
        self.write("...");

        if let Some(type_condition) = inline.type_condition {
            self.write(" on ");
            self.write(type_condition.as_str());
        }

        self.print_directives(&inline.directives);
        self.write(" ");
        self.print_selection_set(&inline.selection_set);
    }

    fn print_argument(&mut self, arg: &Argument) {
        self.write(arg.name.as_str());
        self.write(": ");
        self.print_value(&arg.value);
    }

    fn print_directives(&mut self, directives: &[Directive]) {
        for directive in directives {
            self.write(" @");
            self.write(directive.name.as_str());

            if !directive.arguments.is_empty() {
                self.write("(");
                for (i, arg) in directive.arguments.iter().enumerate() {
                    if i > 0 {
                        self.write(", ");
                    }
                    self.print_argument(arg);
                }
                self.write(")");
            }
        }
    }

    fn print_type(&mut self, typ: &Type) {
        match typ {
            Type::Named(named) => self.write(named.name.as_str()),
            Type::List(inner) => {
                self.write("[");
                self.print_type(inner);
                self.write("]");
            }
            Type::NonNull(non_null) => {
                match non_null {
                    NonNullType::Named(named) => self.write(named.name.as_str()),
                    NonNullType::List(inner) => {
                        self.write("[");
                        self.print_type(inner);
                        self.write("]");
                    }
                }
                self.write("!");
            }
        }
    }

    fn print_value(&mut self, value: &Value) {
        match value {
            Value::Variable(name) => {
                self.write("$");
                self.write(name.as_str());
            }
            Value::Int(val) => self.write(val),
            Value::Float(val) => self.write(val),
            Value::String(val) => {
                self.write("\"");
                self.write(&escape_string(val));
                self.write("\"");
            }
            Value::Boolean(val) => self.write(if *val { "true" } else { "false" }),
            Value::Null => self.write("null"),
            Value::Enum(name) => self.write(name.as_str()),
            Value::List(values) => {
                self.write("[");
                for (i, val) in values.iter().enumerate() {
                    if i > 0 {
                        self.write(", ");
                    }
                    self.print_value(val);
                }
                self.write("]");
            }
            Value::Object(fields) => {
                self.write("{");
                for (i, field) in fields.iter().enumerate() {
                    if i > 0 {
                        self.write(", ");
                    }
                    self.write(field.name.as_str());
                    self.write(": ");
                    self.print_value(&field.value);
                }
                self.write("}");
            }
        }
    }

    fn print_type_system_definition(&mut self, def: &TypeSystemDefinition) {
        match def {
            TypeSystemDefinition::Schema(schema) => self.print_schema_definition(schema),
            TypeSystemDefinition::Type(typ) => self.print_type_definition(typ),
            TypeSystemDefinition::Directive(dir) => self.print_directive_definition(dir),
        }
    }

    fn print_schema_definition(&mut self, schema: &SchemaDefinition) {
        if let Some(desc) = &schema.description {
            self.print_description(desc);
        }

        self.write("schema");
        self.print_directives(&schema.directives);
        self.write_line(" {");
        self.indent();

        if let Some(query) = schema.query {
            self.write_indent();
            self.write("query: ");
            self.write_line(query.as_str());
        }

        if let Some(mutation) = schema.mutation {
            self.write_indent();
            self.write("mutation: ");
            self.write_line(mutation.as_str());
        }

        if let Some(subscription) = schema.subscription {
            self.write_indent();
            self.write("subscription: ");
            self.write_line(subscription.as_str());
        }

        self.dedent();
        self.write_line("}");
        self.output.push('\n');
    }

    fn print_type_definition(&mut self, typ: &TypeDefinition) {
        match typ {
            TypeDefinition::Scalar(scalar) => self.print_scalar_type_definition(scalar),
            TypeDefinition::Object(object) => self.print_object_type_definition(object),
            TypeDefinition::Interface(interface) => self.print_interface_type_definition(interface),
            TypeDefinition::Union(union) => self.print_union_type_definition(union),
            TypeDefinition::Enum(enum_def) => self.print_enum_type_definition(enum_def),
            TypeDefinition::InputObject(input) => self.print_input_object_type_definition(input),
        }
    }

    fn print_scalar_type_definition(&mut self, scalar: &ScalarTypeDefinition) {
        if let Some(desc) = &scalar.description {
            self.print_description(desc);
        }

        self.write("scalar ");
        self.write(scalar.name.as_str());
        self.print_directives(&scalar.directives);
        self.output.push('\n');
        self.output.push('\n');
    }

    fn print_object_type_definition(&mut self, object: &ObjectTypeDefinition) {
        if let Some(desc) = &object.description {
            self.print_description(desc);
        }

        self.write("type ");
        self.write(object.name.as_str());

        if !object.implements.is_empty() {
            self.write(" implements ");
            for (i, interface) in object.implements.iter().enumerate() {
                if i > 0 {
                    self.write(" & ");
                }
                self.write(interface.as_str());
            }
        }

        self.print_directives(&object.directives);

        if !object.fields.is_empty() {
            self.write_line(" {");
            self.indent();

            for field in &object.fields {
                self.print_field_definition(field);
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_interface_type_definition(&mut self, interface: &InterfaceTypeDefinition) {
        if let Some(desc) = &interface.description {
            self.print_description(desc);
        }

        self.write("interface ");
        self.write(interface.name.as_str());

        if !interface.implements.is_empty() {
            self.write(" implements ");
            for (i, implemented) in interface.implements.iter().enumerate() {
                if i > 0 {
                    self.write(" & ");
                }
                self.write(implemented.as_str());
            }
        }

        self.print_directives(&interface.directives);

        if !interface.fields.is_empty() {
            self.write_line(" {");
            self.indent();

            for field in &interface.fields {
                self.print_field_definition(field);
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_union_type_definition(&mut self, union: &UnionTypeDefinition) {
        if let Some(desc) = &union.description {
            self.print_description(desc);
        }

        self.write("union ");
        self.write(union.name.as_str());
        self.print_directives(&union.directives);

        if !union.members.is_empty() {
            self.write(" = ");
            for (i, member) in union.members.iter().enumerate() {
                if i > 0 {
                    self.write(" | ");
                }
                self.write(member.as_str());
            }
        }

        self.output.push('\n');
        self.output.push('\n');
    }

    fn print_enum_type_definition(&mut self, enum_def: &EnumTypeDefinition) {
        if let Some(desc) = &enum_def.description {
            self.print_description(desc);
        }

        self.write("enum ");
        self.write(enum_def.name.as_str());
        self.print_directives(&enum_def.directives);

        if !enum_def.values.is_empty() {
            self.write_line(" {");
            self.indent();

            for value in &enum_def.values {
                if let Some(desc) = &value.description {
                    self.print_description(desc);
                }
                self.write_indent();
                self.write(value.value.as_str());
                self.print_directives(&value.directives);
                self.output.push('\n');
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_input_object_type_definition(&mut self, input: &InputObjectTypeDefinition) {
        if let Some(desc) = &input.description {
            self.print_description(desc);
        }

        self.write("input ");
        self.write(input.name.as_str());
        self.print_directives(&input.directives);

        if !input.fields.is_empty() {
            self.write_line(" {");
            self.indent();

            for field in &input.fields {
                self.print_input_value_definition(field);
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_field_definition(&mut self, field: &FieldDefinition) {
        if let Some(desc) = &field.description {
            self.print_description(desc);
        }

        self.write_indent();
        self.write(field.name.as_str());

        if !field.arguments.is_empty() {
            self.write("(");
            for (i, arg) in field.arguments.iter().enumerate() {
                if i > 0 {
                    self.write(", ");
                }
                self.write(arg.name.as_str());
                self.write(": ");
                self.print_type(&arg.typ);

                if let Some(default) = &arg.default_value {
                    self.write(" = ");
                    self.print_value(default);
                }
            }
            self.write(")");
        }

        self.write(": ");
        self.print_type(&field.typ);
        self.print_directives(&field.directives);
        self.output.push('\n');
    }

    fn print_input_value_definition(&mut self, input: &InputValueDefinition) {
        if let Some(desc) = &input.description {
            self.print_description(desc);
        }

        self.write_indent();
        self.write(input.name.as_str());
        self.write(": ");
        self.print_type(&input.typ);

        if let Some(default) = &input.default_value {
            self.write(" = ");
            self.print_value(default);
        }

        self.print_directives(&input.directives);
        self.output.push('\n');
    }

    fn print_directive_definition(&mut self, dir: &DirectiveDefinition) {
        if let Some(desc) = &dir.description {
            self.print_description(desc);
        }

        self.write("directive @");
        self.write(dir.name.as_str());

        if !dir.arguments.is_empty() {
            self.write("(");
            for (i, arg) in dir.arguments.iter().enumerate() {
                if i > 0 {
                    self.write(", ");
                }
                self.write(arg.name.as_str());
                self.write(": ");
                self.print_type(&arg.typ);

                if let Some(default) = &arg.default_value {
                    self.write(" = ");
                    self.print_value(default);
                }
            }
            self.write(")");
        }

        if dir.repeatable {
            self.write(" repeatable");
        }

        self.write(" on ");
        for (i, loc) in dir.locations.iter().enumerate() {
            if i > 0 {
                self.write(" | ");
            }
            self.write(directive_location_str(*loc));
        }

        self.output.push('\n');
        self.output.push('\n');
    }

    fn print_type_system_extension(&mut self, ext: &TypeSystemExtension) {
        match ext {
            TypeSystemExtension::Schema(schema) => self.print_schema_extension(schema),
            TypeSystemExtension::Type(typ) => self.print_type_extension(typ),
        }
    }

    fn print_schema_extension(&mut self, schema: &SchemaExtension) {
        self.write("extend schema");
        self.print_directives(&schema.directives);
        self.write_line(" {");
        self.indent();

        if let Some(query) = schema.query {
            self.write_indent();
            self.write("query: ");
            self.write_line(query.as_str());
        }

        if let Some(mutation) = schema.mutation {
            self.write_indent();
            self.write("mutation: ");
            self.write_line(mutation.as_str());
        }

        if let Some(subscription) = schema.subscription {
            self.write_indent();
            self.write("subscription: ");
            self.write_line(subscription.as_str());
        }

        self.dedent();
        self.write_line("}");
        self.output.push('\n');
    }

    fn print_type_extension(&mut self, ext: &TypeExtension) {
        match ext {
            TypeExtension::Scalar(scalar) => self.print_scalar_type_extension(scalar),
            TypeExtension::Object(object) => self.print_object_type_extension(object),
            TypeExtension::Interface(interface) => self.print_interface_type_extension(interface),
            TypeExtension::Union(union) => self.print_union_type_extension(union),
            TypeExtension::Enum(enum_ext) => self.print_enum_type_extension(enum_ext),
            TypeExtension::InputObject(input) => self.print_input_object_type_extension(input),
        }
    }

    fn print_scalar_type_extension(&mut self, scalar: &ScalarTypeExtension) {
        self.write("extend scalar ");
        self.write(scalar.name.as_str());
        self.print_directives(&scalar.directives);
        self.output.push('\n');
        self.output.push('\n');
    }

    fn print_object_type_extension(&mut self, object: &ObjectTypeExtension) {
        self.write("extend type ");
        self.write(object.name.as_str());

        if !object.implements.is_empty() {
            self.write(" implements ");
            for (i, interface) in object.implements.iter().enumerate() {
                if i > 0 {
                    self.write(" & ");
                }
                self.write(interface.as_str());
            }
        }

        self.print_directives(&object.directives);

        if !object.fields.is_empty() {
            self.write_line(" {");
            self.indent();

            for field in &object.fields {
                self.print_field_definition(field);
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_interface_type_extension(&mut self, interface: &InterfaceTypeExtension) {
        self.write("extend interface ");
        self.write(interface.name.as_str());

        if !interface.implements.is_empty() {
            self.write(" implements ");
            for (i, implemented) in interface.implements.iter().enumerate() {
                if i > 0 {
                    self.write(" & ");
                }
                self.write(implemented.as_str());
            }
        }

        self.print_directives(&interface.directives);

        if !interface.fields.is_empty() {
            self.write_line(" {");
            self.indent();

            for field in &interface.fields {
                self.print_field_definition(field);
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_union_type_extension(&mut self, union: &UnionTypeExtension) {
        self.write("extend union ");
        self.write(union.name.as_str());
        self.print_directives(&union.directives);

        if !union.members.is_empty() {
            self.write(" = ");
            for (i, member) in union.members.iter().enumerate() {
                if i > 0 {
                    self.write(" | ");
                }
                self.write(member.as_str());
            }
        }

        self.output.push('\n');
        self.output.push('\n');
    }

    fn print_enum_type_extension(&mut self, enum_ext: &EnumTypeExtension) {
        self.write("extend enum ");
        self.write(enum_ext.name.as_str());
        self.print_directives(&enum_ext.directives);

        if !enum_ext.values.is_empty() {
            self.write_line(" {");
            self.indent();

            for value in &enum_ext.values {
                if let Some(desc) = &value.description {
                    self.print_description(desc);
                }
                self.write_indent();
                self.write(value.value.as_str());
                self.print_directives(&value.directives);
                self.output.push('\n');
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_input_object_type_extension(&mut self, input: &InputObjectTypeExtension) {
        self.write("extend input ");
        self.write(input.name.as_str());
        self.print_directives(&input.directives);

        if !input.fields.is_empty() {
            self.write_line(" {");
            self.indent();

            for field in &input.fields {
                self.print_input_value_definition(field);
            }

            self.dedent();
            self.write_line("}");
        }

        self.output.push('\n');
    }

    fn print_description(&mut self, desc: &Description) {
        self.write_indent();
        self.write("\"\"\"");
        self.write_line(desc.value);
        self.write_indent();
        self.write_line("\"\"\"");
    }
}

pub fn print_document(doc: &Document) -> String {
    let mut printer = Printer::new();
    printer.print_document(doc);
    printer.output
}

pub fn print_definitions(definitions: &[Definition]) -> String {
    let mut printer = Printer::new();
    let mut first = true;
    for def in definitions {
        if !first {
            printer.output.push('\n');
        }
        first = false;
        printer.print_definition(def);
    }
    printer.output
}

fn escape_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn directive_location_str(loc: DirectiveLocation) -> &'static str {
    match loc {
        DirectiveLocation::Query => "QUERY",
        DirectiveLocation::Mutation => "MUTATION",
        DirectiveLocation::Subscription => "SUBSCRIPTION",
        DirectiveLocation::Field => "FIELD",
        DirectiveLocation::FragmentDefinition => "FRAGMENT_DEFINITION",
        DirectiveLocation::FragmentSpread => "FRAGMENT_SPREAD",
        DirectiveLocation::InlineFragment => "INLINE_FRAGMENT",
        DirectiveLocation::VariableDefinition => "VARIABLE_DEFINITION",
        DirectiveLocation::Schema => "SCHEMA",
        DirectiveLocation::Scalar => "SCALAR",
        DirectiveLocation::Object => "OBJECT",
        DirectiveLocation::FieldDefinition => "FIELD_DEFINITION",
        DirectiveLocation::ArgumentDefinition => "ARGUMENT_DEFINITION",
        DirectiveLocation::Interface => "INTERFACE",
        DirectiveLocation::Union => "UNION",
        DirectiveLocation::Enum => "ENUM",
        DirectiveLocation::EnumValue => "ENUM_VALUE",
        DirectiveLocation::InputObject => "INPUT_OBJECT",
        DirectiveLocation::InputFieldDefinition => "INPUT_FIELD_DEFINITION",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arena::Arena;
    use crate::graphql::parser::Parser;
    use crate::source::Source;

    #[test]
    fn test_print_simple_query() {
        let arena = Arena::new();
        let source = Source::ephemeral("query { user { id name } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("query"));
        assert!(printed.contains("user"));
        assert!(printed.contains("id"));
        assert!(printed.contains("name"));
    }

    #[test]
    fn test_print_named_query() {
        let arena = Arena::new();
        let source = Source::ephemeral("query GetUser { user { id } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("query GetUser"));
        assert!(printed.contains("user"));
        assert!(printed.contains("id"));
    }

    #[test]
    fn test_print_query_with_variables() {
        let arena = Arena::new();
        let source = Source::ephemeral("query GetUser($id: ID!) { user(id: $id) { name } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("$id: ID!"));
        assert!(printed.contains("user(id: $id)"));
    }

    #[test]
    fn test_print_mutation() {
        let arena = Arena::new();
        let source = Source::ephemeral("mutation CreateUser($name: String!) { createUser(name: $name) { id } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("mutation CreateUser"));
        assert!(printed.contains("$name: String!"));
        assert!(printed.contains("createUser"));
    }

    #[test]
    fn test_print_fragment() {
        let arena = Arena::new();
        let source = Source::ephemeral("fragment UserFields on User { id name email }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("fragment UserFields on User"));
        assert!(printed.contains("id"));
        assert!(printed.contains("name"));
        assert!(printed.contains("email"));
    }

    #[test]
    fn test_print_fragment_spread() {
        let arena = Arena::new();
        let source = Source::ephemeral("query { user { ...UserFields } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("...UserFields"));
    }

    #[test]
    fn test_print_inline_fragment() {
        let arena = Arena::new();
        let source = Source::ephemeral("query { node { ... on User { name } } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("... on User"));
        assert!(printed.contains("name"));
    }

    #[test]
    fn test_print_field_with_arguments() {
        let arena = Arena::new();
        let source = Source::ephemeral(r#"query { user(id: "123", active: true) { name } }"#);
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("user("));
        assert!(printed.contains("id:"));
        assert!(printed.contains("active:"));
    }

    #[test]
    fn test_print_field_with_alias() {
        let arena = Arena::new();
        let source = Source::ephemeral("query { admin: user(id: \"1\") { name } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("admin:"));
        assert!(printed.contains("user"));
    }

    #[test]
    fn test_print_directive() {
        let arena = Arena::new();
        let source = Source::ephemeral("query { user @include(if: true) { name } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("@include"));
        assert!(printed.contains("if:"));
    }

    #[test]
    fn test_print_list_type() {
        let arena = Arena::new();
        let source = Source::ephemeral("query GetUsers($ids: [ID!]!) { users(ids: $ids) { name } }");
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("[ID!]!"));
    }

    #[test]
    fn test_print_values() {
        let arena = Arena::new();
        let source = Source::ephemeral(
            r#"query {
                test(
                    int: 42,
                    float: 3.14,
                    string: "hello",
                    bool: true,
                    nullValue: null,
                    enum: ACTIVE,
                    list: [1, 2, 3],
                    object: {key: "value"}
                ) {
                    field
                }
            }"#,
        );
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("int:"));
        assert!(printed.contains("42"));
        assert!(printed.contains("float:"));
        assert!(printed.contains("3.14"));
        assert!(printed.contains("string:"));
        assert!(printed.contains("\"hello\""));
        assert!(printed.contains("bool:"));
        assert!(printed.contains("true"));
        assert!(printed.contains("nullValue:"));
        assert!(printed.contains("null"));
        assert!(printed.contains("enum:"));
        assert!(printed.contains("ACTIVE"));
        assert!(printed.contains("list:"));
        assert!(printed.contains("["));
        assert!(printed.contains("object:"));
        assert!(printed.contains("{"));
    }

    #[test]
    fn test_print_multiple_operations() {
        let arena = Arena::new();
        let source = Source::ephemeral(
            "query GetUser { user { id } }
             mutation CreateUser { createUser { id } }",
        );
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        assert!(printed.contains("query GetUser"));
        assert!(printed.contains("mutation CreateUser"));
    }

    #[test]
    fn test_roundtrip() {
        let arena = Arena::new();
        let source = Source::ephemeral(
            r#"query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                    email
                }
            }"#,
        );
        let doc = Parser::new(&arena).with_source(&source).parse().unwrap();

        let printed = print_document(doc);

        let source2 = Source::ephemeral(&printed);
        let doc2 = Parser::new(&arena).with_source(&source2).parse().unwrap();

        let printed2 = print_document(doc2);

        assert_eq!(printed, printed2);
    }
}
