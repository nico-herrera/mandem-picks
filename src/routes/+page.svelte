<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { fade } from 'svelte/transition';

	let name: string = '';
	let favoriteColor: string = '';
	let favoriteAnimal: string = '';
	let user: any = null;
	let matchups: any[] = [];
	let isLoading: boolean = false;
	let showAuthForm: boolean = true;
	let showModal: boolean = false;
	let modalMessage: string = '';
	let allowedNames: string[] = [
		'Jimmy',
		'Micah',
		'Branden',
		'Nobs',
		'Sam',
		'Jerruh',
		'SR24',
		'NCR',
		'Nelson',
		'Nico',
		'Jacob'
	];
	let realtimeSubscription: any;

	onMount(async () => {
		const storedUser = localStorage.getItem('user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			showAuthForm = false;
			await loadMatchups();
		}
	});

	onMount(async () => {
		if (user) {
			await loadMatchups();
			subscribeToVotes();
		}
	});

	function levenshteinDistance(s, t) {
		const d = [];

		for (let i = 0; i <= s.length; i++) {
			d[i] = [i];
		}
		for (let j = 0; j <= t.length; j++) {
			d[0][j] = j;
		}

		for (let j = 1; j <= t.length; j++) {
			for (let i = 1; i <= s.length; i++) {
				if (s[i - 1] === t[j - 1]) {
					d[i][j] = d[i - 1][j - 1];
				} else {
					d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + 1);
				}
			}
		}

		return d[s.length][t.length];
	}

	function findClosestName(inputName: string, names: string[]) {
		inputName = inputName.toLowerCase();
		let closestName = names[0].toLowerCase();
		let smallestDistance = levenshteinDistance(inputName, closestName);

		for (let i = 1; i < names.length; i++) {
			let currentName = names[i].toLowerCase();
			let currentDistance = levenshteinDistance(inputName, currentName);
			if (currentDistance < smallestDistance) {
				smallestDistance = currentDistance;
				closestName = names[i]; // Return the original case name
			}
		}

		return closestName;
	}

	function showModalMessage(message: string) {
		modalMessage = message;
		showModal = true;
	}

	function validateInputs() {
		if (!name || !favoriteColor || !favoriteAnimal) {
			showModalMessage('Please fill in all fields.');
			return false;
		}

		if (name.toLowerCase() === 'nate') {
			showModalMessage('Did you mean: NCR or Nobs?');
			return false;
		} else if (name.toLowerCase() === 'shawn') {
			showModalMessage('Did you mean: SR24?');
			return false;
		}

		if (!allowedNames.map((name) => name.toLowerCase()).includes(name.toLowerCase())) {
			const closestName = findClosestName(name, allowedNames);
			showModalMessage(
				`Unauthorized name. Did you mean: ${closestName}? Allowed names are: ${allowedNames.join(', ')}`
			);
			return false;
		}

		return true;
	}

	async function handleAuth(isSignUp: boolean, username?: string, password?: string) {
		if (!username || !password) {
			if (!validateInputs()) return;
			username = name.replace(/\s+/g, '').toLowerCase();
			password = `${favoriteColor}${favoriteAnimal}`.toLowerCase();
		}

		isLoading = true;

		try {
			if (isSignUp) {
				const { data, error } = await supabase
					.from('users')
					.insert({ username, password })
					.select()
					.single();

				if (error) throw error;

				user = data;
				localStorage.setItem('user', JSON.stringify({ username, password, id: data.id }));
				showModalMessage('Sign up successful!');
			} else {
				const { data, error } = await supabase
					.from('users')
					.select()
					.eq('username', username)
					.eq('password', password)
					.single();

				if (error) throw error;

				if (data) {
					user = data;
					localStorage.setItem('user', JSON.stringify({ username, password, id: data.id }));
					showAuthForm = false;
					await loadMatchups();
				} else {
					showModalMessage('Invalid username or password.');
				}
			}
		} catch (error) {
			console.error('Auth Error:', error);
			showModalMessage(`Error ${isSignUp ? 'signing up' : 'signing in'}: ${error.message}`);
		} finally {
			isLoading = false;
		}
	}

	async function signOut() {
		user = null;
		matchups = [];
		showAuthForm = true;
		localStorage.removeItem('user');
	}

	async function loadMatchups() {
		try {
			const response = await fetch('/api/nfl-matchups');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			matchups = await Promise.all(
				data.map(async (matchup) => {
					const votes = await getVotesForMatchup(matchup.id);
					return {
						...matchup,
						home_votes: votes.filter((v) => v.vote === 'home').length,
						away_votes: votes.filter((v) => v.vote === 'away').length,
						odds: matchup.bookmakers
							.filter((bookmaker) => ['DraftKings', 'FanDuel', 'BetMGM'].includes(bookmaker.title))
							.map((bookmaker) => ({
								name: bookmaker.title,
								odds: bookmaker.markets.reduce((acc, market) => {
									acc[market.key] = market.outcomes;
									return acc;
								}, {})
							}))
					};
				})
			);
		} catch (error) {
			showModalMessage('Error loading matchups: ' + error.message);
		}
	}

	async function getVotesForMatchup(matchupId: string) {
		const { data, error } = await supabase.from('votes').select('*').eq('matchup_id', matchupId);

		if (error) {
			console.error('Error fetching votes:', error);
			return [];
		}
		return data;
	}

	async function submitVote(matchupId: string, vote: string) {
		isLoading = true;

		try {
			// Check if the user has already voted for this matchup
			const { data: existingVote, error: checkError } = await supabase
				.from('votes')
				.select('*')
				.eq('matchup_id', matchupId)
				.eq('user_id', user.id)
				.single();

			if (checkError && checkError.code !== 'PGRST116') {
				throw checkError;
			}

			let data;
			let error;

			if (existingVote) {
				if (existingVote.vote === vote) {
					showModalMessage('You have already voted for this team.');
					return;
				} else {
					// Update the existing vote
					({ data, error } = await supabase
						.from('votes')
						.update({ vote })
						.eq('id', existingVote.id)
						.select());
				}
			} else {
				// Insert a new vote
				({ data, error } = await supabase
					.from('votes')
					.insert([{ matchup_id: matchupId, user_id: user.id, vote }])
					.select());
			}

			if (error) {
				throw error;
			}

			// Update local state to reflect the new or updated vote
			const matchupIndex = matchups.findIndex((m) => m.id === matchupId);
			if (matchupIndex !== -1) {
				if (existingVote) {
					// Decrease the count for the old vote
					matchups[matchupIndex][existingVote.vote === 'home' ? 'home_votes' : 'away_votes'] -= 1;
				}
				// Increase the count for the new vote
				matchups[matchupIndex][vote === 'home' ? 'home_votes' : 'away_votes'] += 1;
				matchups = [...matchups]; // Trigger reactivity
			}
		} catch (error) {
			console.error('Error submitting vote:', error);
			showModalMessage('Error submitting vote: ' + error.message);
		} finally {
			isLoading = false;
		}
	}

	function subscribeToVotes() {
		realtimeSubscription = supabase
			.channel('votes')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, handleVoteChange)
			.subscribe();
	}

	async function handleVoteChange(payload: any) {
		const { new: newVote, old: oldVote, eventType } = payload;

		const matchupIndex = matchups.findIndex((m) => m.id === newVote.matchup_id);
		if (matchupIndex === -1) return;

		const votes = await getVotesForMatchup(newVote.matchup_id);
		matchups[matchupIndex] = {
			...matchups[matchupIndex],
			home_votes: votes.filter((v) => v.vote === 'home').length,
			away_votes: votes.filter((v) => v.vote === 'away').length
		};
		matchups = [...matchups]; // Trigger reactivity
	}

	function getOddsDisplay(odds) {
		if (odds && odds.h2h && odds.h2h.length >= 2) {
			return `${odds.h2h[0].name}: ${odds.h2h[0].price} | ${odds.h2h[1].name}: ${odds.h2h[1].price}`;
		}
		return 'N/A';
	}
</script>

<main class="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6">
	{#if showAuthForm}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="w-full max-w-md bg-gray-800 rounded-lg shadow-xl p-6 sm:p-8">
				<h1 class="text-2xl font-bold mb-6 text-center">Welcome to Mandem Picks!</h1>
				<div class="space-y-4">
					<div class="relative">
						<input
							bind:value={name}
							placeholder="First Name"
							class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div class="relative">
						<input
							bind:value={favoriteColor}
							placeholder="Favorite Color"
							class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div class="relative">
						<input
							bind:value={favoriteAnimal}
							placeholder="Favorite Animal"
							class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div class="flex space-x-4">
						<button
							on:click={() => handleAuth(true)}
							class="flex-1 bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
							disabled={isLoading}
						>
							{isLoading ? 'Loading...' : 'Sign Up'}
						</button>
						<button
							on:click={() => handleAuth(false)}
							class="flex-1 bg-green-600 text-white rounded-md px-4 py-2 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
							disabled={isLoading}
						>
							{isLoading ? 'Loading...' : 'Sign In'}
						</button>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="max-w-4xl mx-auto">
			<div class="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 mb-6">
				<div class="flex flex-col sm:flex-row justify-between items-center mb-6">
					<h1 class="text-2xl font-bold mb-4 sm:mb-0">Welcome, {user?.username}!</h1>
					<button
						on:click={signOut}
						class="w-full sm:w-auto bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors"
					>
						Sign Out
					</button>
				</div>
				<h2 class="text-xl font-semibold mb-4">NFL Matchups</h2>
				{#each matchups as matchup (matchup.id)}
					<div class="bg-gray-700 rounded-lg p-4 mb-4">
						<h3 class="text-lg font-semibold mb-2">
							{matchup.home_team} vs {matchup.away_team}
						</h3>
						<p class="text-sm text-gray-400 mb-4">
							Game Date: {new Date(matchup.commence_time).toLocaleString()}
						</p>
						<div class="overflow-x-auto">
							<table class="w-full text-sm text-left text-gray-300">
								<thead class="text-xs uppercase bg-gray-600 text-gray-300">
									<tr>
										<th scope="col" class="px-4 py-3">Bookmaker</th>
										<th scope="col" class="px-4 py-3">Odds</th>
									</tr>
								</thead>
								<tbody>
									{#each matchup.odds as bookmaker}
										<tr class="border-b border-gray-600">
											<th scope="row" class="px-4 py-3 font-medium whitespace-nowrap">
												{bookmaker.name}
											</th>
											<td class="px-4 py-3">
												{getOddsDisplay(bookmaker.odds)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<div class="flex flex-col sm:flex-row justify-between items-center mt-4">
							<div
								class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-4 sm:mb-0"
							>
								<button
									on:click={() => submitVote(matchup.id, 'home')}
									class="w-full sm:w-auto bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
									disabled={isLoading}
								>
									Vote {matchup.home_team}
								</button>
								<button
									on:click={() => submitVote(matchup.id, 'away')}
									class="w-full sm:w-auto bg-green-600 text-white rounded-md px-4 py-2 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
									disabled={isLoading}
								>
									Vote {matchup.away_team}
								</button>
							</div>
							<div class="text-center sm:text-right">
								<p class="text-sm font-semibold">
									{matchup.home_team}: {matchup.home_votes}
								</p>
								<p class="text-sm font-semibold">
									{matchup.away_team}: {matchup.away_votes}
								</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if showModal}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-10 md:px-0"
		>
			<div class="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
				<h2 class="text-xl font-bold mb-4">Message</h2>
				<p class="mb-6">{modalMessage}</p>
				<button
					on:click={() => (showModal = false)}
					class="w-full bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
				>
					Close
				</button>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		@apply bg-gray-900 text-gray-100;
	}
</style>
