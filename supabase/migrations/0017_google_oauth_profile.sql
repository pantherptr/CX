-- Real Google OAuth sign-in support.
--
-- Enabling the provider itself is a Supabase Dashboard step, not SQL (see
-- Authentication → Providers → Google, and the matching Google Cloud
-- Console OAuth client) — this migration only updates the trigger that
-- turns a new `auth.users` row into a `profiles` row, so a Google
-- sign-in gets a real name and avatar instead of nulls.
--
-- Supabase populates `raw_user_meta_data` with the provider's real claims
-- on first sign-in: for Google that's `full_name`/`name` and
-- `avatar_url`/`picture`. This only ever reads those real claims — it
-- never invents a name or picture for a user who didn't supply one
-- (email/password sign-ups still get `avatar_url = null`, exactly as
-- before).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;
