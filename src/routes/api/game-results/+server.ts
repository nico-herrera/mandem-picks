import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET() {
	try {
		const { data, error } = await supabase
			.from('game_results')
			.select('*')
			.order('game_date', { ascending: false });

		if (error) throw error;

		return json(data || []);
	} catch (error) {
		console.error('Error fetching game results:', error);
		return json({ error: 'Failed to fetch game results' }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { matchup_id, home_team, away_team, home_score, away_score, winner, game_date } = body;

		if (
			!matchup_id ||
			!home_team ||
			!away_team ||
			home_score === undefined ||
			away_score === undefined
		) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const { data, error } = await supabase
			.from('game_results')
			.upsert({
				matchup_id,
				home_team,
				away_team,
				home_score,
				away_score,
				winner,
				game_date
			})
			.select();

		if (error) throw error;

		return json({ success: true, data });
	} catch (error) {
		console.error('Error storing game result:', error);
		return json({ error: 'Failed to store game result' }, { status: 500 });
	}
}
