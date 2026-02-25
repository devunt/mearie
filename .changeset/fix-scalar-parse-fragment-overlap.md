---
"@mearie/core": patch
---

fix(core): fix scalar parsing for multiple fragments selecting same object field

When two or more fragment spreads both selected the same object field but with
different sub-fields (e.g. Fragment1 selecting `user { createdAt }` and
Fragment2 selecting `user { updatedAt }`), the `parsed` Set at the parent
level caused the second fragment's sub-fields to be skipped entirely, leaving
scalar values (such as DateTime) un-transformed.

Fixed by switching from a flat `Set<string>` to a `WeakMap<object, Set<string>>`
that tracks parsed fields per object instance. Object fields are no longer
added to the parent's tracking set; only scalar leaf fields are, so subsequent
fragments can recurse into the same object and process their own sub-fields.
