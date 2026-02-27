---
"@mearie/core": patch
---

fix(core): dedup exchange blocking late subscribers to resolved queries

When a new subscriber arrived for a dedupKey whose result had already been
delivered, the dedup exchange incorrectly treated it as in-flight and never
forwarded the request. Added a `resolved` Set to track keys that have
delivered results, so resolved keys are no longer considered in-flight.
