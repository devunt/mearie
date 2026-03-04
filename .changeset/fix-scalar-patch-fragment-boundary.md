---
"@mearie/core": patch
---

fix(cache): prevent scalar patches from crossing FragmentSpread boundaries

Scalar changes to entity fields inside a FragmentSpread produced patches with paths invalid for the parent query subscription's denormalized data, causing a `TypeError: Cannot read properties of undefined` crash at runtime.

Introduces a `dependency: 'direct' | 'transitive'` discriminator on `CursorEntry` so that `processScalarChanges` skips transitive cursors propagated through FragmentSpread boundaries. Transitive cursors still participate in invalidation and structural change detection.
