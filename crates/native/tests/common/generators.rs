use proptest::prelude::*;

pub fn valid_identifier() -> impl Strategy<Value = String> {
    prop::string::string_regex("[_A-Za-z][_0-9A-Za-z]{0,50}")
        .unwrap()
}

pub fn invalid_identifier() -> impl Strategy<Value = String> {
    prop_oneof![
        prop::string::string_regex("[0-9][_0-9A-Za-z]*").unwrap(),
        Just("".to_string()),
        Just("-invalid".to_string()),
    ]
}

pub fn scalar_value() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("null".to_string()),
        prop::bool::ANY.prop_map(|b| b.to_string()),
        prop::num::i32::ANY.prop_map(|n| n.to_string()),
        prop::num::f64::NORMAL.prop_map(|f| f.to_string()),
        string_value(),
    ]
}

pub fn string_value() -> impl Strategy<Value = String> {
    prop::string::string_regex(r#""([^"\\]|\\.)*""#).unwrap()
}

pub fn simple_type() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("String".to_string()),
        Just("Int".to_string()),
        Just("Float".to_string()),
        Just("Boolean".to_string()),
        Just("ID".to_string()),
        valid_identifier(),
    ]
}

pub fn complex_type() -> BoxedStrategy<String> {
    simple_type().prop_recursive(
        3,
        10,
        5,
        |inner| {
            prop_oneof![
                inner.clone().prop_map(|t| format!("{}!", t)),
                inner.prop_map(|t| format!("[{}]", t)),
            ]
        }
    ).boxed()
}

pub fn field_definition() -> impl Strategy<Value = String> {
    (valid_identifier(), complex_type())
        .prop_map(|(name, typ)| format!("{}: {}", name, typ))
}

pub fn valid_operation() -> impl Strategy<Value = String> {
    (
        prop::option::of(valid_identifier()),
        prop::collection::vec(valid_identifier(), 1..5),
    ).prop_map(|(name, fields)| {
        let name_part = name
            .map_or(String::new(), |n| format!(" {}", n));
        let fields_part = fields.join("\n    ");
        format!(
            "query{} {{\n    {}\n}}",
            name_part, fields_part
        )
    })
}

pub fn valid_fragment() -> impl Strategy<Value = String> {
    (
        valid_identifier(),
        valid_identifier(),
        prop::collection::vec(valid_identifier(), 1..5),
    ).prop_map(|(name, type_cond, fields)| {
        let fields_part = fields.join("\n    ");
        format!(
            "fragment {} on {} {{\n    {}\n}}",
            name, type_cond, fields_part
        )
    })
}

pub fn proptest_config() -> ProptestConfig {
    let cases = if is_ci() {
        std::env::var("PROPTEST_CASES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10000)
    } else {
        100
    };

    ProptestConfig {
        cases,
        ..ProptestConfig::default()
    }
}

fn is_ci() -> bool {
    std::env::var("CI").is_ok()
}
