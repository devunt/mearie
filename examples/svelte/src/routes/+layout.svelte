<script lang="ts">
	import '../app.css';
	import { setClient } from '@mearie/svelte';
	import { mearieClient } from '$lib/client.ts';

	setClient(mearieClient);

	let { children } = $props();
</script>

<div class="min-h-screen flex flex-col">
	<header class="border-b border-neutral-200">
		<div class="max-w-7xl mx-auto px-6">
			<div class="flex items-center h-16">
				<a href="/" class="text-lg font-semibold text-neutral-950">
					Mearie Examples
				</a>
			</div>
		</div>
	</header>
	<main class="flex-1">
		<div class="max-w-7xl mx-auto px-6 py-12 pb-24">
			{@render children?.()}
		</div>
	</main>
</div>
