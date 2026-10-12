-- 0116 — The CX Pass is shown once to a new member, the first time they land on their dashboard.
-- `welcome_pass_seen_at` stays null for new sign-ups; everybody who already has an account is marked as
-- having seen it, so only people who join from now on get the welcome.

alter table public.profiles add column if not exists welcome_pass_seen_at timestamptz;

update public.profiles set welcome_pass_seen_at = now() where welcome_pass_seen_at is null;

create or replace function public.mark_welcome_pass_seen()
returns void
language sql security definer set search_path = public
as $$
  update public.profiles set welcome_pass_seen_at = coalesce(welcome_pass_seen_at, now()) where id = auth.uid();
$$;
grant execute on function public.mark_welcome_pass_seen() to authenticated;
