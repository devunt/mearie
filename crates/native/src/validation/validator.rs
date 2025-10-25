use super::context::ValidationContext;
use super::rules::*;
use super::visitor::{Control, Visitor};
use crate::graphql::ast::*;

pub trait ValidationRule<'a, 'b: 'a>: Visitor<'a, ValidationContext<'a, 'b>> + Default {}

#[derive(Default)]
pub struct Validator<'a, 'b> {
    document: DocumentRules<'a, 'b>,
    operations: OperationRules<'a, 'b>,
    fields: FieldRules<'a, 'b>,
    fragments: FragmentRules<'a, 'b>,
    variables: VariableRules<'a, 'b>,
    values: ValueRules<'a, 'b>,
}

impl<'a, 'b> Visitor<'a, ValidationContext<'a, 'b>> for Validator<'a, 'b> {
    fn enter_document(&mut self, ctx: &mut ValidationContext<'a, 'b>, document: &Document<'a>) -> Control {
        self.document.enter_document(ctx, document);
        self.operations.enter_document(ctx, document);
        self.fields.enter_document(ctx, document);
        self.fragments.enter_document(ctx, document);
        self.variables.enter_document(ctx, document);
        self.values.enter_document(ctx, document);
        Control::Next
    }

    fn leave_document(&mut self, ctx: &mut ValidationContext<'a, 'b>, document: &Document<'a>) -> Control {
        self.document.leave_document(ctx, document);
        self.operations.leave_document(ctx, document);
        self.fields.leave_document(ctx, document);
        self.fragments.leave_document(ctx, document);
        self.variables.leave_document(ctx, document);
        self.values.leave_document(ctx, document);
        Control::Next
    }

    fn enter_operation(&mut self, ctx: &mut ValidationContext<'a, 'b>, operation: &OperationDefinition<'a>) -> Control {
        self.document.enter_operation(ctx, operation);
        self.operations.enter_operation(ctx, operation);
        self.fields.enter_operation(ctx, operation);
        self.fragments.enter_operation(ctx, operation);
        self.variables.enter_operation(ctx, operation);
        self.values.enter_operation(ctx, operation);
        Control::Next
    }

    fn leave_operation(&mut self, ctx: &mut ValidationContext<'a, 'b>, operation: &OperationDefinition<'a>) -> Control {
        self.document.leave_operation(ctx, operation);
        self.operations.leave_operation(ctx, operation);
        self.fields.leave_operation(ctx, operation);
        self.fragments.leave_operation(ctx, operation);
        self.variables.leave_operation(ctx, operation);
        self.values.leave_operation(ctx, operation);
        Control::Next
    }

    fn enter_fragment(&mut self, ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        self.document.enter_fragment(ctx, fragment);
        self.operations.enter_fragment(ctx, fragment);
        self.fields.enter_fragment(ctx, fragment);
        self.fragments.enter_fragment(ctx, fragment);
        self.variables.enter_fragment(ctx, fragment);
        self.values.enter_fragment(ctx, fragment);
        Control::Next
    }

    fn leave_fragment(&mut self, ctx: &mut ValidationContext<'a, 'b>, fragment: &FragmentDefinition<'a>) -> Control {
        self.document.leave_fragment(ctx, fragment);
        self.operations.leave_fragment(ctx, fragment);
        self.fields.leave_fragment(ctx, fragment);
        self.fragments.leave_fragment(ctx, fragment);
        self.variables.leave_fragment(ctx, fragment);
        self.values.leave_fragment(ctx, fragment);
        Control::Next
    }

    fn enter_selection_set(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        selection_set: &SelectionSet<'a>,
    ) -> Control {
        self.document.enter_selection_set(ctx, selection_set);
        self.operations.enter_selection_set(ctx, selection_set);
        self.fields.enter_selection_set(ctx, selection_set);
        self.fragments.enter_selection_set(ctx, selection_set);
        self.variables.enter_selection_set(ctx, selection_set);
        self.values.enter_selection_set(ctx, selection_set);
        Control::Next
    }

    fn leave_selection_set(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        selection_set: &SelectionSet<'a>,
    ) -> Control {
        self.document.leave_selection_set(ctx, selection_set);
        self.operations.leave_selection_set(ctx, selection_set);
        self.fields.leave_selection_set(ctx, selection_set);
        self.fragments.leave_selection_set(ctx, selection_set);
        self.variables.leave_selection_set(ctx, selection_set);
        self.values.leave_selection_set(ctx, selection_set);
        Control::Next
    }

    fn enter_field(&mut self, ctx: &mut ValidationContext<'a, 'b>, field: &Field<'a>) -> Control {
        self.document.enter_field(ctx, field);
        self.operations.enter_field(ctx, field);
        self.fields.enter_field(ctx, field);
        self.fragments.enter_field(ctx, field);
        self.variables.enter_field(ctx, field);
        self.values.enter_field(ctx, field);
        Control::Next
    }

    fn leave_field(&mut self, ctx: &mut ValidationContext<'a, 'b>, field: &Field<'a>) -> Control {
        self.document.leave_field(ctx, field);
        self.operations.leave_field(ctx, field);
        self.fields.leave_field(ctx, field);
        self.fragments.leave_field(ctx, field);
        self.variables.leave_field(ctx, field);
        self.values.leave_field(ctx, field);
        Control::Next
    }

    fn enter_argument(&mut self, ctx: &mut ValidationContext<'a, 'b>, argument: &Argument<'a>) -> Control {
        self.document.enter_argument(ctx, argument);
        self.operations.enter_argument(ctx, argument);
        self.fields.enter_argument(ctx, argument);
        self.fragments.enter_argument(ctx, argument);
        self.variables.enter_argument(ctx, argument);
        self.values.enter_argument(ctx, argument);
        Control::Next
    }

    fn leave_argument(&mut self, ctx: &mut ValidationContext<'a, 'b>, argument: &Argument<'a>) -> Control {
        self.document.leave_argument(ctx, argument);
        self.operations.leave_argument(ctx, argument);
        self.fields.leave_argument(ctx, argument);
        self.fragments.leave_argument(ctx, argument);
        self.variables.leave_argument(ctx, argument);
        self.values.leave_argument(ctx, argument);
        Control::Next
    }

    fn enter_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.document.enter_fragment_spread(ctx, fragment_spread);
        self.operations.enter_fragment_spread(ctx, fragment_spread);
        self.fields.enter_fragment_spread(ctx, fragment_spread);
        self.fragments.enter_fragment_spread(ctx, fragment_spread);
        self.variables.enter_fragment_spread(ctx, fragment_spread);
        self.values.enter_fragment_spread(ctx, fragment_spread);
        Control::Next
    }

    fn leave_fragment_spread(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        fragment_spread: &FragmentSpread<'a>,
    ) -> Control {
        self.document.leave_fragment_spread(ctx, fragment_spread);
        self.operations.leave_fragment_spread(ctx, fragment_spread);
        self.fields.leave_fragment_spread(ctx, fragment_spread);
        self.fragments.leave_fragment_spread(ctx, fragment_spread);
        self.variables.leave_fragment_spread(ctx, fragment_spread);
        self.values.leave_fragment_spread(ctx, fragment_spread);
        Control::Next
    }

    fn enter_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.document.enter_inline_fragment(ctx, inline_fragment);
        self.operations.enter_inline_fragment(ctx, inline_fragment);
        self.fields.enter_inline_fragment(ctx, inline_fragment);
        self.fragments.enter_inline_fragment(ctx, inline_fragment);
        self.variables.enter_inline_fragment(ctx, inline_fragment);
        self.values.enter_inline_fragment(ctx, inline_fragment);
        Control::Next
    }

    fn leave_inline_fragment(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        inline_fragment: &InlineFragment<'a>,
    ) -> Control {
        self.document.leave_inline_fragment(ctx, inline_fragment);
        self.operations.leave_inline_fragment(ctx, inline_fragment);
        self.fields.leave_inline_fragment(ctx, inline_fragment);
        self.fragments.leave_inline_fragment(ctx, inline_fragment);
        self.variables.leave_inline_fragment(ctx, inline_fragment);
        self.values.leave_inline_fragment(ctx, inline_fragment);
        Control::Next
    }

    fn enter_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        variable_definition: &VariableDefinition<'a>,
    ) -> Control {
        self.document.enter_variable_definition(ctx, variable_definition);
        self.operations.enter_variable_definition(ctx, variable_definition);
        self.fields.enter_variable_definition(ctx, variable_definition);
        self.fragments.enter_variable_definition(ctx, variable_definition);
        self.variables.enter_variable_definition(ctx, variable_definition);
        self.values.enter_variable_definition(ctx, variable_definition);
        Control::Next
    }

    fn leave_variable_definition(
        &mut self,
        ctx: &mut ValidationContext<'a, 'b>,
        variable_definition: &VariableDefinition<'a>,
    ) -> Control {
        self.document.leave_variable_definition(ctx, variable_definition);
        self.operations.leave_variable_definition(ctx, variable_definition);
        self.fields.leave_variable_definition(ctx, variable_definition);
        self.fragments.leave_variable_definition(ctx, variable_definition);
        self.variables.leave_variable_definition(ctx, variable_definition);
        self.values.leave_variable_definition(ctx, variable_definition);
        Control::Next
    }

    fn enter_directive(&mut self, ctx: &mut ValidationContext<'a, 'b>, directive: &Directive<'a>) -> Control {
        self.document.enter_directive(ctx, directive);
        self.operations.enter_directive(ctx, directive);
        self.fields.enter_directive(ctx, directive);
        self.fragments.enter_directive(ctx, directive);
        self.variables.enter_directive(ctx, directive);
        self.values.enter_directive(ctx, directive);
        Control::Next
    }

    fn leave_directive(&mut self, ctx: &mut ValidationContext<'a, 'b>, directive: &Directive<'a>) -> Control {
        self.document.leave_directive(ctx, directive);
        self.operations.leave_directive(ctx, directive);
        self.fields.leave_directive(ctx, directive);
        self.fragments.leave_directive(ctx, directive);
        self.variables.leave_directive(ctx, directive);
        self.values.leave_directive(ctx, directive);
        Control::Next
    }
}

impl<'a, 'b: 'a> ValidationRule<'a, 'b> for Validator<'a, 'b> {}
