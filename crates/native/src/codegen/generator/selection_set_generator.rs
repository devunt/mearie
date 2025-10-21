use super::super::{CodegenContext, Registry, Result, type_builder};
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use oxc_ast::AstBuilder;
use oxc_ast::ast::TSType;
use rustc_hash::{FxHashMap, FxHashSet};

pub struct SelectionSetGenerator<'a, 'b> {
    registry: &'a Registry<'b>,
    ast: AstBuilder<'b>,
}

impl<'a, 'b> SelectionSetGenerator<'a, 'b> {
    pub fn new(registry: &'a Registry<'b>, ctx: &'b CodegenContext) -> Self {
        Self {
            registry,
            ast: ctx.ast(),
        }
    }

    pub fn generate_selection_set(&self, selection_set: &SelectionSet<'b>, parent_type: &'b str) -> Result<TSType<'b>> {
        if selection_set.is_empty() {
            return Ok(type_builder::create_empty_object(&self.ast));
        }

        let mut field_map: FxHashMap<&'b str, (TSType<'b>, bool)> = FxHashMap::default();
        let mut inline_fragment_types: Vec<TSType<'b>> = Vec::new();
        let mut fragment_refs: Vec<&'b str> = Vec::new();

        for selection in &selection_set.selections {
            match selection {
                Selection::Field(field) => {
                    let (field_name, field_type, is_optional) = self.generate_field(field, parent_type)?;
                    field_map.insert(field_name, (field_type, is_optional));
                }
                Selection::FragmentSpread(spread) => {
                    let fragment_name = spread.fragment_name.as_str();
                    self.registry.get_fragment(fragment_name).ok_or_else(|| MearieError {
                        kind: ErrorKind::FragmentNotFound {
                            name: fragment_name.to_string(),
                        },
                        location: None,
                    })?;
                    fragment_refs.push(fragment_name);
                }
                Selection::InlineFragment(inline_fragment) => {
                    let fragment_type = self.generate_inline_fragment(inline_fragment, parent_type)?;
                    inline_fragment_types.push(fragment_type);
                }
            }
        }

        let base_type = if !field_map.is_empty() {
            type_builder::create_type_literal_from_map_with_optional(&self.ast, field_map)
        } else {
            type_builder::create_empty_object(&self.ast)
        };

        let mut all_types = vec![base_type];
        all_types.extend(inline_fragment_types);

        if !fragment_refs.is_empty() {
            let fragment_refs_type = type_builder::create_fragment_refs_type(&self.ast, fragment_refs);
            all_types.push(fragment_refs_type);
        }

        if all_types.len() == 1 {
            Ok(all_types.into_iter().next().unwrap())
        } else {
            Ok(type_builder::create_intersection_type(&self.ast, all_types))
        }
    }

    fn generate_field(&self, field: &Field<'b>, parent_type: &'b str) -> Result<(&'b str, TSType<'b>, bool)> {
        let field_name = field.alias_or_name().as_str();
        let actual_field_name = field.name.as_str();

        self.validate_field_arguments(field, parent_type)?;

        let graphql_type = self.registry.get_field_type(parent_type, actual_field_name)?;
        let is_optional = Self::is_nullable_type(graphql_type);

        let field_type = if !field.selection_set.is_empty() {
            let base_type = type_builder::map_type(&self.ast, graphql_type);
            let inner_type_name = Self::get_inner_type_name(graphql_type);
            let selection_type = self.generate_selection_set(&field.selection_set, inner_type_name)?;
            self.replace_innermost_type(&base_type, selection_type)
        } else {
            self.map_type_direct_scalar(graphql_type)
        };

        Ok((field_name, field_type, is_optional))
    }

    fn generate_inline_fragment(
        &self,
        inline_fragment: &InlineFragment<'b>,
        parent_type: &'b str,
    ) -> Result<TSType<'b>> {
        let type_condition = inline_fragment
            .type_condition
            .map(|name| name.as_str())
            .unwrap_or(parent_type);

        self.generate_selection_set(&inline_fragment.selection_set, type_condition)
    }

    fn get_inner_type_name(graphql_type: &Type<'b>) -> &'b str {
        match graphql_type {
            Type::Named(named) => named.name,
            Type::List(inner) => Self::get_inner_type_name(inner),
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => named.name,
                NonNullType::List(inner) => Self::get_inner_type_name(inner),
            },
        }
    }

    fn replace_innermost_type(&self, wrapper_type: &TSType<'b>, replacement: TSType<'b>) -> TSType<'b> {
        match wrapper_type {
            TSType::TSTypeReference(type_ref) => {
                let type_name = match &type_ref.type_name {
                    oxc_ast::ast::TSTypeName::IdentifierReference(ident) => ident.name.as_str(),
                    _ => return replacement,
                };

                match type_name {
                    "Nullable" => {
                        if let Some(ref params) = type_ref.type_arguments
                            && let Some(inner) = params.params.first()
                        {
                            let replaced_inner = self.replace_innermost_type(inner, replacement);
                            return type_builder::wrap_nullable(&self.ast, replaced_inner);
                        }
                        type_builder::wrap_nullable(&self.ast, replacement)
                    }
                    "List" => {
                        if let Some(ref params) = type_ref.type_arguments
                            && let Some(inner) = params.params.first()
                        {
                            let replaced_inner = self.replace_innermost_type(inner, replacement);
                            return type_builder::wrap_list(&self.ast, replaced_inner);
                        }
                        type_builder::wrap_list(&self.ast, replacement)
                    }
                    _ => replacement,
                }
            }
            _ => replacement,
        }
    }

    fn map_type_direct_scalar(&self, graphql_type: &Type<'b>) -> TSType<'b> {
        match graphql_type {
            Type::Named(named) => {
                let inner = self.map_named_type_direct(named);
                type_builder::wrap_nullable(&self.ast, inner)
            }
            Type::List(inner_type) => {
                let inner = self.map_type_direct_scalar(inner_type);
                let list = type_builder::wrap_list(&self.ast, inner);
                type_builder::wrap_nullable(&self.ast, list)
            }
            Type::NonNull(non_null) => match non_null {
                NonNullType::Named(named) => self.map_named_type_direct(named),
                NonNullType::List(inner_type) => {
                    let inner = self.map_type_direct_scalar(inner_type);
                    type_builder::wrap_list(&self.ast, inner)
                }
            },
        }
    }

    fn map_named_type_direct(&self, named_type: &NamedType<'b>) -> TSType<'b> {
        if self.registry.is_scalar(named_type.name) {
            type_builder::create_scalar_reference(&self.ast, named_type.name)
        } else {
            type_builder::create_type_reference(&self.ast, named_type.name)
        }
    }

    fn validate_field_arguments(&self, field: &Field<'b>, parent_type: &'b str) -> Result<()> {
        let field_name = field.name.as_str();
        let field_def = self.registry.get_field_definition(parent_type, field_name)?;

        let provided_args: FxHashSet<&str> = field.arguments.iter().map(|arg| arg.name.as_str()).collect();

        for provided_arg in &field.arguments {
            let arg_name = provided_arg.name.as_str();
            let arg_exists = field_def
                .arguments
                .iter()
                .any(|def_arg| def_arg.name.as_str() == arg_name);

            if !arg_exists {
                return Err(MearieError {
                    kind: ErrorKind::UnknownArgument {
                        type_name: parent_type.to_string(),
                        field: field_name.to_string(),
                        arg: arg_name.to_string(),
                    },
                    location: None,
                });
            }
        }

        for def_arg in &field_def.arguments {
            let arg_name = def_arg.name.as_str();
            let is_required = Self::is_non_null_type(&def_arg.typ);

            if is_required && !provided_args.contains(arg_name) {
                return Err(MearieError {
                    kind: ErrorKind::MissingRequiredArgument {
                        type_name: parent_type.to_string(),
                        field: field_name.to_string(),
                        arg: arg_name.to_string(),
                    },
                    location: None,
                });
            }
        }

        Ok(())
    }

    fn is_non_null_type(typ: &Type<'b>) -> bool {
        matches!(typ, Type::NonNull(_))
    }

    fn is_nullable_type(typ: &Type<'b>) -> bool {
        !Self::is_non_null_type(typ)
    }
}

#[cfg(test)]
mod tests {
    use crate::ast::Document;
    use crate::codegen::{Builder, CodegenContext as TypeScriptContext, Registry};
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::span::Source;
    use assertables::*;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }

    #[test]
    fn test_unknown_argument_error() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser {
                user(id: "123", unknownArg: "value") {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);

        let result = registry.load_document(operations_document);
        assert_err!(&result);

        let errors = result.unwrap_err();
        assert!(!errors.is_empty());
        let err = &errors[0];
        assert_matches!(err.kind, crate::error::ErrorKind::ValidationError { .. });
        assert_contains!(err.to_string(), "unknownArg");
    }

    #[test]
    fn test_missing_required_argument_error() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser {
                user {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);

        let result = registry.load_document(operations_document);
        assert_err!(&result);

        let errors = result.unwrap_err();
        assert!(!errors.is_empty());
        let err = &errors[0];
        assert_matches!(err.kind, crate::error::ErrorKind::ValidationError { .. });
        assert_contains!(err.to_string(), "Required argument");
        assert_contains!(err.to_string(), "id");
    }

    #[test]
    fn test_valid_arguments() {
        let schema = r#"
            type Query {
                user(id: ID!): User
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = TypeScriptContext::new();
        let builder = Builder::new(&ctx, &registry);

        let result = builder.generate();
        assert_ok!(&result);
    }

    #[test]
    fn test_optional_argument_omitted() {
        let schema = r#"
            type Query {
                users(limit: Int, offset: Int): [User!]!
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            query GetUsers {
                users(limit: 10) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = TypeScriptContext::new();
        let builder = Builder::new(&ctx, &registry);

        let result = builder.generate();
        assert_ok!(&result);
    }

    #[test]
    fn test_mutation_with_input_type() {
        let schema = r#"
            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
            input CreateUserInput {
                name: String!
                email: String
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);
        registry.load_document(operations_document).unwrap();

        let ctx = TypeScriptContext::new();
        let builder = Builder::new(&ctx, &registry);

        let result = builder.generate();
        assert_ok!(&result);
    }

    #[test]
    fn test_mutation_with_wrong_arguments() {
        let schema = r#"
            type Mutation {
                createUser(input: CreateUserInput!): User!
            }
            input CreateUserInput {
                name: String!
                email: String
            }
            type User {
                id: ID!
                name: String!
            }
        "#;

        let operations = r#"
            mutation CreateUser($name: String!, $email: String) {
                createUser(name: $name, email: $email) {
                    id
                    name
                }
            }
        "#;

        let graphql_ctx = GraphQLContext::new();
        let schema_source = parse_source(schema);
        let operations_source = parse_source(operations);
        let schema_document = Document::parse(&graphql_ctx, &schema_source).unwrap();
        let operations_document = Document::parse(&graphql_ctx, &operations_source).unwrap();

        let mut registry = Registry::new();
        registry.load_schema(schema_document);

        let result = registry.load_document(operations_document);
        assert_err!(&result);

        let errors = result.unwrap_err();
        assert!(!errors.is_empty());
        let err = &errors[0];
        assert_matches!(err.kind, crate::error::ErrorKind::ValidationError { .. });
        assert_contains!(err.to_string(), "name");
    }
}
