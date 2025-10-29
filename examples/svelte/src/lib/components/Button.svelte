<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	interface Props extends HTMLButtonAttributes {
		class?: string;
		children?: Snippet;
	}

	let { class: className = '', children, ...props }: Props = $props();
</script>

<button
	class={`inline-flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-white text-neutral-950 border border-neutral-300 text-sm px-4 py-2 ${className}`}
	{...props}
>
	{@render children?.()}
</button>
