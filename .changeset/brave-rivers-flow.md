---
'@mearie/native': patch
'@mearie/client': patch
---

Add DocumentNode runtime generation with string-based lookup. The codegen now generates JavaScript DocumentNode objects with a documentMap for O(1) runtime lookup using source strings as keys.
