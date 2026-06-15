<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { getGameResults } from '$lib/api';
	import { getCurrentUser, type AppUser } from '$lib/auth';
	import { getNFLWeek } from '$lib/nfl';
	import { fade } from 'svelte/transition';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Nav from '$lib/components/Nav.svelte';

	let user: AppUser | null = $state(null);
	let matchups: any[] = $state([]);
	let gameResults: any[] = $state([]);
	let isLoading: boolean = $state(false);
	let isInitialLoading: boolean = $state(true);
	let showModal: boolean = $state(false);
	let modalMessage: string = $state('');

	let selectedMatchup: any = $state(null);
	let homeScore: number | null = $state(null);
	let awayScore: number | null = $state(null);

	function showModalMessage(message: string) {
		modalMessage = message;
		showModal = true;
	}

	onMount(async () => {
		try {
			user = await getCurrentUser();
			if (user) {
				// Check if user is authorized for admin access
				if (!user.isAdmin) {
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
			gameResults = await getGameResults();
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
			const { error } = await supabase.from('game_results').upsert({
				matchup_id: selectedMatchup.id,
				home_team: selectedMatchup.home_team,
				away_team: selectedMatchup.away_team,
				home_score: homeScore,
				away_score: awayScore,
				winner: winner,
				game_date: selectedMatchup.commence_time
			});

			if (error) throw error;

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

	async function signOut() {
		await supabase.auth.signOut();
		user = null;
		matchups = [];
		gameResults = [];
		window.location.href = '/';
	}
</script>

<main class="min-h-screen text-ink">
	{#if isInitialLoading}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="text-center">
				<div class="animate-spin rounded-full h-12 w-12 border-2 border-white/20 border-t-white mx-auto mb-5"></div>
				<h2 class="text-sm font-medium uppercase tracking-[0.3em] text-muted">Verifying Access</h2>
			</div>
		</div>
	{:else if !user}
		<div class="flex items-center justify-center min-h-screen px-4" transition:fade>
			<Card class="w-full max-w-md text-center">
				<h1 class="mb-3 text-3xl font-black uppercase tracking-tightest">Restricted</h1>
				<p class="mb-6 text-sm text-muted">This admin panel is only available to authorized administrators.</p>
				<Button variant="primary" href="/">Back to Home</Button>
			</Card>
		</div>
	{:else}
		<Nav title="ADMIN" subtitle="Game results">
			<Button variant="ghost" size="sm" href="/">Picks</Button>
			<Button variant="ghost" size="sm" href="/results">Results</Button>
			<Button variant="danger" size="sm" onclick={signOut}>Sign Out</Button>
		</Nav>

		<div class="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
			{#if isLoading}
				<div class="py-16 text-center">
					<div class="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-white mx-auto"></div>
					<p class="mt-4 text-sm text-muted">Loading...</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<!-- Enter New Result -->
					<Card animate>
						<h2 class="mb-1 text-xl font-bold tracking-tight">Enter Game Result</h2>
						<p class="mb-5 text-sm text-muted">Current week and last week only.</p>

						<div class="space-y-4">
							<div>
								<label for="select-game" class="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">Select Game</label>
								<select id="select-game" bind:value={selectedMatchup} class="input-field">
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
								<div class="rounded-xl border border-hairline bg-surface-2/50 p-4">
									<h3 class="mb-3 font-semibold">{selectedMatchup.away_team} @ {selectedMatchup.home_team}</h3>
									<div class="grid grid-cols-2 gap-4">
										<div>
											<label for="home-score" class="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">{selectedMatchup.home_team}</label>
											<input id="home-score" type="number" bind:value={homeScore} min="0" class="input-field" placeholder="0" />
										</div>
										<div>
											<label for="away-score" class="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">{selectedMatchup.away_team}</label>
											<input id="away-score" type="number" bind:value={awayScore} min="0" class="input-field" placeholder="0" />
										</div>
									</div>

									{#if homeScore !== null && awayScore !== null}
										<div class="mt-4 rounded-xl border border-white/15 bg-white/[0.05] p-3">
											<p class="text-sm text-muted">Winner:
												<span class="font-bold text-ink">
													{homeScore > awayScore ? selectedMatchup.home_team : selectedMatchup.away_team}
												</span>
											</p>
										</div>
									{/if}

									<div class="mt-4">
										<Button variant="primary" fullWidth loading={isLoading}
											disabled={homeScore === null || awayScore === null || isLoading}
											onclick={submitResult}>
											{isLoading ? 'Saving...' : 'Save Result'}
										</Button>
									</div>
								</div>
							{/if}
						</div>
					</Card>

					<!-- Existing Results -->
					<Card animate delay={80}>
						<h2 class="mb-5 text-xl font-bold tracking-tight">Saved Results</h2>
						<div class="max-h-96 space-y-2 overflow-y-auto pr-1">
							{#if gameResults.length === 0}
								<p class="py-6 text-center text-muted">No results entered yet.</p>
							{:else}
								{#each gameResults.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()) as result}
									<div class="flex items-start justify-between gap-4 rounded-xl border border-hairline bg-surface-2/40 p-4">
										<div class="min-w-0">
											<div class="truncate font-medium">{result.away_team} @ {result.home_team}</div>
											<div class="text-sm text-muted">
												Final: {result.away_team} {result.away_score} - {result.home_score} {result.home_team}
											</div>
											<div class="mt-1 text-xs text-muted/80">Winner: <span class="text-ink">{result.winner}</span></div>
										</div>
										<div class="flex-shrink-0 text-right text-xs text-muted">
											{new Date(result.game_date).toLocaleDateString()}
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</Card>
				</div>
			{/if}
		</div>
	{/if}

	{#if showModal}
		<Modal title="Message" onclose={() => (showModal = false)}>
			<p class="text-muted">{modalMessage}</p>
			{#snippet footer()}
				<Button variant="primary" fullWidth onclick={() => (showModal = false)}>Close</Button>
			{/snippet}
		</Modal>
	{/if}
</main>
