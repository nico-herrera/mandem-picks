<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { getAllUserResults, getGameResults } from '$lib/api';
	import { fade } from 'svelte/transition';

	let user: any = null;
	let userResults: any[] = [];
	let isLoading: boolean = false;
	let isInitialLoading: boolean = true;
	let allUserResults: { [username: string]: any[] } = {};
	let gameResults: any[] = [];
	let showModal: boolean = false;
	let modalMessage: string = '';

	function showModalMessage(message: string) {
		modalMessage = message;
		showModal = true;
	}

	onMount(async () => {
		try {
			const storedUser = localStorage.getItem('user');
			if (storedUser) {
				user = JSON.parse(storedUser);
				await loadResults();
			} else {
				showModalMessage('Please sign in to view results.');
			}
		} catch (error) {
			console.error('Error during initial load:', error);
		} finally {
			isInitialLoading = false;
		}
	});

	async function loadResults() {
		if (!user) return;
		
		isLoading = true;
		try {
			await loadGameResults();
			await loadUserResults();
			await loadAllUserResults();
		} catch (error) {
			console.error('Error loading results:', error);
			showModalMessage('Error loading results: ' + error.message);
		} finally {
			isLoading = false;
		}
	}

	async function loadGameResults() {
		try {
			gameResults = await getGameResults();
		} catch (error) {
			console.error('Error loading game results:', error);
			gameResults = [];
		}
	}

	async function loadUserResults() {
		const { data: votes, error } = await supabase
			.from('votes')
			.select('*')
			.eq('user_id', user.id);

		if (error) {
			throw error;
		}

		userResults = votes || [];
	}

	async function loadAllUserResults() {
		try {
			const allVotes = await getAllUserResults();
			const groupedResults = {};
			
			allVotes.forEach(vote => {
				const username = vote.users?.username;
				if (!groupedResults[username]) {
					groupedResults[username] = [];
				}
				groupedResults[username].push(vote);
			});

			allUserResults = groupedResults;
		} catch (error) {
			console.error('Error loading all user results:', error);
			allUserResults = {};
		}
	}

	function getPickResult(vote: any): { result: 'win' | 'loss' | 'pending' | 'skip', gameResult?: any } {
		if (vote.vote === 'skip') {
			return { result: 'skip' };
		}

		const gameResult = gameResults.find(result => result.matchup_id === vote.matchup_id);
		
		if (!gameResult) {
			return { result: 'pending' };
		}

		const userPickedTeam = vote.vote === 'home' ? gameResult.home_team : gameResult.away_team;
		const didWin = userPickedTeam === gameResult.winner;
		
		return { 
			result: didWin ? 'win' : 'loss',
			gameResult 
		};
	}

	function calculateUserStats(userVotes: any[]) {
		let wins = 0;
		let losses = 0;
		let pending = 0;
		let skipped = 0;

		userVotes.forEach(vote => {
			const { result } = getPickResult(vote);
			switch (result) {
				case 'win':
					wins++;
					break;
				case 'loss':
					losses++;
					break;
				case 'pending':
					pending++;
					break;
				case 'skip':
					skipped++;
					break;
			}
		});

		const totalDecidedPicks = wins + losses;
		const totalPicks = userVotes.filter(vote => vote.vote !== 'skip').length;
		const winPercentage = totalDecidedPicks > 0 ? ((wins / totalDecidedPicks) * 100).toFixed(1) : '0.0';
		
		return { totalPicks, wins, losses, pending, skipped, winPercentage };
	}

	function getVoteDisplayName(vote: string, matchup: string) {
		if (vote === 'skip') return 'Skipped';
		if (vote === 'home') return `Home (${matchup.split(' vs ')[1] || 'Home'})`;
		if (vote === 'away') return `Away (${matchup.split(' vs ')[0] || 'Away'})`;
		return vote;
	}

	function signOut() {
		user = null;
		userResults = [];
		allUserResults = {};
		localStorage.removeItem('user');
		window.location.href = '/';
	}
</script>

<main class="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6">
	{#if isInitialLoading}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="text-center">
				<div class="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mx-auto mb-4"></div>
				<h2 class="text-xl font-semibold text-gray-300">Loading Results...</h2>
				<p class="text-gray-400 mt-2">Please wait while we load your data</p>
			</div>
		</div>
	{:else if !user}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="w-full max-w-md bg-gray-800 rounded-lg shadow-xl p-6 sm:p-8 text-center">
				<h1 class="text-2xl font-bold mb-6">Results Tracker</h1>
				<p class="mb-6 text-gray-300">Please sign in to view pick results.</p>
				<a
					href="/"
					class="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors inline-block"
				>
					Go to Home
				</a>
			</div>
		</div>
	{:else}
		<div class="max-w-6xl mx-auto">
			<div class="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 mb-6">
				<div class="flex flex-col sm:flex-row justify-between items-center mb-6">
					<h1 class="text-2xl font-bold mb-4 sm:mb-0">Results Tracker</h1>
					<div class="flex space-x-2">
						<a
							href="/"
							class="bg-gray-600 text-white rounded-md px-4 py-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors"
						>
							Back to Picks
						</a>
						<button
							on:click={signOut}
							class="bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors"
						>
							Sign Out
						</button>
					</div>
				</div>

				{#if isLoading}
					<div class="text-center py-8">
						<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
						<p class="mt-4 text-gray-300">Loading results...</p>
					</div>
				{:else}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Your Results -->
						<div class="bg-gray-700 rounded-lg p-6">
							<h2 class="text-xl font-semibold mb-4">Your Results ({user.username})</h2>
							{#if userResults}
								{@const stats = calculateUserStats(userResults)}
								<div class="bg-gray-600 rounded-lg p-4 mb-4">
								<div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
									<div>
										<div class="text-2xl font-bold text-blue-400">{stats.totalPicks}</div>
										<div class="text-sm text-gray-300">Total Picks</div>
									</div>
									<div>
										<div class="text-2xl font-bold text-green-400">{stats.wins}</div>
										<div class="text-sm text-gray-300">Wins</div>
									</div>
									<div>
										<div class="text-2xl font-bold text-red-400">{stats.losses}</div>
										<div class="text-sm text-gray-300">Losses</div>
									</div>
									<div>
										<div class="text-2xl font-bold text-gray-400">{stats.pending}</div>
										<div class="text-sm text-gray-300">Pending</div>
									</div>
									<div>
										<div class="text-2xl font-bold text-yellow-400">{stats.winPercentage}%</div>
										<div class="text-sm text-gray-300">Win Rate</div>
									</div>
								</div>
							</div>

								<div class="space-y-2 max-h-96 overflow-y-auto">
									{#if userResults.length === 0}
										<p class="text-gray-400 text-center py-4">No picks made yet.</p>
									{:else}
										{#each userResults as vote}
											{@const pickResult = getPickResult(vote)}
											<div class="bg-gray-600 rounded-lg p-3 flex justify-between items-center">
												<div class="flex-grow">
													<div class="font-medium">{vote.matchup}</div>
													<div class="text-sm text-gray-300">
														Pick: {getVoteDisplayName(vote.vote, vote.matchup)}
													</div>
													{#if pickResult.gameResult}
														<div class="text-xs text-gray-400 mt-1">
															Final: {pickResult.gameResult.home_team} {pickResult.gameResult.home_score} - {pickResult.gameResult.away_score} {pickResult.gameResult.away_team}
														</div>
													{/if}
												</div>
												<div class="text-right ml-4">
													{#if pickResult.result === 'win'}
														<div class="text-sm font-bold text-green-400">✓ WIN</div>
													{:else if pickResult.result === 'loss'}
														<div class="text-sm font-bold text-red-400">✗ LOSS</div>
													{:else if pickResult.result === 'skip'}
														<div class="text-sm text-yellow-400">SKIPPED</div>
													{:else}
														<div class="text-sm text-gray-400">PENDING</div>
													{/if}
													{#if pickResult.gameResult}
														<div class="text-xs text-gray-500">
															Winner: {pickResult.gameResult.winner}
														</div>
													{:else if pickResult.result === 'pending'}
														<div class="text-xs text-gray-500">Game not finished</div>
													{/if}
												</div>
											</div>
										{/each}
									{/if}
								</div>
							{/if}
						</div>

						<!-- All Users Leaderboard -->
						<div class="bg-gray-700 rounded-lg p-6">
							<h2 class="text-xl font-semibold mb-4">Leaderboard</h2>
							<div class="space-y-3">
								{#each Object.entries(allUserResults)
									.map(([username, votes]) => ({
										username,
										votes,
										stats: calculateUserStats(votes)
									}))
									.sort((a, b) => {
										// Sort by win percentage (descending), then by total wins (descending)
										const winPercentageDiff = parseFloat(b.stats.winPercentage) - parseFloat(a.stats.winPercentage);
										if (winPercentageDiff !== 0) return winPercentageDiff;
										return b.stats.wins - a.stats.wins;
									}) as user, index}
									<div class="bg-gray-600 rounded-lg p-4">
										<div class="flex justify-between items-center mb-2">
											<div class="flex items-center space-x-3">
												<div class="text-lg font-bold text-gray-300">#{index + 1}</div>
												<div>
													<div class="font-medium">{user.username}</div>
													<div class="text-sm text-gray-300">{user.stats.totalPicks} picks made</div>
												</div>
											</div>
											<div class="text-right">
												<div class="text-lg font-bold text-yellow-400">{user.stats.winPercentage}%</div>
												<div class="text-sm text-gray-300">{user.stats.wins}W-{user.stats.losses}L</div>
											</div>
										</div>
										{#if user.stats.pending > 0}
											<div class="text-xs text-gray-400">
												{user.stats.pending} games pending
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- Information about game results -->
					<div class="mt-6 bg-blue-900 border border-blue-700 rounded-lg p-4">
						<div class="flex">
							<div class="flex-shrink-0">
								<svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
								</svg>
							</div>
							<div class="ml-3">
								<h3 class="text-sm font-medium text-blue-200">Results Tracking Active</h3>
								<div class="mt-2 text-sm text-blue-100">
									<p>Results are calculated when game outcomes are available. Games without results will show as "PENDING" until scores are entered into the system.</p>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if showModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-10 md:px-0">
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
