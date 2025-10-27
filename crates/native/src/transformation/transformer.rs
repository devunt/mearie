use super::clone::*;
use super::context::TransformContext;
use super::printer::print_definitions;
use crate::graphql::ast::*;
use crate::source::Source;

/// Transformer trait for AST transformations.
///
/// All methods return `Option<T>` to enable filtering at any level.
/// Return `Some(node)` to keep/transform, `None` to filter out.
///
/// Default implementations recursively clone nodes while applying transformations.
/// Override specific methods to apply custom transformations.
pub trait Transformer<'a> {
    fn transform_document(
        &mut self,
        ctx: &mut TransformContext<'a>,
        doc: &'a Document<'a>,
    ) -> Option<&'a Document<'a>> {
        let arena = ctx.arena();
        let mut definitions = bumpalo::vec![in arena.allocator();];
        for def in &doc.definitions {
            if let Some(transformed) = self.transform_definition(ctx, def) {
                definitions.push(transformed);
            }
        }

        let printed = print_definitions(&definitions);
        let code = arena.allocator().alloc_str(&printed);

        let new_source = arena.alloc(Source {
            code,
            file_path: doc.source.file_path,
            start_line: 1,
        });

        Some(arena.alloc(Document {
            source: new_source,
            definitions,
        }))
    }

    fn transform_definition(&mut self, ctx: &mut TransformContext<'a>, def: &Definition<'a>) -> Option<Definition<'a>> {
        match def {
            Definition::Executable(ExecutableDefinition::Operation(op)) => self
                .transform_operation(ctx, op)
                .map(|o| Definition::Executable(ExecutableDefinition::Operation(o))),
            Definition::Executable(ExecutableDefinition::Fragment(frag)) => self
                .transform_fragment(ctx, frag)
                .map(|f| Definition::Executable(ExecutableDefinition::Fragment(f))),
            _ => Some(clone_definition(ctx.arena(), def)),
        }
    }

    fn transform_operation(
        &mut self,
        ctx: &mut TransformContext<'a>,
        op: &OperationDefinition<'a>,
    ) -> Option<OperationDefinition<'a>> {
        let arena = ctx.arena();
        let root_type = get_root_type(ctx, op.operation_type);

        let mut variable_definitions = bumpalo::vec![in arena.allocator();];
        for v in &op.variable_definitions {
            if let Some(transformed) = self.transform_variable_definition(ctx, v) {
                variable_definitions.push(transformed);
            }
        }

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &op.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(OperationDefinition {
            span: op.span,
            operation_type: op.operation_type,
            name: op.name,
            variable_definitions,
            directives,
            selection_set: self.transform_selection_set(ctx, &op.selection_set, &root_type)?,
        })
    }

    fn transform_fragment(
        &mut self,
        ctx: &mut TransformContext<'a>,
        frag: &FragmentDefinition<'a>,
    ) -> Option<FragmentDefinition<'a>> {
        let arena = ctx.arena();

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &frag.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(FragmentDefinition {
            span: frag.span,
            name: frag.name,
            type_condition: frag.type_condition,
            directives,
            selection_set: self.transform_selection_set(ctx, &frag.selection_set, frag.type_condition.as_str())?,
        })
    }

    fn transform_variable_definition(
        &mut self,
        ctx: &mut TransformContext<'a>,
        var: &VariableDefinition<'a>,
    ) -> Option<VariableDefinition<'a>> {
        Some(clone_variable_definition(ctx.arena(), var))
    }

    fn transform_selection_set(
        &mut self,
        ctx: &mut TransformContext<'a>,
        sel_set: &SelectionSet<'a>,
        parent_type: &str,
    ) -> Option<SelectionSet<'a>> {
        let arena = ctx.arena();
        let mut selections = bumpalo::vec![in arena.allocator();];
        for sel in &sel_set.selections {
            if let Some(transformed) = self.transform_selection(ctx, sel, parent_type) {
                selections.push(transformed);
            }
        }

        Some(SelectionSet { selections })
    }

    fn transform_selection(
        &mut self,
        ctx: &mut TransformContext<'a>,
        sel: &Selection<'a>,
        parent_type: &str,
    ) -> Option<Selection<'a>> {
        match sel {
            Selection::Field(field) => self.transform_field(ctx, field, parent_type).map(Selection::Field),
            Selection::FragmentSpread(spread) => self
                .transform_fragment_spread(ctx, spread)
                .map(Selection::FragmentSpread),
            Selection::InlineFragment(inline) => self
                .transform_inline_fragment(ctx, inline, parent_type)
                .map(Selection::InlineFragment),
        }
    }

    fn transform_field(
        &mut self,
        ctx: &mut TransformContext<'a>,
        field: &Field<'a>,
        parent_type: &str,
    ) -> Option<Field<'a>> {
        let arena = ctx.arena();
        let field_type = get_field_type(ctx, parent_type, field.name.as_str());

        let selection_set = if let Some(ref field_type_name) = field_type {
            self.transform_selection_set(ctx, &field.selection_set, field_type_name)?
        } else {
            clone_selection_set(arena, &field.selection_set)
        };

        let mut arguments = bumpalo::vec![in arena.allocator();];
        for a in &field.arguments {
            if let Some(transformed) = self.transform_argument(ctx, a) {
                arguments.push(transformed);
            }
        }

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &field.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(Field {
            span: field.span,
            alias: field.alias,
            name: field.name,
            arguments,
            directives,
            selection_set,
        })
    }

    fn transform_fragment_spread(
        &mut self,
        ctx: &mut TransformContext<'a>,
        spread: &FragmentSpread<'a>,
    ) -> Option<FragmentSpread<'a>> {
        let arena = ctx.arena();

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &spread.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(FragmentSpread {
            span: spread.span,
            fragment_name: spread.fragment_name,
            directives,
        })
    }

    fn transform_inline_fragment(
        &mut self,
        ctx: &mut TransformContext<'a>,
        inline: &InlineFragment<'a>,
        parent_type: &str,
    ) -> Option<InlineFragment<'a>> {
        let arena = ctx.arena();
        let type_condition = inline.type_condition.map(|t| t.as_str()).unwrap_or(parent_type);

        let mut directives = bumpalo::vec![in arena.allocator();];
        for d in &inline.directives {
            if let Some(transformed) = self.transform_directive(ctx, d) {
                directives.push(transformed);
            }
        }

        Some(InlineFragment {
            span: inline.span,
            type_condition: inline.type_condition,
            directives,
            selection_set: self.transform_selection_set(ctx, &inline.selection_set, type_condition)?,
        })
    }

    fn transform_directive(&mut self, ctx: &mut TransformContext<'a>, dir: &Directive<'a>) -> Option<Directive<'a>> {
        Some(clone_directive(ctx.arena(), dir))
    }

    fn transform_argument(&mut self, ctx: &mut TransformContext<'a>, arg: &Argument<'a>) -> Option<Argument<'a>> {
        Some(clone_argument(ctx.arena(), arg))
    }
}

fn get_root_type(ctx: &TransformContext<'_>, op_type: OperationType) -> String {
    match op_type {
        OperationType::Query => ctx.schema().query_type().unwrap_or("Query").to_string(),
        OperationType::Mutation => ctx.schema().mutation_type().unwrap_or("Mutation").to_string(),
        OperationType::Subscription => ctx.schema().subscription_type().unwrap_or("Subscription").to_string(),
    }
}

fn get_field_type(ctx: &TransformContext<'_>, parent_type: &str, field_name: &str) -> Option<String> {
    if field_name.starts_with("__") {
        return None;
    }
    ctx.schema()
        .get_field(parent_type, field_name)
        .map(|f| f.typ.innermost_type().to_string())
}
