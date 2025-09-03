<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { fade } from 'svelte/transition';

	let user: any = null;
	let matchups: any[] = [];
	let gameResults: any[] = [];
	let isLoading: boolean = false;
	let isInitialLoading: boolean = true;
	let showModal: boolean = false;
	let modalMessage: string = '';
	
	let selectedMatchup: any = null;
	let homeScore: number | null = null;
	let awayScore: number | null = null;

	function showModalMessage(message: string) {
		modalMessage = message;
		showModal = true;
	}

	function getNFLWeek(date: Date = new Date()): number {
		const kickoff = new Date(2025, 8, 4); // September 4, 2025

		// If the date is before the season starts, return week 1
		if (date < kickoff) {
			return 1;
		}

		const daysSinceKickoff = Math.floor(
			(date.getTime() - kickoff.getTime()) / (1000 * 60 * 60 * 24)
		);
		const weeksSinceKickoff = Math.floor(daysSinceKickoff / 7);

		// Week 1 starts on kickoff day, so add 1 to make it 1-indexed
		return weeksSinceKickoff + 1;
	}

	onMount(async () => {
		try {
			const storedUser = localStorage.getItem('user');
			if (storedUser) {
				user = JSON.parse(storedUser);
				
				// Check if user is authorized for admin access
				if (user.username !== 'nico') {
					showModalMessage('Access denied. Admin panel is restricted to authorized users only.');
					user = null;
					return;
				}
				
				await loadData();
			} else {
				showModalMessage('Please sign in to access admin panel.');
			}
		} catch (error) {
			console.error('Error during initial load:', error);
		} finally {
			isInitialLoading = false;
		}
	});

	async function loadData() {
		if (!user) return;
		
		isLoading = true;
		try {
			await loadMatchups();
			await loadGameResults();
		} catch (error) {
			console.error('Error loading data:', error);
			showModalMessage('Error loading data: ' + error.message);
		} finally {
			isLoading = false;
		}
	}

	async function loadMatchups() {
		try {
			const response = await fetch('/api/nfl-matchups');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			
			// Get current NFL week and last week
			const currentWeek = getNFLWeek();
			const lastWeek = Math.max(1, currentWeek - 1);
			
			// Filter to only show current week and last week
			const filteredMatchups = data.filter(matchup => {
				const gameDate = new Date(matchup.commence_time);
				const nflWeek = getNFLWeek(gameDate);
				return nflWeek === currentWeek || nflWeek === lastWeek;
			});
			
			matchups = filteredMatchups || [];
		} catch (error) {
			console.error('Error loading matchups:', error);
			matchups = [];
		}
	}

	async function loadGameResults() {
		try {
			const response = await fetch('/api/game-results');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			gameResults = data || [];
		} catch (error) {
			console.error('Error loading game results:', error);
			gameResults = [];
		}
	}

	async function submitResult() {
		if (!selectedMatchup || homeScore === null || awayScore === null) {
			showModalMessage('Please select a matchup and enter both scores.');
			return;
		}

		if (homeScore < 0 || awayScore < 0) {
			showModalMessage('Scores cannot be negative.');
			return;
		}

		const winner = homeScore > awayScore ? selectedMatchup.home_team : selectedMatchup.away_team;

		isLoading = true;
		try {
			const response = await fetch('/api/game-results', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					matchup_id: selectedMatchup.id,
					home_team: selectedMatchup.home_team,
					away_team: selectedMatchup.away_team,
					home_score: homeScore,
					away_score: awayScore,
					winner: winner,
					game_date: selectedMatchup.commence_time
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			showModalMessage('Game result saved successfully!');
			
			selectedMatchup = null;
			homeScore = null;
			awayScore = null;
			
			await loadGameResults();
		} catch (error) {
			console.error('Error saving result:', error);
			showModalMessage('Error saving result: ' + error.message);
		} finally {
			isLoading = false;
		}
	}

	function hasResult(matchupId: string): boolean {
		return gameResults.some(result => result.matchup_id === matchupId);
	}

	function getResult(matchupId: string) {
		return gameResults.find(result => result.matchup_id === matchupId);
	}

	function signOut() {
		user = null;
		matchups = [];
		gameResults = [];
		localStorage.removeItem('user');
		window.location.href = '/';
	}
</script>

<main class="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6">
	{#if isInitialLoading}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="text-center">
				<div class="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
				<h2 class="text-xl font-semibold text-gray-300">Loading Admin Panel...</h2>
				<p class="text-gray-400 mt-2">Verifying access permissions</p>
			</div>
		</div>
	{:else if !user}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="w-full max-w-md bg-gray-800 rounded-lg shadow-xl p-6 sm:p-8 text-center">
				<h1 class="text-2xl font-bold mb-6">Admin Panel</h1>
				<div class="mb-6">
					<svg class="h-16 w-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
					</svg>
					<p class="text-gray-300">Access Restricted</p>
					<p class="text-sm text-gray-400 mt-2">This admin panel is only available to authorized administrators.</p>
				</div>
				<a
					href="/"
					class="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors inline-block"
				>
					Back to Home
				</a>
			</div>
		</div>
	{:else}
		<div class="max-w-6xl mx-auto">
			<div class="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 mb-6">
				<div class="flex flex-col sm:flex-row justify-between items-center mb-6">
					<h1 class="text-2xl font-bold mb-4 sm:mb-0">Admin Panel - Game Results</h1>
					<div class="flex space-x-2">
						<a
							href="/"
							class="bg-gray-600 text-white rounded-md px-4 py-2 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors"
						>
							Back to Picks
						</a>
						<a
							href="/results"
							class="bg-green-600 text-white rounded-md px-4 py-2 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
						>
							View Results
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
						<p class="mt-4 text-gray-300">Loading...</p>
					</div>
				{:else}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Enter New Result -->
						<div class="bg-gray-700 rounded-lg p-6">
							<h2 class="text-xl font-semibold mb-4">Enter Game Result</h2>
							<p class="text-sm text-gray-400 mb-4">
								Showing games from current week and last week only
							</p>
							
							<div class="space-y-4">
								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Select Game</label>
									<select
										bind:value={selectedMatchup}
										class="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
									>
										<option value={null}>Choose a game...</option>
										{#each matchups.filter(m => !hasResult(m.id)) as matchup}
											{@const gameWeek = getNFLWeek(new Date(matchup.commence_time))}
											<option value={matchup}>
												Week {gameWeek}: {matchup.away_team} @ {matchup.home_team} - {new Date(matchup.commence_time).toLocaleDateString()}
											</option>
										{/each}
									</select>
								</div>

								{#if selectedMatchup}
									<div class="bg-gray-600 rounded-lg p-4">
										<h3 class="font-medium mb-3">{selectedMatchup.away_team} @ {selectedMatchup.home_team}</h3>
										<div class="grid grid-cols-2 gap-4">
											<div>
												<label class="block text-sm font-medium text-gray-300 mb-2">
													{selectedMatchup.home_team} Score
												</label>
												<input
													type="number"
													bind:value={homeScore}
													min="0"
													class="w-full px-3 py-2 bg-gray-700 border border-gray-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
													placeholder="0"
												/>
											</div>
											<div>
												<label class="block text-sm font-medium text-gray-300 mb-2">
													{selectedMatchup.away_team} Score
												</label>
												<input
													type="number"
													bind:value={awayScore}
													min="0"
													class="w-full px-3 py-2 bg-gray-700 border border-gray-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
													placeholder="0"
												/>
											</div>
										</div>
										
										{#if homeScore !== null && awayScore !== null}
											<div class="mt-4 p-3 bg-gray-800 rounded-lg">
												<p class="text-sm text-gray-300">Winner: 
													<span class="font-bold text-yellow-400">
														{homeScore > awayScore ? selectedMatchup.home_team : selectedMatchup.away_team}
													</span>
												</p>
											</div>
										{/if}
										
										<button
											on:click={submitResult}
											disabled={homeScore === null || awayScore === null || isLoading}
											class="w-full mt-4 bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isLoading ? 'Saving...' : 'Save Result'}
										</button>
									</div>
								{/if}
							</div>
						</div>

						<!-- Existing Results -->
						<div class="bg-gray-700 rounded-lg p-6">
							<h2 class="text-xl font-semibold mb-4">Saved Results</h2>
							<div class="space-y-3 max-h-96 overflow-y-auto">
								{#if gameResults.length === 0}
									<p class="text-gray-400 text-center py-4">No results entered yet.</p>
								{:else}
									{#each gameResults.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()) as result}
										<div class="bg-gray-600 rounded-lg p-4">
											<div class="flex justify-between items-center">
												<div>
													<div class="font-medium">{result.away_team} @ {result.home_team}</div>
													<div class="text-sm text-gray-300">
														Final: {result.away_team} {result.away_score} - {result.home_score} {result.home_team}
													</div>
													<div class="text-xs text-gray-400 mt-1">
														Winner: <span class="text-yellow-400">{result.winner}</span>
													</div>
												</div>
												<div class="text-right">
													<div class="text-sm text-gray-400">
														{new Date(result.game_date).toLocaleDateString()}
													</div>
												</div>
											</div>
										</div>
									{/each}
								{/if}
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
