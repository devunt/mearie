use crate::error::{ErrorKind, MearieError};
use crate::span::*;
use oxc_allocator::Allocator;
use oxc_ast::ast::{Argument, CallExpression, Expression, TemplateLiteral};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ExtractResult {
    pub sources: Vec<SourceOwned>,
    pub errors: Vec<MearieError>,
}

struct Extractor<'a> {
    source: &'a SourceOwned,
    sources: Vec<SourceOwned>,
    errors: Vec<MearieError>,
}

impl<'a> Extractor<'a> {
    fn new(source: &'a SourceOwned) -> Self {
        Self {
            source,
            sources: Vec::new(),
            errors: Vec::new(),
        }
    }

    fn calculate_line_number(&self, offset: u32) -> u32 {
        let offset = offset as usize;
        if offset > self.source.code.len() {
            return 1;
        }

        self.source.code[..offset].bytes().filter(|&b| b == b'\n').count() as u32 + 1
    }

    fn extract_template_literal(&self, template: &TemplateLiteral, line: u32) -> Result<String, MearieError> {
        if !template.expressions.is_empty() {
            return Err(MearieError {
                kind: ErrorKind::InterpolationNotAllowed,
                location: Some(Location {
                    file_path: self.source.file_path.clone(),
                    line,
                    column: None,
                }),
            });
        }

        let mut result = String::new();
        for quasi in &template.quasis {
            result.push_str(&quasi.value.raw);
        }

        Ok(result)
    }
}

impl<'a> Visit<'_> for Extractor<'a> {
    fn visit_call_expression(&mut self, node: &CallExpression) {
        if let Expression::Identifier(ident) = &node.callee
            && ident.name == "graphql"
        {
            let offset = node.span.start;
            let line = self.calculate_line_number(offset);

            if node.arguments.len() != 1 {
                walk::walk_call_expression(self, node);
                return;
            }

            match &node.arguments[0] {
                Argument::TemplateLiteral(template) => match self.extract_template_literal(template, line) {
                    Ok(code) => {
                        self.sources.push(SourceOwned {
                            code,
                            file_path: self.source.file_path.clone(),
                            start_line: line,
                        });
                    }
                    Err(e) => {
                        self.errors.push(e);
                    }
                },
                Argument::StringLiteral(_) => {
                    self.errors.push(MearieError {
                        kind: ErrorKind::StringLiteralNotAllowed,
                        location: Some(Location {
                            file_path: self.source.file_path.clone(),
                            line,
                            column: None,
                        }),
                    });
                }
                _ => {}
            }
        }

        walk::walk_call_expression(self, node);
    }
}

pub fn extract_graphql_sources(source: SourceOwned) -> ExtractResult {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(&source.file_path).unwrap_or_default();

    let parser = Parser::new(&allocator, &source.code, source_type);
    let result = parser.parse();

    if !result.errors.is_empty() {
        let errors = result
            .errors
            .iter()
            .map(|e| {
                let line = e
                    .labels
                    .as_ref()
                    .and_then(|labels| labels.first())
                    .map(|l| l.offset() as u32)
                    .unwrap_or(1);

                MearieError {
                    kind: ErrorKind::JavaScriptParseError { message: e.to_string() },
                    location: Some(Location {
                        file_path: source.file_path.clone(),
                        line,
                        column: None,
                    }),
                }
            })
            .collect();

        return ExtractResult {
            sources: Vec::new(),
            errors,
        };
    }

    let mut extractor = Extractor::new(&source);
    extractor.visit_program(&result.program);

    ExtractResult {
        sources: extractor.sources,
        errors: extractor.errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assertables::*;

    fn create_source(code: &str) -> SourceOwned {
        SourceOwned {
            code: code.to_string(),
            file_path: "test.js".to_string(),
            start_line: 1,
        }
    }

    #[test]
    fn test_extract_single_graphql_function() {
        let source = r#"
            const query = graphql(`
                query GetUser {
                    user {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_eq!(result.sources[0].file_path, "test.js");
        assert_gt!(result.sources[0].start_line, 0);
    }

    #[test]
    fn test_extract_multiple_graphql_functions() {
        let source = r#"
            const query1 = graphql(`query GetUser { user { id } }`);
            const query2 = graphql(`query GetPost { post { title } }`);
            const mutation = graphql(`mutation CreateUser { createUser { id } }`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 3);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_contains!(&result.sources[1].code, "GetPost");
        assert_contains!(&result.sources[2].code, "CreateUser");
    }

    #[test]
    fn test_graphql_with_string_literal_error() {
        let source = r#"
            const query = graphql("query GetUser { user { id } }");
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
    }

    #[test]
    fn test_graphql_with_single_quote_string_literal_error() {
        let source = r#"
            const query = graphql('query GetUser { user { id } }');
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
    }

    #[test]
    fn test_graphql_with_comment_inside_template() {
        let source = r#"
            const query = graphql(`
                # This is a comment
                query GetUser {
                    user { id }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_contains!(&result.sources[0].code, "# This is a comment");
    }

    #[test]
    fn test_extract_with_variable_interpolation() {
        let source = r#"
            const query = graphql(`
                query GetUser($id: ID!) {
                    user(id: ${userId}) {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_len_eq_x!(&result.errors, 1);
    }

    #[test]
    fn test_extract_fragment() {
        let source = r#"
            const fragment = graphql(`
                fragment UserFields on User {
                    id
                    name
                    email
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "UserFields");
        assert_contains!(&result.sources[0].code, "fragment");
    }

    #[test]
    fn test_extract_mutation() {
        let source = r#"
            const mutation = graphql(`
                mutation CreateUser($name: String!) {
                    createUser(name: $name) {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "CreateUser");
        assert_contains!(&result.sources[0].code, "mutation");
    }

    #[test]
    fn test_extract_subscription() {
        let source = r#"
            const subscription = graphql(`
                subscription OnMessageAdded {
                    messageAdded {
                        id
                        content
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "OnMessageAdded");
        assert_contains!(&result.sources[0].code, "subscription");
    }

    #[test]
    fn test_extract_from_typescript() {
        let source = r#"
            interface User {
                id: string;
            }

            const query: DocumentNode = graphql(`
                query GetUser {
                    user {
                        id
                        name
                    }
                }
            `);
        "#;

        let source = SourceOwned {
            code: source.to_string(),
            file_path: "test.ts".to_string(),
            start_line: 1,
        };

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
    }

    #[test]
    fn test_extract_from_tsx() {
        let source = r#"
            export const UserQuery = () => {
                const { data } = useQuery(graphql(`
                    query GetUser {
                        user { id name }
                    }
                `));
                return <div>{data.user.name}</div>;
            };
        "#;

        let source = SourceOwned {
            code: source.to_string(),
            file_path: "test.tsx".to_string(),
            start_line: 1,
        };

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUser");
    }

    #[test]
    fn test_extract_no_graphql() {
        let source = r#"
            const foo = "bar";
            const template = `hello ${world}`;
            function test() {
                return 42;
            }
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_extract_invalid_javascript() {
        let source = r#"
            const query = graphql(`
                query GetUser {
                    user { id }
                }
            `);
            this is invalid syntax !!!
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_not_empty!(result.errors);
    }

    #[test]
    fn test_extract_nested_template_expressions() {
        let source = r#"
            const queries = [
                graphql(`query A { a { id } }`),
                graphql(`query B { b { id } }`),
            ];
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 2);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_extract_multiline_query() {
        let source = r#"
            const query = graphql(`
                query GetUserWithPosts {
                    user {
                        id
                        name
                        posts {
                            id
                            title
                            comments {
                                id
                                content
                            }
                        }
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "GetUserWithPosts");
        assert_contains!(&result.sources[0].code, "comments");
    }

    #[test]
    fn test_extract_query_with_directives() {
        let source = r#"
            const query = graphql(`
                query GetUser($includeEmail: Boolean!) {
                    user {
                        id
                        name
                        email @include(if: $includeEmail)
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "@include");
    }

    #[test]
    fn test_extract_query_with_aliases() {
        let source = r#"
            const query = graphql(`
                query GetUsers {
                    admin: user(role: "admin") { id }
                    guest: user(role: "guest") { id }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "admin:");
        assert_contains!(&result.sources[0].code, "guest:");
    }

    #[test]
    fn test_extract_inline_fragments() {
        let source = r#"
            const query = graphql(`
                query GetSearchResults {
                    search {
                        ... on User { name }
                        ... on Post { title }
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "... on User");
    }

    #[test]
    fn test_extract_with_fragment_spread() {
        let source = r#"
            const query = graphql(`
                query GetUser {
                    user {
                        ...UserFields
                    }
                }
            `);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_contains!(&result.sources[0].code, "...UserFields");
    }

    #[test]
    fn test_file_path_preserved() {
        let source = r#"const q = graphql(`query { user { id } }`);"#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);

        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_eq!(result.sources[0].file_path, "test.js");
    }

    #[test]
    fn test_line_number_tracking() {
        let source = r#"
            const a = 1;
            const b = 2;
            const query = graphql(`query { user { id } }`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 1);
        assert_is_empty!(&result.errors);
        assert_gt!(result.sources[0].start_line, 0);
    }

    #[test]
    fn test_regular_template_literal_not_extracted() {
        let source = r#"
            const regular = `This is just a regular template literal`;
            const html = `<div>Hello World</div>`;
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_other_function_calls_ignored() {
        let source = r#"
            const styled = css(`color: red;`);
            const html = htmlTemplate(`<div>Test</div>`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_is_empty!(&result.sources);
        assert_is_empty!(&result.errors);
    }

    #[test]
    fn test_mixed_valid_and_invalid() {
        let source = r#"
            const query1 = graphql(`query GetUser { user { id } }`);
            const query2 = graphql(`query GetPost($id: ID!) { post(id: ${id}) { title } }`);
            const query3 = graphql(`query GetComment { comment { text } }`);
        "#;

        let source = create_source(source);

        let result = extract_graphql_sources(source);
        assert_len_eq_x!(&result.sources, 2usize);
        assert_len_eq_x!(&result.errors, 1usize);
        assert_contains!(&result.sources[0].code, "GetUser");
        assert_contains!(&result.sources[1].code, "GetComment");
    }
}
