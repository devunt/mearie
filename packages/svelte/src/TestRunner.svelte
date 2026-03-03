<script lang="ts">
  import type { Client } from '@mearie/core';
  import { setClient } from './client-context.svelte.ts';
  import { untrack } from 'svelte';

  let { client, setupFn, onResult }: { client: Client; setupFn: () => unknown; onResult: (result: unknown) => void } =
    $props();

  untrack(() => {
    setClient(client);
    const result = setupFn();
    onResult(result);
  });
</script>
