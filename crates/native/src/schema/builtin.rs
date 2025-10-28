pub const BUILTIN_SCHEMA: &str = r#"
scalar ID
scalar String
scalar Int
scalar Float
scalar Boolean

enum RequiredAction {
  THROW
  CASCADE
}

directive @skip(if: Boolean!) on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

directive @include(if: Boolean!) on QUERY | MUTATION | SUBSCRIPTION | FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION | ENUM_VALUE | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION

directive @specifiedBy(url: String!) on SCALAR

directive @required(action: RequiredAction = THROW) on FIELD
"#;
