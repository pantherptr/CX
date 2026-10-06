-- Keeps contact details and off-app payments out of member-to-member chats
-- and public text, so a trip isn't taken off CX (where it has no payment
-- protection, no refund and no support).
--
-- The app already stops these before sending (src/lib/contactGuard.ts);
-- this is the backstop: whatever slips past a client is hidden as '••••'
-- before it is saved, and the original goes to contact_guard_flags for the
-- Owner and admins to review.
--
-- Everything here FAILS OPEN: if a guard function ever errors, the row is
-- saved as sent. A guard bug must never block a message or a listing.
--
-- Not covered: conversations with the support account (talking to CX is
-- unrestricted) and anything written by the Owner or an admin.

create table if not exists public.contact_guard_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  user_id uuid,
  ref_id uuid,
  original text not null
);
alter table public.contact_guard_flags enable row level security;

drop policy if exists "Owner and admins read contact flags" on public.contact_guard_flags;
create policy "Owner and admins read contact flags"
  on public.contact_guard_flags for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_owner or p.is_admin)
  ));
-- No insert/update/delete policies: only the security-definer triggers below write here.

-- Emails, links, phone numbers (9+ digits, so dates stay intact) and the
-- usual off-app channels, each replaced by '••••'.
create or replace function public.mask_contact_info(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          t,
          '[A-Za-z0-9._%+-]+[[:space:]]*(@|\(at\)|\[at\])[[:space:]]*[A-Za-z0-9-]+([.][A-Za-z0-9-]+)*[.][A-Za-z]{2,}',
          '••••', 'g'),
        '(https?://|www[.])[^[:space:]]+',
        '••••', 'g'),
      '[+]?([0-9][ ().-]?){8,}[0-9]',
      '••••', 'g'),
    '(whats ?app|telegram|viber|wechat|iban|paypal|revolut|bizum|satispay|postepay|venmo)',
    '••••', 'gi');
$$;

-- Chat messages.
create or replace function public.guard_message_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  masked text;
begin
  begin
    -- Anything involving the support account (the Owner) is unrestricted.
    if exists (
      select 1
      from public.conversation_participants cp
      join public.profiles p on p.id = cp.user_id
      where cp.conversation_id = new.conversation_id and p.is_owner
    ) then
      return new;
    end if;

    masked := public.mask_contact_info(new.body);
    if masked is distinct from new.body then
      insert into public.contact_guard_flags (source, user_id, ref_id, original)
      values ('messages.body', new.sender_id, new.conversation_id, new.body);
      new.body := masked;
    end if;
  exception when others then
    return new;
  end;
  return new;
end;
$$;

drop trigger if exists guard_message_contact on public.messages;
create trigger guard_message_contact
  before insert on public.messages
  for each row execute function public.guard_message_contact();

-- Public text columns. Arguments: the column holding the author's id ('' if
-- none; Owner/admin authors are exempt), then the text columns to clean.
create or replace function public.guard_contact_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  col text;
  v text;
  m text;
  author uuid;
  touched boolean := false;
  i integer;
begin
  begin
    if tg_argv[0] <> '' then
      author := nullif(j ->> tg_argv[0], '')::uuid;
      if author is not null and exists (
        select 1 from public.profiles p
        where p.id = author and (p.is_owner or p.is_admin)
      ) then
        return new;
      end if;
    end if;

    for i in 1 .. coalesce(array_length(tg_argv, 1), 0) - 1 loop
      col := tg_argv[i];
      v := j ->> col;
      if v is not null then
        m := public.mask_contact_info(v);
        if m <> v then
          j := jsonb_set(j, array[col], to_jsonb(m));
          touched := true;
          insert into public.contact_guard_flags (source, user_id, ref_id, original)
          values (tg_table_name || '.' || col, author, nullif(j ->> 'id', '')::uuid, v);
        end if;
      end if;
    end loop;

    if touched then
      new := jsonb_populate_record(new, j);
    end if;
  exception when others then
    return new;
  end;
  return new;
end;
$$;

drop trigger if exists guard_cars_contact on public.cars;
create trigger guard_cars_contact
  before insert or update of description on public.cars
  for each row execute function public.guard_contact_columns('host_id', 'description');

drop trigger if exists guard_profiles_contact on public.profiles;
create trigger guard_profiles_contact
  before insert or update of bio on public.profiles
  for each row execute function public.guard_contact_columns('id', 'bio');

drop trigger if exists guard_reviews_contact on public.reviews;
create trigger guard_reviews_contact
  before insert or update of body on public.reviews
  for each row execute function public.guard_contact_columns('author_id', 'body');

drop trigger if exists guard_empire_posts_contact on public.empire_posts;
create trigger guard_empire_posts_contact
  before insert or update of title, body on public.empire_posts
  for each row execute function public.guard_contact_columns('author_id', 'title', 'body');

drop trigger if exists guard_empire_comments_contact on public.empire_post_comments;
create trigger guard_empire_comments_contact
  before insert or update of body on public.empire_post_comments
  for each row execute function public.guard_contact_columns('user_id', 'body');

drop trigger if exists guard_empire_slides_contact on public.empire_story_slides;
create trigger guard_empire_slides_contact
  before insert or update of caption on public.empire_story_slides
  for each row execute function public.guard_contact_columns('', 'caption');
