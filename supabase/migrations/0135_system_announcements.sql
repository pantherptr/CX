-- System announcements: the CX team (Owner / Admin) writes one message and it lands in the inbox of everyone,
-- or of a group (hosts, verified clients, the team) or of chosen people, as a plain notice that opens nothing.
-- Optionally it carries one button that opens a section of the app (internal path only).
--
--   system_announcements  — what was sent, by whom, to whom, to how many (Owner / Admin read it).
--   app_notifications     — one row per recipient (kind 'announcement'), the same inbox as bookings, payments…
--
-- Writes go through send_system_announcement() only. Pushes use the inbox fan-out of 0110 when it is set up.

alter table public.app_notifications add column if not exists cta_label text;
alter table public.app_notifications add column if not exists announcement_id uuid;

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null check (audience in ('all', 'hosts', 'clients', 'team', 'people')),
  recipient_ids uuid[],
  cta_label text,
  cta_url text,
  recipients_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists system_announcements_created_idx on public.system_announcements (created_at desc);

alter table public.system_announcements enable row level security;
drop policy if exists "Team reads announcements" on public.system_announcements;
create policy "Team reads announcements"
  on public.system_announcements for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_owner or p.is_admin)));
-- no insert / update / delete policies: send_system_announcement() is the only writer.

create or replace function public.send_system_announcement(
  p_title text,
  p_body text,
  p_audience text,
  p_user_ids uuid[] default null,
  p_cta_label text default null,
  p_cta_url text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_label text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_url text := nullif(btrim(coalesce(p_cta_url, '')), '');
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and (is_owner or is_admin)) then
    raise exception 'Not allowed';
  end if;
  if v_title = '' or v_body = '' then raise exception 'Title and message are required'; end if;
  if p_audience not in ('all', 'hosts', 'clients', 'team', 'people') then raise exception 'Unknown audience'; end if;
  if p_audience = 'people' and coalesce(array_length(p_user_ids, 1), 0) = 0 then raise exception 'Choose at least one person'; end if;
  -- a button needs both parts, and may only open a place inside the app
  if (v_label is null) <> (v_url is null) then raise exception 'A button needs a label and a destination'; end if;
  if v_url is not null and (left(v_url, 1) <> '/' or left(v_url, 2) = '//') then raise exception 'The button must open a page of the app'; end if;

  insert into public.system_announcements (title, body, audience, recipient_ids, cta_label, cta_url, created_by)
  values (left(v_title, 80), left(v_body, 500), p_audience, case when p_audience = 'people' then p_user_ids end,
          left(v_label, 30), v_url, auth.uid())
  returning id into v_id;

  insert into public.app_notifications (user_id, kind, title, body, url, cta_label, announcement_id)
  select p.id, 'announcement', left(v_title, 80), left(v_body, 500), v_url, left(v_label, 30), v_id
  from public.profiles p
  where case p_audience
    when 'all' then true
    when 'hosts' then p.is_host
    when 'clients' then p.is_verified_client
    when 'team' then (p.is_owner or p.is_admin)
    when 'people' then p.id = any (p_user_ids)
    else false
  end;
  get diagnostics v_count = row_count;

  update public.system_announcements set recipients_count = v_count where id = v_id;
  return v_count;
end;
$$;

revoke all on function public.send_system_announcement(text, text, text, uuid[], text, text) from public;
revoke all on function public.send_system_announcement(text, text, text, uuid[], text, text) from anon;
grant execute on function public.send_system_announcement(text, text, text, uuid[], text, text) to authenticated;
