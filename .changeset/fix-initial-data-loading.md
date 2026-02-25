---
"@mearie/svelte": patch
"@mearie/react": patch
"@mearie/vue": patch
"@mearie/solid": patch
---

fix: start background fetch when initialData is provided

When `initialData` was supplied, the query hook would return it immediately
and never subscribe to the server—so the data was never refreshed. The hook
now sets `loading: true` and starts the subscription on mount, allowing
`initialData` to be displayed while a fresh response is in-flight.
