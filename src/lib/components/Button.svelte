<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'ghost' | 'danger' | 'vote';
		size?: 'sm' | 'md' | 'lg';
		href?: string | null;
		type?: 'button' | 'submit';
		disabled?: boolean;
		loading?: boolean;
		active?: boolean;
		accent?: 'win' | 'skip' | 'white';
		fullWidth?: boolean;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		href = null,
		type = 'button',
		disabled = false,
		loading = false,
		active = false,
		accent = 'white',
		fullWidth = false,
		onclick,
		children
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center font-medium rounded-full transition-all duration-200 ' +
		'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.97] ' +
		'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

	const sizes = {
		sm: 'px-4 py-1.5 text-sm',
		md: 'px-5 py-2.5 text-sm',
		lg: 'px-7 py-3.5 text-base'
	};

	const variantClass = $derived.by(() => {
		switch (variant) {
			case 'primary':
				return 'bg-white text-black hover:bg-white/90 shadow-[0_4px_20px_-6px_rgba(255,255,255,0.4)] hover:-translate-y-0.5';
			case 'ghost':
				return 'bg-white/5 text-ink border border-hairline hover:bg-white/10 hover:border-white/30';
			case 'danger':
				return 'bg-transparent text-loss border border-loss/40 hover:bg-loss/10';
			case 'vote':
				if (active) {
					if (accent === 'win') return 'bg-win text-black font-semibold shadow-[0_4px_20px_-6px_rgba(52,211,153,0.5)]';
					if (accent === 'skip') return 'bg-skip text-black font-semibold';
					return 'bg-white text-black font-semibold';
				}
				return 'bg-white/[0.04] text-muted border border-hairline hover:text-ink hover:border-white/30 hover:bg-white/[0.07]';
			default:
				return '';
		}
	});
</script>

{#if href}
	<a {href} class="{base} {sizes[size]} {variantClass} {fullWidth ? 'w-full' : ''}" {onclick}>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{disabled}
		class="{base} {sizes[size]} {variantClass} {fullWidth ? 'w-full' : ''}"
		{onclick}
	>
		{#if loading}
			<span class="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
		{/if}
		{@render children?.()}
	</button>
{/if}
