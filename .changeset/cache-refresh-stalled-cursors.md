---
'@mearie/core': patch
---

Re-register subscription cursors when a stalled (partially cached) query is re-traced after a write that still leaves it incomplete. Previously only the complete branch of the stalled-subscription check refreshed the cursor registry — the structural-change path already refreshes unconditionally — so a subscription that started out partial kept its initial shallow cursors. Dependencies on deeper fields were invisible to invalidate, and the stale notification never reached the subscription until it happened to become complete.
