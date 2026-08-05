---
'@mearie/core': patch
---

Report normalized values (entity links, not raw response objects) to the change accessor when a nested selection field transitions from null, so the transition is classified as a structural change and subscriptions re-trace. Previously a null → entity link write notified watchers once with the new data — the change carried the pre-normalization raw object, which is not an entity link, so it took the scalar path — but the re-trace that registers cursors for the newly linked entity's fields never ran. Every watcher materialized while the link was still null stayed permanently silent to subsequent field changes on that entity until a refetch or resubscribe. The same asymmetry also stored raw objects in the optimistic rollback stack. This aligns the null-transition path with the link-replacement path fixed in #151.
