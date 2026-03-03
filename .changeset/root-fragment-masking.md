---
"@mearie/core": patch
---

fix(cache): mask root-level fragment spreads and propagate variables

Root-level fragment spreads on the Query type are now properly masked with `FragmentRefKey` instead of being inlined. Fragment variables are always propagated to fragment refs, even when no explicit fragment arguments are defined, ensuring correct field resolution for variable-dependent selections.
