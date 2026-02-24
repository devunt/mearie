---
"@mearie/core": minor
---

Introduce exchange extension system with named exchanges. All exchanges now return `{ name, io }` objects instead of bare `ExchangeIO` functions, enabling exchanges to expose public APIs via extensions.
  