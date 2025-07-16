use assertables::*;

pub fn assert_balanced_braces(code: &str) {
    let mut stack = Vec::new();

    for (i, ch) in code.chars().enumerate() {
        match ch {
            '{' | '(' | '[' => stack.push((ch, i)),
            '}' => match stack.pop() {
                Some(('{', _)) => {}
                _ => panic!("Unbalanced '}}' at position {}", i),
            },
            ')' => match stack.pop() {
                Some(('(', _)) => {}
                _ => panic!("Unbalanced ')' at position {}", i),
            },
            ']' => match stack.pop() {
                Some(('[', _)) => {}
                _ => panic!("Unbalanced ']' at position {}", i),
            },
            _ => {}
        }
    }

    if !stack.is_empty() {
        panic!("Unbalanced braces: {} unclosed delimiters", stack.len());
    }
}

pub fn assert_valid_typescript(code: &str) {
    assert_contains!(code, "export", "Generated code must contain exports");

    assert_not_contains!(code, ": undefined", "Generated code should not contain undefined types");

    assert_balanced_braces(code);

    assert_not_contains!(
        code,
        "interface {} ",
        "Generated code should not contain empty interfaces"
    );
}

pub fn assert_contains_type(code: &str, type_name: &str) {
    let patterns = [
        format!("export interface {}", type_name),
        format!("export type {}", type_name),
        format!("export enum {}", type_name),
    ];

    let found = patterns.iter().any(|p| code.contains(p));

    assert!(
        found,
        "Generated code does not contain type '{}'\nGenerated code:\n{}",
        type_name, code
    );
}
