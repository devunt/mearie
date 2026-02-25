---
"@mearie/core": patch
---

fix(core): merge cache arrays element-wise in mergeFields

Arrays in the normalized cache were always overwritten last-write-wins. Now
they are merged element-by-element so that partial fragment selections (e.g.
`sites { id }` alongside `sites { id name }`) retain sub-object fields from
all selections rather than discarding them.
