/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				canvas: '#0A0A0B',
				surface: {
					DEFAULT: '#141416',
					2: '#1C1C1F'
				},
				hairline: '#2A2A2E',
				ink: '#F5F5F7',
				muted: '#8A8A8E',
				win: '#34D399',
				loss: '#F87171',
				skip: '#A1A1AA'
			},
			fontFamily: {
				sans: [
					'Inter',
					'-apple-system',
					'BlinkMacSystemFont',
					'Segoe UI',
					'Roboto',
					'sans-serif'
				]
			},
			letterSpacing: {
				tightest: '-0.04em'
			},
			borderRadius: {
				'2xl': '1rem',
				'3xl': '1.5rem'
			},
			boxShadow: {
				glow: '0 0 60px -15px rgba(255,255,255,0.12)',
				card: '0 8px 40px -12px rgba(0,0,0,0.6)',
				lift: '0 20px 50px -20px rgba(0,0,0,0.8)'
			},
			keyframes: {
				'fade-up': {
					'0%': { opacity: '0', transform: 'translateY(24px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				'scale-in': {
					'0%': { opacity: '0', transform: 'scale(0.96)' },
					'100%': { opacity: '1', transform: 'scale(1)' }
				},
				'glow-pulse': {
					'0%, 100%': { opacity: '0.4' },
					'50%': { opacity: '0.8' }
				}
			},
			animation: {
				'fade-up': 'fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
				'scale-in': 'scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
				'glow-pulse': 'glow-pulse 6s ease-in-out infinite'
			}
		}
	},
	plugins: []
};
