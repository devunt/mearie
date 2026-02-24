---
"@mearie/core": minor
"@mearie/native": minor
"@mearie/shared": minor
---

Add `@required` directive support with `THROW` and `CASCADE` actions for client-side null handling. `THROW` throws `RequiredFieldError` when a required field is null; `CASCADE` propagates null to the nearest nullable ancestor.
  