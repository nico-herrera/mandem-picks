<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '$lib/actions/reveal';

	interface Props {
		padding?: string;
		animate?: boolean;
		delay?: number;
		hover?: boolean;
		class?: string;
		children?: Snippet;
	}

	let {
		padding = 'p-6 sm:p-8',
		animate = false,
		delay = 0,
		hover = false,
		class: extra = '',
		children
	}: Props = $props();
</script>

{#if animate}
	<div
		use:reveal={{ delay }}
		class="rounded-2xl border border-hairline bg-surface/80 backdrop-blur-xl shadow-card {padding} {hover
			? 'transition-all duration-300 hover:border-white/20 hover:shadow-lift'
			: ''} {extra}"
	>
		{@render children?.()}
	</div>
{:else}
	<div
		class="rounded-2xl border border-hairline bg-surface/80 backdrop-blur-xl shadow-card {padding} {hover
			? 'transition-all duration-300 hover:border-white/20 hover:shadow-lift'
			: ''} {extra}"
	>
		{@render children?.()}
	</div>
{/if}
