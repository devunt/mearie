---
"@mearie/svelte": patch
---

fix(svelte): use $state.snapshot when passing fragment refs to executeFragment

Fragment refs passed to `createFragment` could be Svelte 5 reactive proxies
when the parent component stores them in `$state`. Passing a proxy directly to
`executeFragment` caused serialization issues. Wrapping with `$state.snapshot`
converts the proxy to a plain object before it is handed to the client.
