// src/routes/api/nfl-matchups/+server.js
import { json } from '@sveltejs/kit';
import { getNFLMatchups } from '$lib/api';

export async function GET() {
	try {
		const matchups = await getNFLMatchups();
		return json(matchups);
	} catch (error) {
		return json({ error }, { status: 500 });
	}
}
