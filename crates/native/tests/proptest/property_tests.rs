use mearie_native::ast::Document;
use mearie_native::parser::{GraphQLContext, ParseNode};
use mearie_native::span::Source;
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_valid_identifiers_parse(
        name in "[a-zA-Z_][a-zA-Z0-9_]{0,50}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("type {} {{ id: ID! }}", name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_numeric_values_parse(
        num in -1000000i64..1000000i64
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("query {{ field(value: {}) {{ id }} }}", num);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_float_values_parse(
        num in -1000000.0f64..1000000.0f64
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("query {{ field(value: {}) {{ id }} }}", num);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_string_values_parse(
        s in "[a-zA-Z0-9 ]{0,100}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!(r#"query {{ field(value: "{}") {{ id }} }}"#, s);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_boolean_values_parse(
        b in any::<bool>()
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("query {{ field(value: {}) {{ id }} }}", b);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_list_of_integers_parse(
        nums in prop::collection::vec(0i32..100i32, 0..10)
    ) {
        let ctx = GraphQLContext::new();
        let nums_str = nums.iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let source_str = format!("query {{ field(values: [{}]) {{ id }} }}", nums_str);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_variable_names_parse(
        name in "[a-zA-Z_][a-zA-Z0-9_]{0,30}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("query(${}:Int){{field(v:${}){{id}}}}", name, name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_field_names_parse(
        name in "[a-zA-Z_][a-zA-Z0-9_]{0,30}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("query {{ {} {{ id }} }}", name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_type_names_parse(
        name in "[A-Z][a-zA-Z0-9_]{0,30}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("type {} {{ id: ID! }}", name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_enum_values_parse(
        name in "[A-Z][A-Z0-9_]{0,20}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("enum Status {{ {} }}", name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_multiple_fields_parse(
        count in 1usize..10usize
    ) {
        let ctx = GraphQLContext::new();
        let fields: Vec<String> = (0..count)
            .map(|i| format!("field{} {{ id }}", i))
            .collect();
        let source_str = format!("query {{ {} }}", fields.join(" "));
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_nested_selection_sets(
        depth in 1usize..5usize
    ) {
        let ctx = GraphQLContext::new();
        let mut source_str = "query { ".to_string();
        for i in 0..depth {
            source_str.push_str(&format!("field{} {{ ", i));
        }
        source_str.push_str("id ");
        for _ in 0..depth {
            source_str.push_str("} ");
        }
        source_str.push('}');
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_multiple_operations(
        count in 1usize..5usize
    ) {
        let ctx = GraphQLContext::new();
        let ops: Vec<String> = (0..count)
            .map(|i| format!("query Q{} {{ field {{ id }} }}", i))
            .collect();
        let source_str = ops.join("
");
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_arguments_with_various_types(
        int_val in 0i32..100i32,
        float_val in 0.0f64..100.0f64,
        bool_val in any::<bool>()
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!(
            "query {{ field(a: {}, b: {}, c: {}) {{ id }} }}",
            int_val, float_val, bool_val
        );
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_fragment_names(
        name in "[A-Z][a-zA-Z0-9_]{0,30}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("fragment {} on User {{ id }}", name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_directive_names(
        name in "[a-zA-Z_][a-zA-Z0-9_]{0,30}"
    ) {
        let ctx = GraphQLContext::new();
        let source_str = format!("query {{ field @{}(if: true) {{ id }} }}", name);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_nullable_vs_non_null_types(
        nullable in any::<bool>()
    ) {
        let ctx = GraphQLContext::new();
        let type_suffix = if nullable { "" } else { "!" };
        let source_str = format!("type User {{ id: ID{} }}", type_suffix);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_list_types_with_nullability(
        inner_nullable in any::<bool>(),
        outer_nullable in any::<bool>()
    ) {
        let ctx = GraphQLContext::new();
        let inner_suffix = if inner_nullable { "" } else { "!" };
        let outer_suffix = if outer_nullable { "" } else { "!" };
        let source_str = format!("type User {{ tags: [String{}]{} }}", inner_suffix, outer_suffix);
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_multiple_interfaces(
        count in 1usize..5usize
    ) {
        let ctx = GraphQLContext::new();
        let interfaces: Vec<String> = (0..count)
            .map(|i| format!("Interface{}", i))
            .collect();
        let source_str = format!(
            "type User implements {} {{ id: ID! }}",
            interfaces.join(" & ")
        );
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }

    #[test]
    fn test_union_members(
        count in 1usize..5usize
    ) {
        let ctx = GraphQLContext::new();
        let members: Vec<String> = (0..count)
            .map(|i| format!("Type{}", i))
            .collect();
        let source_str = format!("union Result = {}", members.join(" | "));
        let source = Source { code: &source_str, file_path: "test.graphql", start_line: 0 };
        let result = Document::parse(&ctx, &source);
        prop_assert!(result.is_ok());
    }
}
