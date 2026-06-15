import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		env: {
			// Expose NEXT_PUBLIC_*-prefixed vars to the client via $env/static/public.
			// This prefix is global — every public env var must use it.
			publicPrefix: 'NEXT_PUBLIC_'
		}
	},
	preprocess: vitePreprocess()
};
export default config;
