-- Mandem Picks — database schema (Supabase Auth)
-- Run this in the Supabase SQL Editor of a fresh project.
--
-- Auth model: Supabase Auth, Google OAuth only. Identities live in auth.users
-- (managed by Supabase). A `profiles` row is created automatically on first
-- sign-in to hold the app username + admin flag. RLS restricts all data to
-- logged-in users.
--
-- SETUP STEPS (in addition to running this file):
--   1. Sign in with Google:
--      a. Google Cloud Console (console.cloud.google.com): create a project, set
--         up the OAuth consent screen (External), then Credentials -> Create
--         OAuth client ID -> Web application.
--           Authorized redirect URI: https://<ref>.supabase.co/auth/v1/callback
--           (Authorized JS origins: your site URL, and http://localhost:5173 for
--            local testing.)
--      b. Supabase -> Authentication -> Providers -> Google: enable, paste the
--         Client ID + Client Secret from Google.
--      c. Supabase -> Authentication -> URL Configuration: set Site URL and add
--         <site>/auth/callback (and http://localhost:5173/auth/callback) to the
--         Redirect URLs allow list.
--   2. Authentication -> Providers -> Email: DISABLE it (Google-only app), so
--      nobody can create email/password accounts via the API.
--   3. After "nico" signs in once with Google, grant admin (match by email,
--      since the username is auto-generated):
--        update public.profiles set is_admin = true
--        where id = (select id from auth.users where email = 'nico@example.com');
--   4. Put the project's URL + publishable key in .env
--      (PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY).
--
--   Google users get an auto-generated username (see handle_new_user); there is
--   no name allowlist. Lock down who can join via the Google OAuth consent
--   screen (keep it in "Testing" and add the mandem as test users).

-- ---------------------------------------------------------------------------
-- profiles: app-level identity, 1:1 with auth.users. username is auto-derived
-- from the Google profile (see handle_new_user). is_admin gates result entry.
-- ---------------------------------------------------------------------------
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    username    text not null unique,
    is_admin    boolean not null default false,
    created_at  timestamptz not null default now()
);

-- Auto-create a profile when a user signs in for the first time.
--   Google provides no app username, so derive one from the provider's full name
--   (slugified), falling back to a stable random-ish handle. The 'username' meta
--   branch is kept for forward-compat but is unused in the Google-only flow.
-- On a username collision, append part of the user id so the auth insert never fails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    desired text;
begin
    desired := coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        nullif(
            regexp_replace(
                lower(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')),
                '[^a-z0-9]+', '', 'g'
            ),
            ''
        ),
        'user_' || substr(new.id::text, 1, 8)
    );

    begin
        insert into public.profiles (id, username) values (new.id, desired);
    exception when unique_violation then
        insert into public.profiles (id, username) values (new.id, desired || substr(new.id::text, 1, 6));
    end;

    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Profiles are readable by authenticated users"
    on public.profiles for select to authenticated using (true);

create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using (auth.uid() = id) with check (auth.uid() = id);

-- Lets the client self-heal a missing profile (see getCurrentUser). The normal
-- path is the handle_new_user trigger (security definer), which bypasses RLS.
create policy "Users can insert their own profile"
    on public.profiles for insert to authenticated with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- votes: one row per (user, matchup); vote in 'home' | 'away' | 'skip'.
--   matchup_id = The-Odds-API event id (string); intentionally NOT a FK to
--   game_results — you vote before a game finishes.
-- ---------------------------------------------------------------------------
create table public.votes (
    id          uuid primary key default gen_random_uuid(),
    matchup_id  text not null,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    vote        text not null check (vote in ('home', 'away', 'skip')),
    matchup     text,
    created_at  timestamptz not null default now(),
    unique (matchup_id, user_id)
);

create index votes_matchup_id_idx on public.votes (matchup_id);
create index votes_user_id_idx    on public.votes (user_id);

alter table public.votes enable row level security;

create policy "Votes are readable by authenticated users"
    on public.votes for select to authenticated using (true);

create policy "Users can insert their own votes"
    on public.votes for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can update their own votes"
    on public.votes for update to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own votes"
    on public.votes for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- game_results: final scores, keyed by matchup_id (PK -> upsert conflict target).
--   Only admins may write; everyone logged-in may read.
-- ---------------------------------------------------------------------------
create table public.game_results (
    matchup_id  text primary key,
    home_team   text not null,
    away_team   text not null,
    home_score  integer not null,
    away_score  integer not null,
    winner      text,
    game_date   timestamptz,
    created_at  timestamptz not null default now()
);

create index game_results_game_date_idx on public.game_results (game_date desc);

alter table public.game_results enable row level security;

create policy "Game results are readable by authenticated users"
    on public.game_results for select to authenticated using (true);

create policy "Admins can manage game results"
    on public.game_results for all to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
    with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
