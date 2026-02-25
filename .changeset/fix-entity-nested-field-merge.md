---
"@mearie/core": patch
---

fix(core): use deep merge for entity storage writes during normalization

Entity storage writes used shallow object spread (`{ ...existing, ...fields }`),
which caused nested non-entity objects to lose fields when selected at different
fragment levels. For example, a direct field selecting `stats { fieldA }` and a
fragment selecting `stats { fieldA fieldB }` would result in only `fieldA` being
stored. Replaced with `mergeFields` to preserve all fields across selections.
