---
"@mearie/core": patch
---

fix(core): use deep merge for fragment spread fields in scalar parsing and required validation

Fragment spreads that select the same nested object field with fewer sub-selections (e.g., a root-level fragment selecting `me { id }` when the direct field selects `me { id, name, email, sites, ... }`) would overwrite the full object due to `Object.assign` performing a shallow merge. This caused fields like `sites`, `name`, and `email` to be lost from the query result.

Replaced `Object.assign` with a recursive `deepAssign` that merges objects field-by-field and arrays element-by-element, preserving all fields from both direct selections and fragment spreads.
