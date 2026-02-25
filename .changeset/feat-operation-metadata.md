---
"@mearie/core": minor
---

feat(core): add operation metadata passthrough and subscription transport routing

Add `metadata` field to `QueryOptions`, `MutationOptions`, `SubscriptionOptions`,
and `FragmentOptions`, allowing users to pass exchange-specific metadata at
execution time. The metadata is forwarded through `createOperation` into the
operation object consumed by the exchange pipeline.

The `subscriptionExchange` now accepts `metadata.subscription.transport: true`
to route query/mutation operations through the subscription transport (e.g.
graphql-ws, graphql-sse) instead of the default HTTP exchange.
