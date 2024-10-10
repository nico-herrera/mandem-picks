import { Session } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			user: Session['user'] | null;
			getSession: () => Promise<Session | null>;
		}
	}
}

export {};
