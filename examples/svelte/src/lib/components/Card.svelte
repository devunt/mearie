<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		class?: string;
		children?: Snippet;
	}

	let { class: className = '', children, ...props }: Props = $props();
</script>

<div class={`border border-neutral-200 bg-white p-6 ${className}`} {...props}>
	{@render children?.()}
</div>
