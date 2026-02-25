---
"@mearie/core": patch
---

fix(core): fix required validation for multiple fragments selecting same object field

The same structural bug as in scalar parsing existed in `validateRequired`:
when two fragment spreads selected the same object field with different
`@required` sub-fields, the `validated` Set caused all but the first
fragment's sub-fields to be skipped without checking their `@required`
constraints.

Applied the same `WeakMap<object, Set<string>>` fix: object fields are always
recursed into without parent-level tracking, while leaf field validation is
deduplicated per object instance.
