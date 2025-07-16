/// Validates that a document containing an anonymous operation contains only that operation.
///
/// GraphQL allows a document to contain either multiple named operations or a single
/// anonymous operation. If an anonymous operation is present, it must be the only
/// operation in the document.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-Lone-Anonymous-Operation
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Span;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct LoneAnonymousOperation {
    operations: usize,
    has_anonymous: bool,
    anonymous_span: Option<Span>,
}

impl<'a> Visitor<'a, ValidationContext<'a>> for LoneAnonymousOperation {
    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        self.operations += 1;
        if operation.name.is_none() {
            self.has_anonymous = true;
            self.anonymous_span = Some(operation.span);
        }
        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Skip
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a>, _document: &Document<'a>) -> Control {
        if self.has_anonymous && self.operations > 1 {
            let span = self.anonymous_span.unwrap_or(Span { start: 0, end: 0 });
            ctx.add_error(MearieError {
                kind: ErrorKind::ValidationError {
                    message: "A document containing an anonymous operation must contain only that operation."
                        .to_string(),
                },
                location: Some(ctx.location_from_span(span)),
            });
            return Control::Break;
        }
        Control::Next
    }
}

impl<'a> ValidationRule<'a> for LoneAnonymousOperation {}

#[cfg(test)]
mod tests {
    use crate::span::Source;

    fn parse_source(code: &str) -> Source<'_> {
        Source {
            code,
            file_path: "test.graphql",
            start_line: 1,
        }
    }
    use super::*;
    use crate::parser::{GraphQLContext, ParseNode};
    use crate::validation::test_schema::TestSchema;

    fn validate(source: &str) -> usize {
        let gql_ctx = GraphQLContext::new();
        let binding = parse_source(source);
        let doc = Document::parse(&gql_ctx, &binding).unwrap();
        let schema = TestSchema::default();
        let source = parse_source(source);
        let mut ctx = ValidationContext::new(&schema, &source);
        let mut rule = LoneAnonymousOperation::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
            }
        }
        rule.leave_document(&mut ctx, doc);

        ctx.errors().len()
    }

    #[test]
    fn test_lone_anonymous_operation_valid_single() {
        assert_eq!(validate("{ field }"), 0);
    }

    #[test]
    fn test_lone_anonymous_operation_invalid_multiple() {
        assert!(validate("{ field } query Q { field }") > 0);
    }

    #[test]
    fn test_lone_anonymous_operation_valid_named_only() {
        assert_eq!(validate("query Q1 { field } query Q2 { field }"), 0);
    }

    #[test]
    fn test_lone_anonymous_operation_multiple_anonymous() {
        assert!(validate("{ field1 } { field2 }") > 0);
    }

    #[test]
    fn test_lone_anonymous_operation_with_fragment() {
        assert_eq!(validate("{ field } fragment F on User { id }"), 0);
    }

    #[test]
    fn test_lone_anonymous_operation_multiple_named_operations() {
        assert_eq!(validate("query A { field } query B { field } query C { field }"), 0);
    }

    #[test]
    fn test_lone_anonymous_operation_anonymous_with_mutation() {
        assert!(validate("{ field } mutation M { update }") > 0);
    }
}
