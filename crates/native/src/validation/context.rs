use crate::ast::*;
use crate::error::MearieError;
use crate::span::*;

pub trait SchemaProvider<'a> {
    fn get_field_type(&self, type_name: &str, field_name: &str) -> Option<&'a Type<'a>>;
    fn get_field_definition(&self, type_name: &str, field_name: &str) -> Option<&'a FieldDefinition<'a>>;
    fn get_input_object_definition(&self, type_name: &str) -> Option<&'a InputObjectTypeDefinition<'a>>;
    fn get_possible_types(&self, type_name: &str) -> Vec<&'a str>;
    fn get_fragment(&self, name: &str) -> Option<&'a FragmentDefinition<'a>>;
    fn get_custom_directive(&self, name: &str) -> Option<&'a DirectiveDefinition<'a>>;
    fn is_scalar(&self, name: &str) -> bool;
    fn is_enum_type(&self, name: &str) -> bool;
    fn is_input_type(&self, name: &str) -> bool;
    fn is_composite_type(&self, name: &str) -> bool;
    fn has_type(&self, name: &str) -> bool;
}

pub struct ValidationContext<'a> {
    source: &'a Source<'a>,
    errors: Vec<MearieError>,
    schema: &'a dyn SchemaProvider<'a>,
}

impl<'a> ValidationContext<'a> {
    /// Creates a new validation context with the given schema and source.
    #[inline]
    pub fn new(schema: &'a dyn SchemaProvider<'a>, source: &'a Source<'a>) -> Self {
        Self {
            source,
            errors: Vec::new(),
            schema,
        }
    }

    /// Returns the schema provider.
    #[inline]
    pub fn schema(&self) -> &'a dyn SchemaProvider<'a> {
        self.schema
    }

    #[inline]
    pub fn source(&self) -> &'a Source<'a> {
        self.source
    }

    /// Creates a Location from a span, or returns an empty location if no source is available.
    #[inline]
    pub fn location_from_span(&self, span: Span) -> Location {
        Location::from_span(self.source, span)
    }

    /// Adds a validation error to the context.
    #[inline]
    pub fn add_error(&mut self, error: MearieError) {
        self.errors.push(error);
    }

    /// Converts the validation context to a Result.
    ///
    /// If no errors were recorded, returns Ok with the given value.
    /// If errors exist, returns Err with the first error.
    pub fn to_result<T>(&self, value: T) -> Result<T, MearieError> {
        if self.errors.is_empty() {
            Ok(value)
        } else {
            Err(self.errors[0].clone())
        }
    }

    /// Converts the validation context to a Result with all errors.
    ///
    /// If no errors were recorded, returns Ok with the given value.
    /// If errors exist, returns Err with all errors collected.
    pub fn to_result_all<T>(&self, value: T) -> Result<T, Vec<MearieError>> {
        if self.errors.is_empty() {
            Ok(value)
        } else {
            Err(self.errors.clone())
        }
    }

    /// Returns a slice of all validation errors collected.
    #[inline]
    pub fn errors(&self) -> &[MearieError] {
        &self.errors
    }
}
