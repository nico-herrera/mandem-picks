<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		title?: string;
		size?: 'sm' | 'md' | 'lg';
		onclose?: () => void;
		children?: Snippet;
		footer?: Snippet;
	}

	let { title = '', size = 'sm', onclose, children, footer }: Props = $props();

	const close = () => onclose?.();

	const maxW = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- Backdrop click-to-close is a mouse convenience; keyboard users close via Escape
	(svelte:window above) or the footer button. -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
	transition:fade={{ duration: 150 }}
	onclick={(e) => e.target === e.currentTarget && close()}
	role="presentation"
>
	<div
		class="w-full {maxW[size]} max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-hairline bg-surface shadow-lift"
		transition:scale={{ duration: 220, start: 0.96 }}
		role="dialog"
		aria-modal="true"
	>
		{#if title}
			<div class="px-6 pt-6 pb-2">
				<h2 class="text-xl font-semibold tracking-tight">{title}</h2>
			</div>
		{/if}
		<div class="px-6 py-4 overflow-y-auto flex-grow">
			{@render children?.()}
		</div>
		{#if footer}
			<div class="px-6 pb-6 pt-2 border-t border-hairline/60">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
