<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { fade, fly } from 'svelte/transition';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import { getCurrentUser, type AppUser } from '$lib/auth';
	import { getNFLWeek } from '$lib/nfl';
	import { formatAmerican, impliedProbability, profitOnHundred } from '$lib/odds';

	let user: AppUser | null = $state(null);
	let matchups: any[] = $state([]);
	let isLoading: boolean = $state(false);
	let isInitialLoading: boolean = $state(true);
	let showAuthForm: boolean = $state(true);
	let showModal: boolean = $state(false);
	let modalMessage: string = $state('');
	let realtimeSubscription: any;
	let userVotes: { [key: string]: string } = $state({});
	let showShareModal: boolean = $state(false);
	let showShareOptionsModal: boolean = $state(false);

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
		try {
			user = await getCurrentUser();
			if (user) {
				showAuthForm = false;
				await loadMatchups();
				await loadUserVotes();
				subscribeToVotes();
			}
		} catch (error) {
			console.error('Error during initial load:', error);
		} finally {
			isInitialLoading = false;
		}
	});

	function showModalMessage(message: string) {
		modalMessage = message;
		showModal = true;
	}

	async function signInWithGoogle() {
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${window.location.origin}/auth/callback` }
		});
		// On success the browser is redirected to Google; only errors return here.
		if (error) showModalMessage(`Google sign-in error: ${error.message}`);
	}

	async function signOut() {
		await supabase.auth.signOut();
		user = null;
		matchups = [];
		showAuthForm = true;
	}

	let matchupsByWeek: { [week: string]: any[] } = $state({});

	async function loadMatchups() {
		try {
			const response = await fetch('/api/nfl-matchups');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();

			// Get current NFL week and next week first
			const currentWeek = getNFLWeek();
			const nextWeek = currentWeek + 1;

			// Pre-filter matchups to current/next week before processing
			const relevantMatchups = data.filter(matchup => {
				const gameDate = new Date(matchup.commence_time);
				const nflWeek = getNFLWeek(gameDate);
				return nflWeek === currentWeek || nflWeek === nextWeek;
			});

			// Get all matchup IDs for batch vote fetching
			const matchupIds = relevantMatchups.map(matchup => matchup.id);
			
			// Batch fetch votes for only relevant matchups
			const allVotes = await getVotesForMatchups(matchupIds);

			const processedMatchups = relevantMatchups.map((matchup) => {
				const votes = allVotes.filter(vote => vote.matchup_id === matchup.id);
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
						// Prefer FanDuel as the displayed book (odds[0]); fall back to the rest.
						.sort((a, b) => (b.title === 'FanDuel' ? 1 : 0) - (a.title === 'FanDuel' ? 1 : 0))
						.map((bookmaker) => ({
							name: bookmaker.title,
							odds: bookmaker.markets.reduce((acc, market) => {
								acc[market.key] = market.outcomes;
								return acc;
							}, {})
						}))
				};
			});

			// Group processed matchups by NFL week
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

	async function getVotesForMatchups(matchupIds: string[]) {
		if (matchupIds.length === 0) return [];
		
		const { data, error } = await supabase
			.from('votes')
			.select('*')
			.in('matchup_id', matchupIds);
		
		if (error) {
			console.error('Error fetching votes for multiple matchups:', error);
			return [];
		}
		return data || [];
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
			return `${odds.h2h[0].name}: ${formatAmerican(odds.h2h[0].price)} | ${odds.h2h[1].name}: ${formatAmerican(odds.h2h[1].price)}`;
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

	function openShareOptionsModal() {
		showShareOptionsModal = true;
	}

	function closeShareOptionsModal() {
		showShareOptionsModal = false;
	}

	function openShareModal(weekType: 'current' | 'next') {
		showShareOptionsModal = false;
		
		// Filter matchups by the selected week
		const currentWeek = getNFLWeek();
		const targetWeek = weekType === 'current' ? currentWeek : currentWeek + 1;
		
		// Filter matchupsByWeek to only include the selected week
		const filteredMatchupsByWeek: { [week: string]: any[] } = {};
		Object.entries(matchupsByWeek).forEach(([weekKey, matchups]) => {
			const weekNumber = parseInt(weekKey.replace('Week ', ''));
			if (weekNumber === targetWeek) {
				filteredMatchupsByWeek[weekKey] = matchups;
			}
		});
		
		// Update the global matchupsByWeek temporarily for the share modal
		const originalMatchupsByWeek = { ...matchupsByWeek };
		matchupsByWeek = filteredMatchupsByWeek;
		
		showShareModal = true;
		
		// Restore original matchups when modal closes
		setTimeout(() => {
			if (!showShareModal) {
				matchupsByWeek = originalMatchupsByWeek;
			}
		}, 100);
	}

	function closeShareModal() {
		showShareModal = false;
		// Small delay to allow modal animation to complete before restoring data
		setTimeout(() => {
			if (!showShareModal) {
				loadMatchups(); // Reload to restore all weeks
			}
		}, 300);
	}
</script>

<main class="min-h-screen text-ink">
	{#if isInitialLoading}
		<div class="flex items-center justify-center min-h-screen" transition:fade>
			<div class="text-center">
				<div class="animate-spin rounded-full h-12 w-12 border-2 border-white/20 border-t-white mx-auto mb-5"></div>
				<h2 class="text-sm font-medium uppercase tracking-[0.3em] text-muted">Loading</h2>
			</div>
		</div>
	{:else if showAuthForm}
		<section class="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
			<div class="pointer-events-none absolute inset-0">
				<div class="absolute left-1/2 top-[-20%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-white/[0.07] blur-[120px] animate-glow-pulse"></div>
			</div>
			<div class="relative z-10 w-full max-w-md text-center" in:fade={{ duration: 400 }}>
				<p class="mb-4 text-xs font-medium uppercase tracking-[0.4em] text-muted" in:fly={{ y: 12, duration: 600, delay: 100 }}>
					The group is watching
				</p>
				<h1
					class="mb-4 text-6xl font-black uppercase leading-[0.9] tracking-tightest sm:text-7xl"
					in:fly={{ y: 24, duration: 700, delay: 150 }}
				>
					Mandem<br />Picks
				</h1>
				<p class="mb-10 text-base text-muted" in:fly={{ y: 16, duration: 700, delay: 300 }}>
					Pick the games. Settle the debate.
				</p>

				<div class="rounded-2xl border border-hairline bg-surface/70 p-6 backdrop-blur-xl shadow-card sm:p-8" in:fly={{ y: 24, duration: 700, delay: 400 }}>
					<button
						onclick={signInWithGoogle}
						disabled={isLoading}
						class="flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition-all hover:-translate-y-0.5 hover:bg-white/90 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40 disabled:active:scale-100"
					>
						<svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
							<path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z" />
							<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.94H1.3v3.09A11.99 11.99 0 0 0 12 24z" />
							<path fill="#FBBC05" d="M5.31 14.31A7.16 7.16 0 0 1 4.93 12c0-.8.14-1.58.38-2.31V6.6H1.3A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.3 5.4l4.01-3.09z" />
							<path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.3 6.6l4.01 3.09C6.25 6.85 8.89 4.75 12 4.75z" />
						</svg>
						Continue with Google
					</button>
					<p class="mt-4 text-center text-xs text-muted">Sign in with your Google account to make your picks.</p>
				</div>
			</div>
		</section>
	{:else}
		<Nav subtitle="Welcome, {user?.username}">
			<Button variant="ghost" size="sm" href="/results">Results</Button>
			{#if user?.isAdmin}
				<Button variant="ghost" size="sm" href="/admin">Admin</Button>
			{/if}
			<Button variant="ghost" size="sm" onclick={openShareOptionsModal}>Share</Button>
			<Button variant="danger" size="sm" onclick={signOut}>Sign Out</Button>
		</Nav>

		<div class="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6">
			<header class="mb-10">
				<p class="text-xs font-medium uppercase tracking-[0.3em] text-muted">2025 Season</p>
				<h1 class="mt-2 text-4xl font-black uppercase tracking-tightest sm:text-5xl">NFL Matchups</h1>
			</header>

			{#each Object.entries(matchupsByWeek) as [week, matchups]}
				<div class="mb-14">
					<div class="mb-6 flex items-center gap-4">
						<h3 class="text-lg font-bold uppercase tracking-tight">{week}</h3>
						<div class="h-px flex-grow bg-hairline"></div>
						<span class="text-xs text-muted">{matchups.length} games</span>
					</div>

					<div class="space-y-5">
						{#each matchups as matchup (matchup.id)}
							{@const totalVotes = matchup.home_votes + matchup.away_votes + (matchup.skip_votes || 0)}
							<Card padding="p-5 sm:p-6" hover>
								<div class="mb-4 flex items-start justify-between gap-4">
									<div>
										<h4 class="text-xl font-bold tracking-tight">
											{matchup.away_team} <span class="text-muted font-normal">@</span> {matchup.home_team}
										</h4>
										<p class="mt-1 text-xs uppercase tracking-wide text-muted">
											{new Date(matchup.commence_time).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
										</p>
									</div>
								</div>

								{#if matchup.odds && matchup.odds.length > 0 && matchup.odds[0].odds.h2h && matchup.odds[0].odds.h2h.length >= 2}
									{@const firstBookmaker = matchup.odds[0]}
									{@const homeOdds = firstBookmaker.odds.h2h.find(team => team.name === matchup.home_team)?.price || 'N/A'}
									{@const awayOdds = firstBookmaker.odds.h2h.find(team => team.name === matchup.away_team)?.price || 'N/A'}
									{@const favoriteTeam = homeOdds !== 'N/A' && awayOdds !== 'N/A' && parseFloat(homeOdds) < parseFloat(awayOdds) ? matchup.home_team : matchup.away_team}
									{@const favoriteOdds = favoriteTeam === matchup.home_team ? homeOdds : awayOdds}
									{@const underdogTeam = favoriteTeam === matchup.home_team ? matchup.away_team : matchup.home_team}
									{@const underdogOdds = favoriteTeam === matchup.home_team ? awayOdds : homeOdds}

									{#if homeOdds !== 'N/A' && awayOdds !== 'N/A'}
										<div class="mb-4 grid grid-cols-2 gap-3">
											<div class="rounded-xl border border-hairline bg-surface-2/60 p-3">
												<p class="text-[10px] uppercase tracking-wider text-muted">Favorite</p>
												<p class="mt-1 text-sm font-semibold">{favoriteTeam}</p>
												<p class="text-2xl font-bold tracking-tight">
													{formatAmerican(favoriteOdds)}
													<span class="ml-1 text-xs font-medium text-muted">· {impliedProbability(favoriteOdds)}</span>
												</p>
											</div>
											<div class="rounded-xl border border-hairline bg-surface-2/60 p-3">
												<p class="text-[10px] uppercase tracking-wider text-muted">Underdog</p>
												<p class="mt-1 text-sm font-semibold">{underdogTeam}</p>
												<p class="text-2xl font-bold tracking-tight">
													{formatAmerican(underdogOdds)}
													<span class="ml-1 text-xs font-medium text-muted">· {impliedProbability(underdogOdds)}</span>
												</p>
											</div>
										</div>
										<details class="group mb-4">
											<summary class="cursor-pointer list-none text-xs text-muted transition-colors hover:text-ink">
												<span class="underline decoration-hairline underline-offset-4">How to read these odds</span>
											</summary>
											<div class="mt-2 space-y-1 rounded-xl border border-hairline bg-surface-2/40 p-3 text-xs text-muted">
												<p>American odds. Minus (−) = the favorite: bet that much to win $100. Plus (+) = the underdog: win that much on a $100 bet.</p>
												<p>Example: $100 on {underdogTeam} ({formatAmerican(underdogOdds)}) wins ${profitOnHundred(underdogOdds)}.</p>
												<p class="pt-1 text-[11px]">Books: {matchup.odds.map((b) => `${b.name} (${getOddsDisplay(b.odds)})`).join(' · ')}</p>
											</div>
										</details>
									{/if}
								{/if}

								<div class="grid grid-cols-3 gap-2">
									<Button variant="vote" accent="win" active={userVotes[matchup.id] === 'away'} disabled={isLoading} fullWidth
										onclick={() => submitVote(matchup.id, 'away', `${matchup.away_team} vs ${matchup.home_team}`)}>
										{matchup.away_team.split(' ').slice(-1)[0]}
									</Button>
									<Button variant="vote" accent="win" active={userVotes[matchup.id] === 'home'} disabled={isLoading} fullWidth
										onclick={() => submitVote(matchup.id, 'home', `${matchup.away_team} vs ${matchup.home_team}`)}>
										{matchup.home_team.split(' ').slice(-1)[0]}
									</Button>
									<Button variant="vote" accent="skip" active={userVotes[matchup.id] === 'skip'} disabled={isLoading} fullWidth
										onclick={() => submitVote(matchup.id, 'skip', `${matchup.away_team} vs ${matchup.home_team}`)}>
										Skip
									</Button>
								</div>

								{#if totalVotes > 0}
									<div class="mt-4">
										<div class="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
											<div class="bg-win" style="width: {(matchup.away_votes / totalVotes) * 100}%"></div>
											<div class="bg-ink" style="width: {(matchup.home_votes / totalVotes) * 100}%"></div>
											<div class="bg-skip" style="width: {((matchup.skip_votes || 0) / totalVotes) * 100}%"></div>
										</div>
										<div class="mt-2 flex justify-between text-xs text-muted">
											<span>{matchup.away_team.split(' ').slice(-1)[0]} {matchup.away_votes}</span>
											<span>{matchup.home_team.split(' ').slice(-1)[0]} {matchup.home_votes}</span>
											<span>Skip {matchup.skip_votes || 0}</span>
										</div>
									</div>
								{/if}
							</Card>
						{/each}
					</div>
				</div>
			{/each}
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

	{#if showShareOptionsModal}
		<Modal title="Share Results" onclose={closeShareOptionsModal}>
			<p class="mb-5 text-sm text-muted">Choose which week's picks you want to share.</p>
			<div class="space-y-3">
				<button
					onclick={() => openShareModal('current')}
					class="w-full rounded-xl border border-hairline bg-surface-2/60 p-4 text-left transition-all hover:border-white/30 hover:bg-white/[0.06]"
				>
					<div class="font-semibold">Current Week</div>
					<div class="text-sm text-muted">Share this week's most voted picks</div>
				</button>
				<button
					onclick={() => openShareModal('next')}
					class="w-full rounded-xl border border-hairline bg-surface-2/60 p-4 text-left transition-all hover:border-white/30 hover:bg-white/[0.06]"
				>
					<div class="font-semibold">Next Week</div>
					<div class="text-sm text-muted">Share next week's most voted picks</div>
				</button>
			</div>
			{#snippet footer()}
				<Button variant="ghost" fullWidth onclick={closeShareOptionsModal}>Cancel</Button>
			{/snippet}
		</Modal>
	{/if}

	{#if showShareModal}
		<Modal title="Most Voted Teams" size="lg" onclose={closeShareModal}>
			<div class="space-y-5">
				{#each Object.entries(matchupsByWeek) as [week, matchups]}
					<div>
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{week}</h3>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{#each matchups as matchup (matchup.id)}
								{@const mostVoted = getMostVotedOption(matchup)}
								<div class="flex flex-col items-center gap-2 rounded-xl border border-hairline bg-surface-2/60 p-3">
									<h4 class="text-center text-xs font-medium text-muted">
										{matchup.away_team.split(' ').slice(-1)[0]} @ {matchup.home_team.split(' ').slice(-1)[0]}
									</h4>
									<div
										class="w-full rounded-lg py-1.5 text-center text-sm font-semibold"
										class:bg-win={mostVoted.option !== 'skip'}
										class:text-black={mostVoted.option !== 'skip'}
										class:bg-skip={mostVoted.option === 'skip'}
									>
										{#if mostVoted.option === 'skip'}Skip{:else}{mostVoted.team.split(' ').slice(-1)[0]}{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			{#snippet footer()}
				<Button variant="primary" fullWidth onclick={closeShareModal}>Close</Button>
			{/snippet}
		</Modal>
	{/if}
</main>
