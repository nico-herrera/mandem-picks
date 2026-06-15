import { supabase } from '$lib/supabaseClient';

export interface AppUser {
	id: string;
	email: string | null;
	username: string;
	isAdmin: boolean;
}

/**
 * Resolves the current Supabase Auth session into an app user (id + profile).
 * Returns null if there is no active session or no matching profile row.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
	const {
		data: { session }
	} = await supabase.auth.getSession();

	if (!session) return null;

	const uid = session.user.id;

	let { data: profile } = await supabase
		.from('profiles')
		.select('username, is_admin')
		.eq('id', uid)
		.maybeSingle();

	// Self-heal: if the signup trigger never created a profile (e.g. the account
	// predates the trigger), create one now from the Google profile.
	if (!profile) {
		const meta = session.user.user_metadata ?? {};
		const base = String(meta.full_name ?? meta.name ?? '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '');
		const username = base ? `${base}_${uid.slice(0, 4)}` : `user_${uid.slice(0, 8)}`;

		const { data: created } = await supabase
			.from('profiles')
			.insert({ id: uid, username })
			.select('username, is_admin')
			.maybeSingle();

		if (!created) return null;
		profile = created;
	}

	return {
		id: uid,
		email: session.user.email ?? null,
		username: profile.username,
		isAdmin: profile.is_admin ?? false
	};
}
