---
"@mearie/native": minor
"@mearie/shared": minor
"@mearie/core": minor
---

feat(native,shared,core): add client-only fragment arguments support

Fragments can now declare parameters and accept arguments at spread sites, following the GraphQL spec PR #1081 semantics. Arguments are compiled away at codegen time — no changes to the server query — and bound automatically at runtime via fragment refs.

Parser and AST accept `fragment Foo($x: Int! = 1) on Bar { ... }` definitions and `...Foo(x: 42)` spreads. Validation enforces all 9 spec rules (argument names, required args, uniqueness, scoping, type compatibility, etc.). The transformation pipeline strips variable definitions and spread arguments from operation bodies sent to the server.

At runtime, fragment spread arguments are resolved during denormalization and stored on fragment refs as `__fragmentVars`. `readFragment` and `subscribeFragment` use these vars to compute correct cache field keys, with zero API surface changes — `useFragment` works as before.
