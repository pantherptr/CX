-- SIGNAL Community demo content engine — one dead Unsplash id fixed.
--
-- `photo-1552853227-6feccbe1ba7d` (the Napoli "city" template) 404s —
-- verified live against images.unsplash.com, not a guess. The existing
-- reliable-image fallback already caught this gracefully in the feed
-- (a clean placeholder icon, never a broken-image icon — see
-- src/components/motion.tsx's `Img`), so nothing was broken for a
-- viewer; this just corrects the source so future generation stops
-- reintroducing a known-dead id. Replaced with
-- `photo-1580273916550-e323be2ae537`, verified live and already used
-- elsewhere in this app's own seed car catalogue (src/data/cars.ts).
--
-- A handful of demo posts already generated before this fix may still
-- reference the dead id — left alone rather than hand-patched: they age
-- out via the normal retention cleanup like any other demo post, and
-- display cleanly via the fallback in the meantime.
--
-- Bare create-or-replace (no drop first) — the function's signature is
-- unchanged from 0062, only the literal inside its body differs.
create or replace function public.signal_demo_run_generation(p_profile_count integer, p_post_count integer, p_slot text, p_photo_count integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_profiles_inserted integer := 0;
  v_posts_inserted integer := 0;
  v_photos_target integer;
begin
  -- 7a. Activate up to p_profile_count profiles from the curated pool
  -- that aren't already in use — idempotent via the unique username,
  -- and naturally bounded once the whole pool has been introduced.
  with pool(full_name, username, avatar_seed, bio, role) as (
    values
      ('Marco Bellini', 'marco.b', 34, 'Host in Milano — three cars, always ready for a road trip.', 'host'),
      ('Giulia Romano', 'giulia.romano', 12, 'Verified Client. Weekend explorer, coffee addict.', 'verified_client'),
      ('Alessandro Conti', 'alex.conti', 47, 'Torino-based host. Precision Italian engineering, precision service.', 'host'),
      ('Sofia Ferrari', 'sofia.f', 5, 'Verified Client from Bologna. Rent, drive, repeat.', 'verified_client'),
      ('Luca Moretti', 'luca.moretti', 23, 'Host near the coast. Convertibles are my specialty.', 'host'),
      ('Chiara Esposito', 'chiara.e', 41, 'Verified Client. Photographer, always chasing the next backdrop.', 'verified_client'),
      ('Davide Rinaldi', 'davide.r', 58, 'Firenze host — classic style, modern comfort.', 'host'),
      ('Martina Greco', 'martina.greco', 29, 'Verified Client. City weekends, mountain escapes.', 'verified_client'),
      ('Francesco Villa', 'francesco.v', 15, 'Host in Roma. Family fleet, family service.', 'host'),
      ('Elena Marino', 'elena.marino', 36, 'Verified Client from Napoli. Always up for a drive.', 'verified_client'),
      ('Simone Barbieri', 'simone.b', 62, 'Host — Verona. EVs and everything after.', 'host'),
      ('Valentina Gallo', 'valentina.gallo', 8, 'Verified Client. Frequent flyer, frequent driver.', 'verified_client'),
      ('Riccardo Fontana', 'riccardo.f', 51, 'Host in Genova. Coastal roads, top-down driving.', 'host'),
      ('Beatrice Colombo', 'beatrice.c', 19, 'Verified Client from Milano. Design-obsessed.', 'verified_client'),
      ('Matteo Ricci', 'matteo.ricci', 44, 'Host — Bari. Southern roads, real hospitality.', 'host'),
      ('Alice Santoro', 'alice.santoro', 27, 'Verified Client. First rental turned regular.', 'verified_client')
  ),
  available as (
    select p.* from pool p
    where not exists (select 1 from public.signal_demo_profiles d where d.username = p.username)
    order by random()
    limit greatest(p_profile_count, 0)
  )
  insert into public.signal_demo_profiles (full_name, username, avatar_url, bio, role)
  select full_name, username, 'https://i.pravatar.cc/160?img=' || avatar_seed, bio, role
  from available;
  get diagnostics v_profiles_inserted = row_count;

  -- 7b. Posts — theme-tagged template pool, an author picked randomly
  -- from whichever demo profiles already exist, natural jitter on
  -- created_at so a batch doesn't land as one identical timestamp.
  -- `p_photo_count` is the caller's job to size correctly (a per-slot
  -- share for the lazy trigger, the full daily figure for a manual
  -- one-shot generate) — this function just respects whatever it's
  -- given rather than guessing from the day's total itself.
  v_photos_target := least(
    coalesce(p_photo_count, coalesce((select demo_photos_per_day from public.signal_demo_settings where id = true), 0)),
    p_post_count
  );
  with templates(theme, title, body, has_photo, photo_id) as (
    values
      ('city', null, 'Milano at golden hour hits different when you''re behind the wheel of something special.', true, 'photo-1520175480921-4edfa2983e0f'),
      ('city', null, 'Just wrapped a weekend showing a client around Torino — this city never runs out of good roads.', true, 'photo-1543832923-44667a44c804'),
      ('city', 'Roma by night', 'Nothing beats an evening drive past the Colosseo with the windows down.', true, 'photo-1552832230-c0197dd311b5'),
      ('city', null, 'Firenze traffic is chaos but the drive along the river makes up for it every time.', false, null),
      ('car', 'New to the fleet', 'Just added a fresh set of wheels to the lineup — booking calendar is already filling up.', true, 'photo-1494905998402-395d579af36f'),
      ('car', null, 'Detailing day. There''s something satisfying about handing over a car that looks brand new.', true, 'photo-1541899481282-d53bffe3c35d'),
      ('car', null, 'Had a client ask for the sportiest thing in the fleet this weekend — happy to oblige.', false, null),
      ('car', 'Maintenance done right', 'Full service before every single rental, no exceptions. Worth the wait.', true, 'photo-1503376780353-7e6692767b70'),
      ('travel', null, 'Drove the coastal route down to Cinque Terre this weekend — worth every hairpin turn.', true, 'photo-1533104816931-20fa691ff6ca'),
      ('travel', 'Weekend escape', 'Took the long way to the lake instead of the highway. Best decision all month.', true, 'photo-1493246507139-91e8fad9978e'),
      ('travel', null, 'Road trip season is here. Already planning the next one.', false, null),
      ('rental', null, 'Third time renting through CX this year — the process just keeps getting smoother.', false, null),
      ('rental', 'Smooth pickup', 'Contactless pickup, spotless car, zero hassle. This is how renting should feel.', false, null),
      ('rental', null, 'Booked last minute for a work trip and still had a great car waiting for me.', false, null),
      ('lifestyle', null, 'Sunday morning, empty roads, good music. Simple pleasures.', true, 'photo-1449965408869-eaa3f722e40d'),
      ('lifestyle', null, 'There''s a certain calm to a long solo drive that nothing else replicates.', false, null),
      ('lifestyle', 'Coffee and cars', 'Local meetup this morning turned into an impromptu photoshoot. Great crowd.', true, 'photo-1542282088-fe8426682b8f'),
      ('host_experience', null, 'Hosting on CX has been the easiest side income I''ve ever set up — the platform does the heavy lifting.', false, null),
      ('host_experience', 'One year hosting', 'Hard to believe it''s been a year since I listed my first car. Grateful for every guest.', false, null),
      ('host_experience', null, 'Had a guest extend their trip twice this week. Always a good sign.', false, null),
      ('client_experience', null, 'Renting instead of owning has genuinely changed how I think about having a car in the city.', false, null),
      ('client_experience', 'Worth it', 'Used CX for a family trip this month — smoother than I expected, will book again.', false, null),
      ('client_experience', null, 'Six months of renting through CX and I still haven''t had a single issue.', false, null),
      ('cx_community', null, 'Love seeing what everyone''s driving this week. Great community here.', false, null),
      ('cx_community', 'Shoutout', 'Big thanks to the CX team for sorting out my booking so quickly yesterday.', false, null),
      ('cx_community', null, 'This community is honestly one of the best parts of renting through CX.', false, null),
      ('city', null, 'Napoli traffic taught me patience. The view from the coast road taught me why it''s worth it.', true, 'photo-1580273916550-e323be2ae537'),
      ('car', null, 'Nothing like the smell of a fresh detail job in the morning.', false, null),
      ('travel', null, 'Chasing sunsets along the Amalfi coast this week — the drive alone is worth the trip.', true, 'photo-1533105079780-92b9be482077'),
      ('lifestyle', null, 'Weekday errands feel different in the right car.', false, null),
      ('rental', null, 'Flexible pickup times saved my whole weekend plan. Appreciate it.', false, null),
      ('host_experience', null, 'Every review reminds me why I started hosting in the first place.', false, null)
  ),
  picked as (
    select t.*, row_number() over (order by random()) as rn
    from templates t
    order by random()
    limit greatest(p_post_count, 0)
  ),
  authors as (
    select id, row_number() over (order by random()) as rn
    from public.signal_demo_profiles
    where is_active
  ),
  author_count as (
    select greatest(count(*), 1) as n from authors
  )
  insert into public.signal_demo_posts (demo_author_id, theme, title, body, media_photo_id, generation_batch_id, generation_slot, created_at)
  select
    a.id,
    p.theme, p.title, p.body,
    case when p.rn <= v_photos_target and p.has_photo then p.photo_id else null end,
    v_batch_id, p_slot,
    now() - (random() * interval '90 minutes')
  from picked p
  cross join author_count ac
  join authors a on a.rn = ((p.rn - 1) % ac.n) + 1;
  get diagnostics v_posts_inserted = row_count;

  return jsonb_build_object('batch_id', v_batch_id, 'profiles_inserted', v_profiles_inserted, 'posts_inserted', v_posts_inserted);
end;
$$;
