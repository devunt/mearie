<script lang="ts">
  import type { Client } from '@mearie/core';
  import { setClient } from './client-context.svelte.ts';
  import { untrack } from 'svelte';

  let { client, hookFn, onResult }: { client: Client; hookFn: () => unknown; onResult: (result: unknown) => void } =
    $props();

  untrack(() => {
    setClient(client);
    const result = hookFn();
    onResult(result);
  });
</script>
