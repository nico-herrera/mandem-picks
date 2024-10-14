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
	let userVotes: { [key: string]: string } = {};
	let showShareModal: boolean = false;

	async function loadUserVotes() {
		if (!user) return;
		const { data, error } = await supabase
			.from('votes')
			.select('matchup_id, vote')
			.eq('user_id', user.id);

		if (error) {
			console.error('Error loading user votes:', error);
			return;
		}
		userVotes = data.reduce((acc, vote) => {
			acc[vote.matchup_id] = vote.vote;
			return acc;
		}, {});
	}

	onMount(async () => {
		const storedUser = localStorage.getItem('user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			showAuthForm = false;
			await loadMatchups();
			await loadUserVotes();
		}
	});

	onMount(async () => {
		if (user) {
			await loadMatchups();
			await loadUserVotes();
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
				// Check if the user already exists
				const { data: existingUser, error: existingError } = await supabase
					.from('users')
					.select()
					.eq('username', username)
					.single();

				if (existingError && existingError.code !== 'PGRST116') {
					// PGRST116 is the code for "No rows found"
					throw existingError;
				}

				if (existingUser) {
					showModalMessage('User already exists.');
					isLoading = false;
					return;
				}

				// Proceed with sign up if user does not exist
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
				// Check if the username exists
				const { data: userByUsername, error: userError } = await supabase
					.from('users')
					.select('*')
					.eq('username', username)
					.single();

				if (userError) {
					throw userError;
				}

				if (!userByUsername) {
					showModalMessage('Invalid username.');
					isLoading = false;
					return;
				}

				// Check if the password matches
				if (userByUsername.password !== password) {
					showModalMessage('Invalid password.');
					isLoading = false;
					return;
				}

				// If both username and password match
				user = userByUsername;

				localStorage.setItem('user', JSON.stringify({ username, password, id: user.id }));
				showAuthForm = false;
				await loadMatchups();
				await loadUserVotes();
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

	let matchupsByWeek: { [week: string]: any[] } = {};

	function getNFLWeek(date: Date = new Date()): number {
		const kickoff = new Date(2024, 8, 6); // September 6, 2024

		const daysSinceKickoff = Math.floor(
			(date.getTime() - kickoff.getTime()) / (1000 * 60 * 60 * 24)
		);
		const weeksSinceKickoff = Math.floor(daysSinceKickoff / 7);

		// Adjust for the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
		const dayOfWeek = date.getDay();
		const isTuesdayOrLater = dayOfWeek > 2 || (dayOfWeek === 2 && date.getHours() >= 0);

		// Add 1 to weeksSinceKickoff to align with the first week being Week 1
		return weeksSinceKickoff + (isTuesdayOrLater ? 1 : 0) + 1;
	}

	async function loadMatchups() {
		try {
			const response = await fetch('/api/nfl-matchups');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();

			const processedMatchups = await Promise.all(
				data.map(async (matchup) => {
					const votes = await getVotesForMatchup(matchup.id);
					const gameDate = new Date(matchup.commence_time);
					const nflWeek = getNFLWeek(gameDate);
					return {
						...matchup,
						home_votes: votes.filter((v) => v.vote === 'home').length,
						away_votes: votes.filter((v) => v.vote === 'away').length,
						skip_votes: votes.filter((v) => v.vote === 'skip').length,
						nflWeek,
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

			// Group matchups by NFL week
			matchupsByWeek = processedMatchups.reduce((acc, matchup) => {
				const weekKey = `Week ${matchup.nflWeek}`;
				if (!acc[weekKey]) {
					acc[weekKey] = [];
				}
				acc[weekKey].push(matchup);
				return acc;
			}, {});

			// Sort matchups within each week by date
			Object.keys(matchupsByWeek).forEach((week) => {
				matchupsByWeek[week].sort(
					(a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
				);
			});
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

	async function submitVote(matchupId: string, vote: string, matchup: string) {
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
					showModalMessage('You have already voted for this option.');
					isLoading = false;
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
					.insert([{ matchup_id: matchupId, user_id: user.id, vote, matchup }])
					.select());
			}

			if (error) {
				throw error;
			}

			// Update local state to reflect the new or updated vote
			updateMatchupVotes(matchupId, vote, existingVote?.vote);

			// Update userVotes
			userVotes[matchupId] = vote;
			userVotes = { ...userVotes };
		} catch (error) {
			console.error('Error submitting vote:', error);
			showModalMessage('Error submitting vote: ' + error.message);
		} finally {
			isLoading = false;
		}
	}

	function updateMatchupVotes(matchupId: string, newVote: string, oldVote?: string) {
		Object.keys(matchupsByWeek).forEach((week) => {
			const matchupIndex = matchupsByWeek[week].findIndex((m) => m.id === matchupId);
			if (matchupIndex !== -1) {
				const matchup = matchupsByWeek[week][matchupIndex];

				// Decrease the count for the old vote
				if (oldVote) {
					if (oldVote === 'home') matchup.home_votes--;
					else if (oldVote === 'away') matchup.away_votes--;
					else if (oldVote === 'skip') matchup.skip_votes--;
				}

				// Increase the count for the new vote
				if (newVote === 'home') matchup.home_votes++;
				else if (newVote === 'away') matchup.away_votes++;
				else if (newVote === 'skip') matchup.skip_votes++;

				matchupsByWeek[week][matchupIndex] = { ...matchup };
				matchupsByWeek = { ...matchupsByWeek };
			}
		});
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
			away_votes: votes.filter((v) => v.vote === 'away').length,
			skip_votes: votes.filter((v) => v.vote === 'skip').length
		};
		matchups = [...matchups]; // Trigger reactivity
	}

	function getOddsDisplay(odds) {
		if (odds && odds.h2h && odds.h2h.length >= 2) {
			return `${odds.h2h[0].name}: ${odds.h2h[0].price} | ${odds.h2h[1].name}: ${odds.h2h[1].price}`;
		}
		return 'N/A';
	}

	function getMostVotedOption(matchup: any) {
		const votes = [
			{ option: 'home', votes: matchup.home_votes, team: matchup.home_team },
			{ option: 'away', votes: matchup.away_votes, team: matchup.away_team },
			{ option: 'skip', votes: matchup.skip_votes || 0, team: 'skip' }
		];
		return votes.reduce((max, current) => (current.votes > max.votes ? current : max));
	}

	function openShareModal() {
		showShareModal = true;
	}

	function closeShareModal() {
		showShareModal = false;
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
					<div class="flex space-x-2">
						<button
							on:click={openShareModal}
							class="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
						>
							Share Results
						</button>
						<button
							on:click={signOut}
							class="bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors"
						>
							Sign Out
						</button>
					</div>
				</div>
				<h2 class="text-xl font-semibold mb-4">NFL Matchups</h2>
				{#each Object.entries(matchupsByWeek) as [week, matchups]}
					<div class="mb-8">
						<h3 class="text-lg font-semibold mb-4 bg-indigo-700 p-2 rounded-lg">{week}</h3>
						{#each matchups as matchup (matchup.id)}
							<div class="bg-gray-700 rounded-lg p-4 mb-4">
								<h4 class="text-lg font-semibold mb-2">
									{matchup.home_team} vs {matchup.away_team}
								</h4>
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
											on:click={() =>
												submitVote(
													matchup.id,
													'away',
													`${matchup.away_team} vs ${matchup.home_team}`
												)}
											class="w-full sm:w-auto text-white rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors"
											class:bg-gray-500={userVotes[matchup.id] !== 'away'}
											class:hover:bg-gray-600={userVotes[matchup.id] !== 'away'}
											class:focus:ring-gray-400={userVotes[matchup.id] !== 'away'}
											class:bg-green-600={userVotes[matchup.id] === 'away'}
											class:hover:bg-green-700={userVotes[matchup.id] === 'away'}
											class:focus:ring-green-500={userVotes[matchup.id] === 'away'}
											disabled={isLoading}
										>
											Away {matchup.away_team}
										</button>
										<button
											on:click={() =>
												submitVote(
													matchup.id,
													'home',
													`${matchup.away_team} vs ${matchup.home_team}`
												)}
											class="w-full sm:w-auto text-white rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors"
											class:bg-gray-500={userVotes[matchup.id] !== 'home'}
											class:hover:bg-gray-600={userVotes[matchup.id] !== 'home'}
											class:focus:ring-gray-400={userVotes[matchup.id] !== 'home'}
											class:bg-green-600={userVotes[matchup.id] === 'home'}
											class:hover:bg-green-700={userVotes[matchup.id] === 'home'}
											class:focus:ring-green-500={userVotes[matchup.id] === 'home'}
											disabled={isLoading}
										>
											Home {matchup.home_team}
										</button>
										<button
											on:click={() =>
												submitVote(
													matchup.id,
													'skip',
													`${matchup.away_team} vs ${matchup.home_team}`
												)}
											class="w-full sm:w-auto text-white rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors"
											class:bg-gray-500={userVotes[matchup.id] !== 'skip'}
											class:hover:bg-gray-600={userVotes[matchup.id] !== 'skip'}
											class:focus:ring-gray-400={userVotes[matchup.id] !== 'skip'}
											class:bg-yellow-600={userVotes[matchup.id] === 'skip'}
											class:hover:bg-yellow-700={userVotes[matchup.id] === 'skip'}
											class:focus:ring-yellow-500={userVotes[matchup.id] === 'skip'}
											disabled={isLoading}
										>
											Skip
										</button>
									</div>
									<div class="text-center sm:text-right">
										<p class="text-sm font-semibold">
											{matchup.home_team}: {matchup.home_votes}
										</p>
										<p class="text-sm font-semibold">
											{matchup.away_team}: {matchup.away_votes}
										</p>
										<p class="text-sm font-semibold">
											Skipped: {matchup.skip_votes || 0}
										</p>
									</div>
								</div>
							</div>
						{/each}
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
	{#if showShareModal}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2"
			on:click={closeShareModal}
		>
			<div
				class="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col"
				on:click|stopPropagation
			>
				<div class="p-4 overflow-y-auto flex-grow">
					<h2 class="text-xl font-bold mb-2">Most Voted Teams</h2>
					<div class="grid grid-cols-2 gap-2">
						{#each matchups as matchup (matchup.id)}
							{@const mostVoted = getMostVotedOption(matchup)}
							<div
								class="bg-gray-700 flex flex-col items-center justify-center rounded-lg p-2 gap-1 text-sm"
							>
								<h3 class="font-semibold mb-1 text-center">
									{matchup.home_team.split(' ').slice(-1)[0]} vs {matchup.away_team
										.split(' ')
										.slice(-1)[0]}
								</h3>
								<div
									class="flex items-center justify-center py-2 px-2 rounded-md text-center font-medium bg-green-600 w-full"
								>
									{#if mostVoted.option === 'skip'}
										Skip
									{:else}
										{mostVoted.team.split(' ').slice(-1)[0]}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="p-2 border-t border-gray-700">
					<button
						on:click={closeShareModal}
						class="w-full bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors text-sm"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		@apply bg-gray-900 text-gray-100;
	}
</style>
