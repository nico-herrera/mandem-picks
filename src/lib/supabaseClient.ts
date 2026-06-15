import { createClient } from '@supabase/supabase-js';
import {
	NEXT_PUBLIC_SUPABASE_URL,
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
} from '$env/static/public';

const supabaseUrl = NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
