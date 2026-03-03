<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Client } from '@mearie/core';
  import { setClient } from './client-context.svelte.ts';

  let { client, children }: { client: Client; children: Snippet } = $props();
  setClient(client);
</script>

{@render children()}
