<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	let { children } = $props();

	onMount(() => {
		let initialized = false;

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event) => {
			// Skip the event fired on subscribe so initial page load isn't redirected.
			if (!initialized) {
				initialized = true;
				return;
			}

			// Session ended (signed out elsewhere, or token refresh failed / expired):
			// hard-redirect every tab to the login screen so no route is left showing
			// a stale authenticated view making requests that will fail under RLS.
			// A full reload (not goto) guarantees the home route re-mounts and resets.
			if (event === 'SIGNED_OUT') {
				window.location.href = '/';
			}
		});

		return () => subscription.unsubscribe();
	});
</script>

{@render children?.()}
