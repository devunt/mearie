use crate::graphql::ast::*;

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub enum Control {
    Next,
    Break,
    Skip,
}

pub trait Visitor<'a, Context = ()> {
    fn enter_document(&mut self, _ctx: &mut Context, _document: &Document<'a>) -> Control {
        Control::Next
    }

    fn leave_document(&mut self, _ctx: &mut Context, _document: &Document<'a>) -> Control {
        Control::Next
    }

    fn enter_operation(&mut self, _ctx: &mut Context, _operation: &OperationDefinition<'a>) -> Control {
        Control::Next
    }

    fn leave_operation(&mut self, _ctx: &mut Context, _operation: &OperationDefinition<'a>) -> Control {
        Control::Next
    }

    fn enter_fragment(&mut self, _ctx: &mut Context, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Next
    }

    fn leave_fragment(&mut self, _ctx: &mut Context, _fragment: &FragmentDefinition<'a>) -> Control {
        Control::Next
    }

    fn enter_variable_definition(&mut self, _ctx: &mut Context, _var_def: &VariableDefinition<'a>) -> Control {
        Control::Next
    }

    fn leave_variable_definition(&mut self, _ctx: &mut Context, _var_def: &VariableDefinition<'a>) -> Control {
        Control::Next
    }

    fn enter_selection_set(&mut self, _ctx: &mut Context, _selection_set: &SelectionSet<'a>) -> Control {
        Control::Next
    }

    fn leave_selection_set(&mut self, _ctx: &mut Context, _selection_set: &SelectionSet<'a>) -> Control {
        Control::Next
    }

    fn enter_field(&mut self, _ctx: &mut Context, _field: &Field<'a>) -> Control {
        Control::Next
    }

    fn leave_field(&mut self, _ctx: &mut Context, _field: &Field<'a>) -> Control {
        Control::Next
    }

    fn enter_fragment_spread(&mut self, _ctx: &mut Context, _fragment_spread: &FragmentSpread<'a>) -> Control {
        Control::Next
    }

    fn leave_fragment_spread(&mut self, _ctx: &mut Context, _fragment_spread: &FragmentSpread<'a>) -> Control {
        Control::Next
    }

    fn enter_inline_fragment(&mut self, _ctx: &mut Context, _inline_fragment: &InlineFragment<'a>) -> Control {
        Control::Next
    }

    fn leave_inline_fragment(&mut self, _ctx: &mut Context, _inline_fragment: &InlineFragment<'a>) -> Control {
        Control::Next
    }

    fn enter_directive(&mut self, _ctx: &mut Context, _directive: &Directive<'a>) -> Control {
        Control::Next
    }

    fn leave_directive(&mut self, _ctx: &mut Context, _directive: &Directive<'a>) -> Control {
        Control::Next
    }

    fn enter_argument(&mut self, _ctx: &mut Context, _argument: &Argument<'a>) -> Control {
        Control::Next
    }

    fn leave_argument(&mut self, _ctx: &mut Context, _argument: &Argument<'a>) -> Control {
        Control::Next
    }
}

pub trait VisitNode<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control;
}

#[inline]
fn visit_directives<'a, C, V: Visitor<'a, C>>(
    directives: &'a [Directive<'a>],
    ctx: &mut C,
    visitor: &mut V,
) -> Control {
    for directive in directives {
        match directive.visit(ctx, visitor) {
            Control::Break => return Control::Break,
            _ => continue,
        }
    }
    Control::Next
}

impl<'a> VisitNode<'a> for Document<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        let flow = visitor.enter_document(ctx, self);
        if let Control::Next = flow {
            for definition in &self.definitions {
                match definition {
                    Definition::Executable(exec_def) => match exec_def {
                        ExecutableDefinition::Operation(op) => {
                            if op.visit(ctx, visitor) == Control::Break {
                                return Control::Break;
                            }
                        }
                        ExecutableDefinition::Fragment(frag) => {
                            if frag.visit(ctx, visitor) == Control::Break {
                                return Control::Break;
                            }
                        }
                    },
                    Definition::TypeSystem(_) | Definition::TypeSystemExtension(_) => {}
                }
            }
            visitor.leave_document(ctx, self)
        } else {
            flow
        }
    }
}

impl<'a> VisitNode<'a> for OperationDefinition<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        match visitor.enter_operation(ctx, self) {
            Control::Next => {}
            flow => return flow,
        }

        for var_def in &self.variable_definitions {
            if var_def.visit(ctx, visitor) == Control::Break {
                return Control::Break;
            }
        }

        if visit_directives(&self.directives, ctx, visitor) == Control::Break {
            return Control::Break;
        }

        if self.selection_set.visit(ctx, visitor) == Control::Break {
            return Control::Break;
        }

        visitor.leave_operation(ctx, self)
    }
}

impl<'a> VisitNode<'a> for FragmentDefinition<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        match visitor.enter_fragment(ctx, self) {
            Control::Next => {}
            flow => return flow,
        }

        if visit_directives(&self.directives, ctx, visitor) == Control::Break {
            return Control::Break;
        }

        if self.selection_set.visit(ctx, visitor) == Control::Break {
            return Control::Break;
        }

        visitor.leave_fragment(ctx, self)
    }
}

impl<'a> VisitNode<'a> for VariableDefinition<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        match visitor.enter_variable_definition(ctx, self) {
            Control::Next => {}
            flow => return flow,
        }

        if visit_directives(&self.directives, ctx, visitor) == Control::Break {
            return Control::Break;
        }

        visitor.leave_variable_definition(ctx, self)
    }
}

impl<'a> VisitNode<'a> for SelectionSet<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        let flow = visitor.enter_selection_set(ctx, self);
        if let Control::Next = flow {
            for selection in &self.selections {
                let flow = match selection {
                    Selection::Field(field) => field.visit(ctx, visitor),
                    Selection::FragmentSpread(spread) => spread.visit(ctx, visitor),
                    Selection::InlineFragment(fragment) => fragment.visit(ctx, visitor),
                };
                if flow == Control::Break {
                    return Control::Break;
                }
            }
            visitor.leave_selection_set(ctx, self)
        } else {
            flow
        }
    }
}

impl<'a> VisitNode<'a> for Field<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        match visitor.enter_field(ctx, self) {
            Control::Next => {}
            flow => return flow,
        }

        for argument in &self.arguments {
            if argument.visit(ctx, visitor) == Control::Break {
                return Control::Break;
            }
        }

        if visit_directives(&self.directives, ctx, visitor) == Control::Break {
            return Control::Break;
        }

        if self.selection_set.visit(ctx, visitor) == Control::Break {
            return Control::Break;
        }

        visitor.leave_field(ctx, self)
    }
}

impl<'a> VisitNode<'a> for FragmentSpread<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        match visitor.enter_fragment_spread(ctx, self) {
            Control::Next => {}
            flow => return flow,
        }

        if visit_directives(&self.directives, ctx, visitor) == Control::Break {
            return Control::Break;
        }

        visitor.leave_fragment_spread(ctx, self)
    }
}

impl<'a> VisitNode<'a> for InlineFragment<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        match visitor.enter_inline_fragment(ctx, self) {
            Control::Next => {}
            flow => return flow,
        }

        if visit_directives(&self.directives, ctx, visitor) == Control::Break {
            return Control::Break;
        }

        if self.selection_set.visit(ctx, visitor) == Control::Break {
            return Control::Break;
        }

        visitor.leave_inline_fragment(ctx, self)
    }
}

impl<'a> VisitNode<'a> for Directive<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        let flow = visitor.enter_directive(ctx, self);
        if let Control::Next = flow {
            for argument in &self.arguments {
                if argument.visit(ctx, visitor) == Control::Break {
                    return Control::Break;
                }
            }
            visitor.leave_directive(ctx, self)
        } else {
            flow
        }
    }
}

impl<'a> VisitNode<'a> for Argument<'a> {
    fn visit<C, V: Visitor<'a, C>>(&'a self, ctx: &mut C, visitor: &mut V) -> Control {
        let flow = visitor.enter_argument(ctx, self);
        if let Control::Next = flow {
            visitor.leave_argument(ctx, self)
        } else {
            flow
        }
    }
}
