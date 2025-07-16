use super::context::SchemaProvider;
use crate::ast::*;
use rustc_hash::FxHashMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GraphQLType<'a> {
    Object(&'a ObjectTypeDefinition<'a>),
    Interface(&'a InterfaceTypeDefinition<'a>),
    Union(&'a UnionTypeDefinition<'a>),
    Enum(&'a EnumTypeDefinition<'a>),
    Scalar(&'a ScalarTypeDefinition<'a>),
    InputObject(&'a InputObjectTypeDefinition<'a>),
}

#[derive(Default)]
pub struct TestSchema<'a> {
    types: FxHashMap<&'a str, GraphQLType<'a>>,
    fragments: FxHashMap<&'a str, &'a FragmentDefinition<'a>>,
    directives: FxHashMap<&'a str, &'a DirectiveDefinition<'a>>,
}

impl<'a> TestSchema<'a> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_document(document: &'a Document<'a>) -> Self {
        let mut schema = Self::new();
        schema.load_schema(document);
        schema
    }

    pub fn load_schema(&mut self, document: &'a Document<'a>) {
        for definition in &document.definitions {
            match definition {
                Definition::TypeSystem(TypeSystemDefinition::Type(type_def)) => {
                    self.register_type_definition(type_def);
                }
                Definition::TypeSystem(TypeSystemDefinition::Directive(directive_def)) => {
                    self.directives.insert(directive_def.name.as_str(), directive_def);
                }
                Definition::Executable(ExecutableDefinition::Fragment(fragment)) => {
                    self.fragments.insert(fragment.name.as_str(), fragment);
                }
                _ => {}
            }
        }
    }

    fn register_type_definition(&mut self, type_def: &'a TypeDefinition<'a>) {
        let (name, type_) = match type_def {
            TypeDefinition::Scalar(scalar) => (scalar.name.as_str(), GraphQLType::Scalar(scalar)),
            TypeDefinition::Object(obj) => (obj.name.as_str(), GraphQLType::Object(obj)),
            TypeDefinition::Interface(interface) => (interface.name.as_str(), GraphQLType::Interface(interface)),
            TypeDefinition::Union(union) => (union.name.as_str(), GraphQLType::Union(union)),
            TypeDefinition::Enum(enum_def) => (enum_def.name.as_str(), GraphQLType::Enum(enum_def)),
            TypeDefinition::InputObject(input_obj) => (input_obj.name.as_str(), GraphQLType::InputObject(input_obj)),
        };

        self.types.insert(name, type_);
    }

    pub fn get_type(&self, name: &str) -> Option<GraphQLType<'a>> {
        self.types.get(name).copied()
    }

    pub fn is_object_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(GraphQLType::Object(_)))
    }

    pub fn is_interface_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(GraphQLType::Interface(_)))
    }

    pub fn is_union_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(GraphQLType::Union(_)))
    }
}

impl<'a> SchemaProvider<'a> for TestSchema<'a> {
    fn get_field_type(&self, type_name: &str, field_name: &str) -> Option<&'a Type<'a>> {
        let type_ = self.get_type(type_name)?;

        match type_ {
            GraphQLType::Object(obj) => obj
                .fields
                .iter()
                .find(|field| field.name.as_str() == field_name)
                .map(|field| &field.typ),
            GraphQLType::Interface(interface) => interface
                .fields
                .iter()
                .find(|field| field.name.as_str() == field_name)
                .map(|field| &field.typ),
            _ => None,
        }
    }

    fn get_field_definition(&self, type_name: &str, field_name: &str) -> Option<&'a FieldDefinition<'a>> {
        let type_ = self.get_type(type_name)?;

        match type_ {
            GraphQLType::Object(obj) => obj.fields.iter().find(|field| field.name.as_str() == field_name),
            GraphQLType::Interface(interface) => {
                interface.fields.iter().find(|field| field.name.as_str() == field_name)
            }
            _ => None,
        }
    }

    fn get_input_object_definition(&self, type_name: &str) -> Option<&'a InputObjectTypeDefinition<'a>> {
        match self.get_type(type_name) {
            Some(GraphQLType::InputObject(input_obj)) => Some(input_obj),
            _ => None,
        }
    }

    fn get_possible_types(&self, name: &str) -> Vec<&'a str> {
        let type_ = match self.get_type(name) {
            Some(t) => t,
            None => return Vec::new(),
        };

        match type_ {
            GraphQLType::Union(union) => union.members.iter().map(|member| member.as_str()).collect(),
            GraphQLType::Interface(interface) => {
                let interface_name = interface.name.as_str();
                self.types
                    .values()
                    .filter_map(|info| match info {
                        GraphQLType::Object(obj) => {
                            if obj
                                .implements
                                .iter()
                                .any(|impl_name| impl_name.as_str() == interface_name)
                            {
                                Some(obj.name.as_str())
                            } else {
                                None
                            }
                        }
                        _ => None,
                    })
                    .collect()
            }
            _ => Vec::new(),
        }
    }

    fn get_fragment(&self, name: &str) -> Option<&'a FragmentDefinition<'a>> {
        self.fragments.get(name).copied()
    }

    fn get_custom_directive(&self, name: &str) -> Option<&'a DirectiveDefinition<'a>> {
        self.directives.get(name).copied()
    }

    fn is_scalar(&self, name: &str) -> bool {
        matches!(name, "ID" | "String" | "Int" | "Float" | "Boolean")
            || matches!(self.get_type(name), Some(GraphQLType::Scalar(_)))
    }

    fn is_enum_type(&self, name: &str) -> bool {
        matches!(self.get_type(name), Some(GraphQLType::Enum(_)))
    }

    fn is_input_type(&self, name: &str) -> bool {
        self.is_scalar(name)
            || self.is_enum_type(name)
            || matches!(self.get_type(name), Some(GraphQLType::InputObject(_)))
    }

    fn is_composite_type(&self, name: &str) -> bool {
        self.is_object_type(name) || self.is_interface_type(name) || self.is_union_type(name)
    }

    fn has_type(&self, name: &str) -> bool {
        self.get_type(name).is_some()
    }
}
