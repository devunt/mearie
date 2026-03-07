---
'@mearie/core': patch
---

Fix embedded object patches losing unaffected fields during partial updates

When a mutation returned a subset of an embedded object's fields (e.g. `usage { current }` without `limit`), the generated subscriber patch would replace the entire embedded object, dropping fields that weren't part of the mutation response. Now `processScalarChanges` reads the post-merge value from storage, ensuring patches include all fields.
