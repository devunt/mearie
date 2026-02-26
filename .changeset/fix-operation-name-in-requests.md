---
"@mearie/core": patch
---

fix(core): include operationName in HTTP and subscription requests

`httpExchange` and `subscriptionExchange` were omitting `operationName` from
request payloads. Added `operationName` field using `artifact.name` to both
exchanges to comply with the GraphQL over HTTP spec.
