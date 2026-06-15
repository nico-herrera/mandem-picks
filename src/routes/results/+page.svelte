<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { getAllUserResults, getGameResults } from '$lib/api';
	import { fade } from 'svelte/transition';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import { getCurrentUser, type AppUser } from '$lib/auth';

	let user: AppUser | null = $state(null);
	let userResults: any[] = $state([]);
	let isLoading: boolean = $state(false);
	let isInitialLoading: boolean = $state(true);
	let allUserResults: { [username: string]: any[] } = $state({});
	let gameResults: any[] = $state([]);
	let showModal: boolean = $state(false);
	let modalMessage: string = $state('');

	function showModalMessage(message: string) {
		modalMessage = message;
		showModal = true;
	}

	onMount(async () => {
		try {
			user = await getCurrentUser();
			if (user) {
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
				const username = vote.profiles?.username;
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

	async function signOut() {
		await supabase.auth.signOut();
		user = null;
		userResults = [];
		allUserResults = {};
		window.location.href = '/';
	}
</script>

<main class="min-h-screen text-ink">
	{#if isInitialLoading}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="text-center">
				<div class="animate-spin rounded-full h-12 w-12 border-2 border-white/20 border-t-white mx-auto mb-5"></div>
				<h2 class="text-sm font-medium uppercase tracking-[0.3em] text-muted">Loading Results</h2>
			</div>
		</div>
	{:else if !user}
		<div class="flex items-center justify-center min-h-screen px-4" transition:fade>
			<Card class="w-full max-w-md text-center">
				<h1 class="mb-4 text-3xl font-black uppercase tracking-tightest">Results</h1>
				<p class="mb-6 text-muted">Please sign in to view pick results.</p>
				<Button variant="primary" href="/">Go to Home</Button>
			</Card>
		</div>
	{:else}
		<Nav title="RESULTS" subtitle="Standings & history">
			<Button variant="ghost" size="sm" href="/">Picks</Button>
			<Button variant="danger" size="sm" onclick={signOut}>Sign Out</Button>
		</Nav>

		<div class="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
			{#if isLoading}
				<div class="py-16 text-center">
					<div class="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-white mx-auto"></div>
					<p class="mt-4 text-sm text-muted">Loading results...</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<!-- Your Results -->
					<Card animate>
						<h2 class="mb-5 text-xl font-bold tracking-tight">Your Results <span class="text-muted font-normal">— {user.username}</span></h2>
						{#if userResults}
							{@const stats = calculateUserStats(userResults)}
							<div class="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
								<div class="rounded-xl border border-hairline bg-surface-2/50 p-3 text-center">
									<div class="text-2xl font-bold tracking-tight">{stats.totalPicks}</div>
									<div class="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Picks</div>
								</div>
								<div class="rounded-xl border border-hairline bg-surface-2/50 p-3 text-center">
									<div class="text-2xl font-bold tracking-tight text-win">{stats.wins}</div>
									<div class="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Wins</div>
								</div>
								<div class="rounded-xl border border-hairline bg-surface-2/50 p-3 text-center">
									<div class="text-2xl font-bold tracking-tight text-loss">{stats.losses}</div>
									<div class="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Losses</div>
								</div>
								<div class="rounded-xl border border-hairline bg-surface-2/50 p-3 text-center">
									<div class="text-2xl font-bold tracking-tight text-muted">{stats.pending}</div>
									<div class="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Pending</div>
								</div>
								<div class="col-span-3 rounded-xl border border-white/20 bg-white/[0.06] p-3 text-center sm:col-span-1">
									<div class="text-2xl font-bold tracking-tight">{stats.winPercentage}%</div>
									<div class="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Win Rate</div>
								</div>
							</div>

							<div class="max-h-96 space-y-2 overflow-y-auto pr-1">
								{#if userResults.length === 0}
									<p class="py-6 text-center text-muted">No picks made yet.</p>
								{:else}
									{#each userResults as vote}
										{@const pickResult = getPickResult(vote)}
										<div class="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface-2/40 p-3">
											<div class="min-w-0 flex-grow">
												<div class="truncate font-medium">{vote.matchup}</div>
												<div class="text-sm text-muted">Pick: {getVoteDisplayName(vote.vote, vote.matchup)}</div>
												{#if pickResult.gameResult}
													<div class="mt-0.5 text-xs text-muted/70">
														Final: {pickResult.gameResult.home_team} {pickResult.gameResult.home_score} - {pickResult.gameResult.away_score} {pickResult.gameResult.away_team}
													</div>
												{/if}
											</div>
											<div class="flex-shrink-0 text-right">
												{#if pickResult.result === 'win'}
													<div class="text-sm font-bold text-win">WIN</div>
												{:else if pickResult.result === 'loss'}
													<div class="text-sm font-bold text-loss">LOSS</div>
												{:else if pickResult.result === 'skip'}
													<div class="text-sm font-semibold text-skip">SKIP</div>
												{:else}
													<div class="text-sm text-muted">PENDING</div>
												{/if}
											</div>
										</div>
									{/each}
								{/if}
							</div>
						{/if}
					</Card>

					<!-- All Users Leaderboard -->
					<Card animate delay={80}>
						<h2 class="mb-5 text-xl font-bold tracking-tight">Leaderboard</h2>
						<div class="space-y-2">
							{#each Object.entries(allUserResults)
								.map(([username, votes]) => ({
									username,
									votes,
									stats: calculateUserStats(votes)
								}))
								.sort((a, b) => {
									const winPercentageDiff = parseFloat(b.stats.winPercentage) - parseFloat(a.stats.winPercentage);
									if (winPercentageDiff !== 0) return winPercentageDiff;
									return b.stats.wins - a.stats.wins;
								}) as user, index}
								<div class="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface-2/40 p-4 {index === 0 ? 'border-white/25 bg-white/[0.05]' : ''}">
									<div class="flex items-center gap-4">
										<div class="w-7 text-center text-lg font-bold {index === 0 ? 'text-ink' : 'text-muted'}">{index + 1}</div>
										<div>
											<div class="font-semibold">{user.username}</div>
											<div class="text-xs text-muted">{user.stats.totalPicks} picks{user.stats.pending > 0 ? ` · ${user.stats.pending} pending` : ''}</div>
										</div>
									</div>
									<div class="text-right">
										<div class="text-lg font-bold tracking-tight">{user.stats.winPercentage}%</div>
										<div class="text-xs text-muted">{user.stats.wins}W–{user.stats.losses}L</div>
									</div>
								</div>
							{/each}
						</div>
					</Card>
				</div>

				<p class="mt-6 text-center text-xs text-muted">
					Results update when game outcomes are entered. Undecided games show as PENDING.
				</p>
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
