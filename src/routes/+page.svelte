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

	onMount(async () => {
		const {
			data: { user: currentUser }
		} = await supabase.auth.getUser();
		if (currentUser) {
			user = currentUser;
			showAuthForm = false;
			await loadMatchups();
		}
	});

	async function handleAuth(isSignUp: boolean) {
		if (!allowedNames.includes(name)) {
			alert(`Unauthorized name. Allowed names are: ${allowedNames.join(', ')}`);
			return;
		}

		isLoading = true;
		const username = name.replace(/\s+/g, '').toLowerCase();
		const password = `${favoriteColor}${favoriteAnimal}`;

		console.log(username, password);

		try {
			if (isSignUp) {
				// Check if the username already exists
				const { data: existingUser, error: checkError } = await supabase
					.from('users')
					.select('id')
					.eq('username', username)
					.single();

				if (checkError && checkError.code !== 'PGRST116') {
					throw checkError;
				}

				if (existingUser) {
					alert('Username already exists. Please choose another.');
					isLoading = false;
					return;
				}

				// Insert new user
				const { error: insertError } = await supabase
					.from('users')
					.insert([{ username, password }]);

				if (insertError) {
					throw insertError;
				}

				alert('Sign up successful! Please sign in.');
			} else {
				// Authenticate user
				const { data: authUser, error: authError } = await supabase
					.from('users')
					.select('id, password')
					.eq('username', username)
					.single();

				if (authError) {
					throw authError;
				}

				if (authUser.password !== password) {
					alert('Incorrect password.');
					isLoading = false;
					return;
				}

				user = authUser;
				showAuthForm = false;
				await loadMatchups();
			}
		} catch (error) {
			console.error('Auth Error:', error);
			alert(`Error ${isSignUp ? 'signing up' : 'signing in'}: ${error.message}`);
		} finally {
			isLoading = false;
		}
	}

	async function signOut() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			alert('Error signing out: ' + error.message);
		} else {
			user = null;
			matchups = [];
			showAuthForm = true;
		}
	}

	async function loadMatchups() {
		const { data, error } = await supabase
			.from('matchups')
			.select('*')
			.order('commence_time', { ascending: true });

		if (error) {
			alert('Error loading matchups: ' + error.message);
		} else {
			matchups = data;
		}
	}

	async function submitVote(matchupId: string, vote: string) {
		isLoading = true;
		const { data, error } = await supabase
			.from('votes')
			.insert([{ matchup_id: matchupId, user_id: user.id, vote }])
			.select();

		if (error) {
			if (error.code === '23505') {
				alert('You have already voted for this matchup.');
			} else {
				alert('Error submitting vote: ' + error.message);
			}
		} else {
			await loadMatchups();
		}
		isLoading = false;
	}
</script>

<main class="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
	{#if showAuthForm}
		<div class="relative py-3 sm:max-w-xl sm:mx-auto" transition:fade>
			<div
				class="absolute inset-0 bg-gradient-to-r from-blue-300 to-blue-600 shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-6 sm:rounded-3xl"
			></div>
			<div class="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
				<div class="max-w-md mx-auto">
					<div>
						<h1 class="text-2xl font-semibold">Welcome to NFL Voting</h1>
					</div>
					<div class="divide-y divide-gray-200">
						<div class="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
							<div class="relative">
								<input
									bind:value={name}
									placeholder="First Name"
									class="peer placeholder-transparent h-10 w-full border-b-2 border-gray-300 text-gray-900 focus:outline-none focus:border-blue-600"
								/>
								<label
									for="name"
									class="absolute left-0 -top-3.5 text-gray-600 text-sm peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-440 peer-placeholder-shown:top-2 transition-all peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
									>First Name</label
								>
							</div>
							<div class="relative">
								<input
									bind:value={favoriteColor}
									placeholder="Favorite Color"
									class="peer placeholder-transparent h-10 w-full border-b-2 border-gray-300 text-gray-900 focus:outline-none focus:border-blue-600"
								/>
								<label
									for="color"
									class="absolute left-0 -top-3.5 text-gray-600 text-sm peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-440 peer-placeholder-shown:top-2 transition-all peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
									>Favorite Color</label
								>
							</div>
							<div class="relative">
								<input
									bind:value={favoriteAnimal}
									placeholder="Favorite Animal"
									class="peer placeholder-transparent h-10 w-full border-b-2 border-gray-300 text-gray-900 focus:outline-none focus:border-blue-600"
								/>
								<label
									for="animal"
									class="absolute left-0 -top-3.5 text-gray-600 text-sm peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-440 peer-placeholder-shown:top-2 transition-all peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
									>Favorite Animal</label
								>
							</div>
							<div class="relative">
								<button
									on:click={() => handleAuth(true)}
									class="bg-blue-500 text-white rounded-md px-4 py-2 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-opacity-50"
									disabled={isLoading}
								>
									{isLoading ? 'Loading...' : 'Sign Up'}
								</button>
								<button
									on:click={() => handleAuth(false)}
									class="ml-2 bg-green-500 text-white rounded-md px-4 py-2 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-opacity-50"
									disabled={isLoading}
								>
									{isLoading ? 'Loading...' : 'Sign In'}
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="relative py-3 sm:max-w-xl sm:mx-auto" transition:fade>
			<div class="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
				<div class="max-w-md mx-auto">
					<div class="flex justify-between items-center mb-4">
						<h1 class="text-2xl font-semibold">Welcome, {user.user_metadata.name}!</h1>
						<button
							on:click={signOut}
							class="bg-red-500 text-white rounded-md px-4 py-2 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-opacity-50"
							>Sign Out</button
						>
					</div>
					<h2 class="text-xl font-bold mb-4">NFL Matchups</h2>
					{#if matchups.length === 0}
						<p>Loading matchups...</p>
					{:else}
						<div class="space-y-6">
							{#each matchups as matchup (matchup.id)}
								<div class="bg-gray-50 p-4 rounded-lg shadow">
									<h3 class="text-lg font-semibold mb-2">
										{matchup.home_team} vs {matchup.away_team}
									</h3>
									<p class="text-sm text-gray-600 mb-4">
										Game Date: {new Date(matchup.commence_time).toLocaleString()}
									</p>
									<div class="flex justify-between items-center">
										<div>
											<button
												on:click={() => submitVote(matchup.id, 'home')}
												class="bg-blue-500 text-white rounded-md px-4 py-2 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-opacity-50 mr-2"
												disabled={isLoading}
											>
												Vote {matchup.home_team}
											</button>
											<button
												on:click={() => submitVote(matchup.id, 'away')}
												class="bg-green-500 text-white rounded-md px-4 py-2 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-opacity-50"
												disabled={isLoading}
											>
												Vote {matchup.away_team}
											</button>
										</div>
										<div class="text-right">
											<p class="text-sm font-semibold">
												{matchup.home_team}: {matchup.home_votes || 0}
											</p>
											<p class="text-sm font-semibold">
												{matchup.away_team}: {matchup.away_votes || 0}
											</p>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</main>
