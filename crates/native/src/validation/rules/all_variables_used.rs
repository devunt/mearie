/// Validates that all variables defined in an operation are used at least once.
///
/// Variables defined at the top level of an operation should be used within
/// that operation's selection set. Unused variables indicate potential errors
/// or unnecessary complexity in the GraphQL query.
///
/// This rule helps keep queries clean and maintainable by ensuring that every
/// variable definition serves a purpose.
///
/// # Specification
///
/// https://spec.graphql.org/October2021/#sec-All-Variables-Used
use crate::ast::*;
use crate::error::{ErrorKind, MearieError};
use crate::span::Span;
use crate::validation::visitor::{Control, Visitor};
use crate::validation::{ValidationContext, ValidationRule};

#[derive(Default)]
pub struct AllVariablesUsed<'a> {
    operations: Vec<(&'a str, Vec<&'a str>, Span)>,
    variable_usages: Vec<(&'a str, Vec<&'a str>)>,
    current_operation: Option<&'a str>,
    current_operation_span: Option<Span>,
    current_defined_vars: Vec<&'a str>,
    current_used_vars: Vec<&'a str>,
}

impl<'a> AllVariablesUsed<'a> {
    fn collect_variables_from_value(&mut self, value: &Value<'a>) {
        match value {
            Value::Variable(var) => {
                self.current_used_vars.push(var.as_str());
            }
            Value::List(list) => {
                for item in list {
                    self.collect_variables_from_value(item);
                }
            }
            Value::Object(fields) => {
                for field in fields {
                    self.collect_variables_from_value(&field.value);
                }
            }
            _ => {}
        }
    }
}

impl<'a> Visitor<'a, ValidationContext<'a>> for AllVariablesUsed<'a> {
    fn enter_operation(&mut self, _ctx: &mut ValidationContext<'a>, operation: &OperationDefinition<'a>) -> Control {
        self.current_operation = Some(operation.name.map_or("<anonymous>", |n| n.as_str()));
        self.current_operation_span = Some(operation.span);
        self.current_defined_vars.clear();
        self.current_used_vars.clear();
        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        _ctx: &mut ValidationContext<'a>,
        var_def: &VariableDefinition<'a>,
    ) -> Control {
        self.current_defined_vars.push(var_def.variable.as_str());

        if let Some(default_value) = &var_def.default_value {
            self.collect_variables_from_value(default_value);
        }

        Control::Next
    }

    fn enter_argument(&mut self, _ctx: &mut ValidationContext<'a>, argument: &Argument<'a>) -> Control {
        self.collect_variables_from_value(&argument.value);
        Control::Next
    }

    fn leave_operation(&mut self, _ctx: &mut ValidationContext<'a>, _operation: &OperationDefinition<'a>) -> Control {
        if let Some(op_name) = self.current_operation
            && let Some(op_span) = &self.current_operation_span
        {
            self.operations
                .push((op_name, self.current_defined_vars.clone(), *op_span));
            self.variable_usages.push((op_name, self.current_used_vars.clone()));
        }

        self.current_operation = None;
        self.current_operation_span = None;
        self.current_defined_vars.clear();
        self.current_used_vars.clear();

        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut ValidationContext<'a>, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Skip
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a>, _document: &Document<'a>) -> Control {
        for (op_name, defined_vars, op_span) in &self.operations {
            let empty_vec = Vec::new();
            let used_vars = self
                .variable_usages
                .iter()
                .find(|(name, _)| name == op_name)
                .map(|(_, vars)| vars)
                .unwrap_or(&empty_vec);

            for defined_var in defined_vars {
                if !used_vars.contains(defined_var) {
                    ctx.add_error(MearieError {
                        kind: ErrorKind::ValidationError {
                            message: format!(
                                "Variable '{}' is defined but not used in operation '{}'",
                                defined_var, op_name
                            ),
                        },
                        location: Some(ctx.location_from_span(*op_span)),
                    });
                }
            }
        }

        Control::Next
    }
}

impl<'a> ValidationRule<'a> for AllVariablesUsed<'a> {}

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
        let mut rule = AllVariablesUsed::default();

        for def in doc.definitions.iter() {
            if let Definition::Executable(ExecutableDefinition::Operation(op)) = def {
                rule.enter_operation(&mut ctx, op);
                for var_def in op.variable_definitions.iter() {
                    rule.enter_variable_definition(&mut ctx, var_def);
                }
                for selection in op.selection_set.selections.iter() {
                    if let Selection::Field(field) = selection {
                        for arg in field.arguments.iter() {
                            rule.enter_argument(&mut ctx, arg);
                        }
                    }
                }
                rule.leave_operation(&mut ctx, op);
            }
        }
        rule.leave_document(&mut ctx, doc);

        ctx.errors().len()
    }

    #[test]
    fn test_no_unused_variables_valid() {
        assert_eq!(validate("query Q($id: ID!) { user(id: $id) { name } }"), 0);
    }

    #[test]
    fn test_no_unused_variables_unused() {
        assert!(validate("query Q($id: ID!, $unused: String) { user(id: $id) { name } }") > 0);
    }

    #[test]
    fn test_no_unused_variables_all_unused() {
        assert!(validate("query Q($a: Int, $b: String) { field { id } }") > 0);
    }

    #[test]
    fn test_no_unused_variables_all_used() {
        assert_eq!(
            validate("query Q($a: Int, $b: String) { field1(arg: $a) field2(arg: $b) }"),
            0
        );
    }

    #[test]
    fn test_no_unused_variables_single_unused() {
        assert!(validate("query Q($used: Int, $unused: String) { field(arg: $used) }") > 0);
    }

    #[test]
    fn test_mutation_with_unused_variable() {
        assert!(validate("mutation M($id: ID!, $unused: String) { update(id: $id) }") > 0);
    }

    #[test]
    fn test_no_variables_defined() {
        assert_eq!(validate("query Q { field { id } }"), 0);
    }
}
