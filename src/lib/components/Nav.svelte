<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		title?: string;
		subtitle?: string;
		children?: Snippet;
	}

	let { title = 'MANDEM PICKS', subtitle = '', children }: Props = $props();

	let scrolled = $state(false);

	onMount(() => {
		const onScroll = () => (scrolled = window.scrollY > 8);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<nav
	class="sticky top-0 z-40 transition-all duration-300 {scrolled
		? 'border-b border-hairline bg-canvas/80 backdrop-blur-xl'
		: 'border-b border-transparent'}"
>
	<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
		<div class="min-w-0">
			<a
				href="/"
				class="block truncate text-base font-extrabold uppercase tracking-tightest text-ink sm:text-lg"
			>
				{title}
			</a>
			{#if subtitle}
				<p class="truncate text-xs text-muted">{subtitle}</p>
			{/if}
		</div>
		<div class="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
			{@render children?.()}
		</div>
	</div>
</nav>
