-- Verification v2: two separate things, reviewed separately.
--
--   1. IDENTITY — a government document (ID card, passport, residence permit, or a driving licence
--      used as ID: front + back, passports have one page) + a selfie. Approved identity = a verified
--      profile (badge, and the right to publish to SIGNAL as a client). Needs no driving licence.
--   2. DRIVING LICENCE — front + back. Needed before renting a car, not before using SIGNAL.
--      A licence used as the identity document is reused for this step automatically.
--
-- Each has its own status (none / pending / approved / rejected) and a reason when rejected. The
-- reviewer's decision is sent to the person as a message from CX. The legacy `status` column keeps
-- mirroring the LICENCE status so everything that already reads it keeps working.
--
-- Clients can never set a status: they call submit_* RPCs; Owner/Admin call review_verification().

alter table public.verifications
  add column if not exists identity_doc_type text,
  add column if not exists identity_front_path text,
  add column if not exists identity_back_path text,
  add column if not exists identity_status text not null default 'none',
  add column if not exists identity_reason text,
  add column if not exists identity_submitted_at timestamptz,
  add column if not exists identity_reviewed_at timestamptz,
  add column if not exists licence_back_path text,
  add column if not exists licence_status text not null default 'none',
  add column if not exists licence_reason text,
  add column if not exists licence_submitted_at timestamptz,
  add column if not exists licence_reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'verifications_identity_status_chk') then
    alter table public.verifications add constraint verifications_identity_status_chk
      check (identity_status in ('none', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'verifications_licence_status_chk') then
    alter table public.verifications add constraint verifications_licence_status_chk
      check (licence_status in ('none', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'verifications_identity_doc_chk') then
    alter table public.verifications add constraint verifications_identity_doc_chk
      check (identity_doc_type is null or identity_doc_type in ('id_card', 'passport', 'residence_permit', 'driving_licence'));
  end if;
end $$;

-- Existing submissions (licence photo + selfie under the old single status) carry over: the licence
-- keeps its status, and a licence + selfie pair counts as identity done with the licence as the document.
update public.verifications
   set licence_status = status, licence_submitted_at = submitted_at, licence_reviewed_at = reviewed_at
 where licence_photo_path is not null and licence_status = 'none';

update public.verifications
   set identity_status = status, identity_doc_type = 'driving_licence', identity_front_path = licence_photo_path,
       identity_submitted_at = submitted_at, identity_reviewed_at = reviewed_at
 where licence_photo_path is not null and selfie_path is not null and identity_status = 'none';

-- ---------------------------------------------------------------- history
create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('identity', 'licence')),
  action text not null check (action in ('submitted', 'approved', 'rejected')),
  reason text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists verification_events_user_idx on public.verification_events (user_id, created_at desc);
alter table public.verification_events enable row level security;

drop policy if exists "Users read their own verification history" on public.verification_events;
create policy "Users read their own verification history"
  on public.verification_events for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- locks
-- Replaces the 0016 trigger: a client update can't move any status / reason / review column; only
-- the RPCs below (they set cx.verif_rpc) or an Owner/Admin can.
create or replace function public.lock_verification_status_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('cx.verif_rpc', true), '') = 'on' then
    return new;
  end if;
  if public.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_at := now();
    end if;
    return new;
  end if;
  new.status := old.status;
  new.reviewed_at := old.reviewed_at;
  new.identity_status := old.identity_status;
  new.identity_reason := old.identity_reason;
  new.identity_reviewed_at := old.identity_reviewed_at;
  new.licence_status := old.licence_status;
  new.licence_reason := old.licence_reason;
  new.licence_reviewed_at := old.licence_reviewed_at;
  new.reviewed_by := old.reviewed_by;
  return new;
end;
$$;

create or replace function public.lock_verification_status_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('cx.verif_rpc', true), '') <> 'on' then
    new.status := 'pending';
    new.identity_status := 'none';
    new.licence_status := 'none';
    new.identity_reason := null;
    new.licence_reason := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- storage: reviewers can open documents
drop policy if exists "Admins read verification documents" on storage.objects;
create policy "Admins read verification documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'verification-documents' and public.is_admin());

-- ---------------------------------------------------------------- CX message helper
-- A message from the CX support account to one person, in their conversation with CX (created on demand).
create or replace function public.send_cx_message(p_user_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_conv uuid;
begin
  select id into v_owner from public.profiles where is_owner limit 1;
  if v_owner is null or v_owner = p_user_id then
    return;
  end if;

  select c.id into v_conv
    from public.conversations c
    join public.conversation_participants a on a.conversation_id = c.id and a.user_id = v_owner
    join public.conversation_participants b on b.conversation_id = c.id and b.user_id = p_user_id
   where c.car_id is null
   order by c.created_at
   limit 1;

  if v_conv is null then
    insert into public.conversations (car_id) values (null) returning id into v_conv;
    insert into public.conversation_participants (conversation_id, user_id) values (v_conv, v_owner), (v_conv, p_user_id);
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (v_conv, v_owner, p_body);
exception when others then
  -- a notification must never fail a review
  return;
end;
$$;

revoke all on function public.send_cx_message(uuid, text) from public;

-- ---------------------------------------------------------------- submit
create or replace function public.submit_identity_verification(
  p_doc_type text, p_front text, p_back text, p_selfie text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_licence_pending boolean := false;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_doc_type not in ('id_card', 'passport', 'residence_permit', 'driving_licence') then
    raise exception 'Unknown document type';
  end if;
  if p_front is null or p_selfie is null or left(p_front, 37) <> uid::text || '/' or left(p_selfie, 37) <> uid::text || '/' then
    raise exception 'Front photo and selfie are required';
  end if;
  if p_doc_type <> 'passport' and (p_back is null or left(p_back, 37) <> uid::text || '/') then
    raise exception 'Back of the document is required';
  end if;

  perform set_config('cx.verif_rpc', 'on', true);

  insert into public.verifications (user_id) values (uid) on conflict (user_id) do nothing;

  -- A driving licence used as ID also serves as the licence (unless that is already approved).
  select (p_doc_type = 'driving_licence' and licence_status <> 'approved') into v_licence_pending
    from public.verifications where user_id = uid;

  update public.verifications set
    identity_doc_type = p_doc_type,
    identity_front_path = p_front,
    identity_back_path = case when p_doc_type = 'passport' then null else p_back end,
    selfie_path = p_selfie,
    identity_status = 'pending',
    identity_reason = null,
    identity_submitted_at = now(),
    identity_reviewed_at = null,
    submitted_at = now()
  where user_id = uid;

  insert into public.verification_events (user_id, kind, action) values (uid, 'identity', 'submitted');

  if v_licence_pending then
    update public.verifications set
      licence_photo_path = p_front,
      licence_back_path = p_back,
      licence_status = 'pending',
      licence_reason = null,
      licence_submitted_at = now(),
      licence_reviewed_at = null,
      status = 'pending'
    where user_id = uid;
    insert into public.verification_events (user_id, kind, action) values (uid, 'licence', 'submitted');
  end if;
end;
$$;

create or replace function public.submit_licence_verification(p_front text, p_back text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_front is null or p_back is null or left(p_front, 37) <> uid::text || '/' or left(p_back, 37) <> uid::text || '/' then
    raise exception 'Front and back of the licence are required';
  end if;

  perform set_config('cx.verif_rpc', 'on', true);

  insert into public.verifications (user_id) values (uid) on conflict (user_id) do nothing;

  update public.verifications set
    licence_photo_path = p_front,
    licence_back_path = p_back,
    licence_status = 'pending',
    licence_reason = null,
    licence_submitted_at = now(),
    licence_reviewed_at = null,
    status = 'pending',
    submitted_at = now()
  where user_id = uid;

  insert into public.verification_events (user_id, kind, action) values (uid, 'licence', 'submitted');
end;
$$;

-- ---------------------------------------------------------------- review (Owner / Admin)
create or replace function public.review_verification(
  p_user_id uuid, p_kind text, p_decision text, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_label text;
  v_body text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_kind not in ('identity', 'licence') then raise exception 'Unknown kind'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision'; end if;
  if p_decision = 'rejected' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Say why it was not accepted';
  end if;
  if not exists (select 1 from public.verifications where user_id = p_user_id) then
    raise exception 'Nothing submitted';
  end if;

  perform set_config('cx.verif_rpc', 'on', true);

  if p_kind = 'identity' then
    update public.verifications set
      identity_status = p_decision,
      identity_reason = case when p_decision = 'rejected' then v_reason else null end,
      identity_reviewed_at = now(),
      reviewed_by = auth.uid()
    where user_id = p_user_id;
    -- a verified profile may publish to SIGNAL as a client
    update public.profiles set is_verified_client = (p_decision = 'approved') where id = p_user_id and not is_host;
    v_label := 'identity';
  else
    update public.verifications set
      licence_status = p_decision,
      licence_reason = case when p_decision = 'rejected' then v_reason else null end,
      licence_reviewed_at = now(),
      status = p_decision,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where user_id = p_user_id;
    v_label := 'driving licence';
  end if;

  insert into public.verification_events (user_id, kind, action, reason, actor_id)
  values (p_user_id, p_kind, p_decision, case when p_decision = 'rejected' then v_reason end, auth.uid());

  if p_decision = 'approved' then
    v_body := case when p_kind = 'identity'
      then 'Your identity is verified ✓ — your profile now carries the verified badge.'
      else 'Your driving licence is verified ✓ — you are ready to rent.' end;
  else
    v_body := 'We could not accept your ' || v_label || ' this time: ' || v_reason
      || '. You can send it again from Settings → Verification — it only takes a minute.';
  end if;
  perform public.send_cx_message(p_user_id, v_body);
end;
$$;

revoke all on function public.submit_identity_verification(text, text, text, text) from public;
revoke all on function public.submit_licence_verification(text, text) from public;
revoke all on function public.review_verification(uuid, text, text, text) from public;
grant execute on function public.submit_identity_verification(text, text, text, text) to authenticated;
grant execute on function public.submit_licence_verification(text, text) to authenticated;
grant execute on function public.review_verification(uuid, text, text, text) to authenticated;
