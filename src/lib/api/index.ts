import { supabase } from '$lib/supabaseClient';
import { PUBLIC_ODDS_API_KEY } from '$env/static/public';

const apiKey = PUBLIC_ODDS_API_KEY; // Replace with your The-Odds-API key
const apiUrl = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/';

export async function getNFLMatchups() {
	const response = await fetch(`${apiUrl}?apiKey=${apiKey}&regions=us&markets=h2h`);
	if (!response.ok) {
		throw new Error('Failed to fetch NFL matchups');
	}
	return await response.json();
}

export async function submitVote(matchupId: string, userId: string, vote: string) {
	const { error } = await supabase
		.from('votes')
		.insert({ matchup_id: matchupId, user_id: userId, vote });

	if (error) {
		throw new Error('Failed to submit vote: ' + error.message);
	}
}

export async function getVotesForMatchup(matchupId: string) {
	const { data, error } = await supabase.from('votes').select('*').eq('matchup_id', matchupId);

	if (error) {
		throw new Error('Failed to fetch votes: ' + error.message);
	}
	return data;
}

export async function getGameResults() {
	const { data, error } = await supabase
		.from('game_results')
		.select('*')
		.order('game_date', { ascending: false });

	if (error) {
		throw new Error('Failed to fetch game results: ' + error.message);
	}
	return data || [];
}

export async function getUserResults(userId: string) {
	const { data, error } = await supabase
		.from('votes')
		.select(
			`
			*,
			game_results!inner(*)
		`
		)
		.eq('user_id', userId);

	if (error) {
		throw new Error('Failed to fetch user results: ' + error.message);
	}
	return data || [];
}

export async function getAllUserResults() {
	const { data, error } = await supabase.from('votes').select(`
			*,
			users!inner(username),
			game_results(*)
		`);

	if (error) {
		throw new Error('Failed to fetch all user results: ' + error.message);
	}
	return data || [];
}
