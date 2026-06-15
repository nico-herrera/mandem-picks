<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';

	let message = $state('Signing you in…');

	onMount(() => {
		// The Supabase browser client parses the OAuth redirect (hash/code) on load
		// and emits SIGNED_IN once the session is established. Redirect home then.
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, session) => {
			if (session) goto('/');
		});

		// Cover the case where the session is already present by the time we mount.
		supabase.auth.getSession().then(({ data }) => {
			if (data.session) goto('/');
		});

		// Fallback: if no session materializes, send the user back to sign in.
		const timeout = setTimeout(() => {
			message = 'Could not complete sign in. Redirecting…';
			goto('/');
		}, 8000);

		return () => {
			subscription.unsubscribe();
			clearTimeout(timeout);
		};
	});
</script>

<main class="flex min-h-screen items-center justify-center text-ink">
	<div class="text-center">
		<div class="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
		<p class="text-sm uppercase tracking-[0.3em] text-muted">{message}</p>
	</div>
</main>
