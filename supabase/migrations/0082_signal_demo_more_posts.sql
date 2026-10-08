-- More sample posts for the SIGNAL demo feed: about 35 new templates (cars,
-- Italian towns, roads, lakes and mountains, plain-text posts). Every photo id
-- was checked live against images.unsplash.com and none shows an identifiable
-- person. Same function and signature as 0063; only the template list grows.
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
      ('host_experience', null, 'Every review reminds me why I started hosting in the first place.', false, null),
      ('car', 'Garage day', 'Everything washed, checked and parked in a row. Ready for whoever books next.', true, 'photo-1492144534655-ae79c964c9d7'),
      ('car', null, 'That blue is even better in person. Lucky guests this weekend.', true, 'photo-1502877338535-766e1452684a'),
      ('car', 'American muscle', 'Some cars don''t need an introduction. The sound says it all.', true, 'photo-1494976388531-d1058494cdd8'),
      ('car', null, 'Orange on a forest road. I''ll never get tired of this shot.', true, 'photo-1525609004556-c46c7d6cf023'),
      ('car', null, 'Yellow looks good in any city. Booked out through Sunday.', true, 'photo-1511919884226-fd3cad34687c'),
      ('car', 'Show-stopper', 'Parked outside a café and every head turned. That is the whole point.', true, 'photo-1544636331-e26879cd4d9b'),
      ('car', null, 'Red, loud, and washed twice this week. Guests deserve the best.', true, 'photo-1583121274602-3e2820c69888'),
      ('car', null, 'Quiet street, soft light, nothing else needed.', true, 'photo-1507136566006-cfc505b114fc'),
      ('car', 'Evening run', 'Night drive, wet roads, city lights. Pure cinema.', true, 'photo-1471479917193-f00955256257'),
      ('car', null, 'Sunny day, yellow car, empty road. We''ll take it.', true, 'photo-1503736334956-4c8f8e92946d'),
      ('city', 'Venezia', 'Left the car on the mainland and spent the day on foot — some places ask you to slow down.', true, 'photo-1523906834658-6e24ef2386f9'),
      ('city', null, 'Morning light on the canals. Worth getting up early for.', true, 'photo-1534113414509-0eec2bfb493f'),
      ('city', 'Little streets', 'The best parking spot in Italy comes with a view of a bougainvillea and a scooter.', true, 'photo-1515859005217-8a1f08870f59'),
      ('travel', 'Open road', 'Long straight road, red rocks, no signal. Exactly what the weekend needed.', true, 'photo-1500530855697-b586d89ba3ee'),
      ('travel', null, 'Packed light, left early. The road does the rest.', true, 'photo-1469854523086-cc02fe5d8800'),
      ('travel', 'Dolomiti', 'Green water, quiet boats, mountains all around. Worth every kilometre of the drive.', true, 'photo-1501785888041-af3ef285b470'),
      ('travel', null, 'Cloud inversion at sunrise. Drove two hours for this and I''d do it again.', true, 'photo-1506905925346-21bda4d32df4'),
      ('travel', 'Alpine day', 'Mountain valley, blue sky, a car that''s happy on the curves.', true, 'photo-1464822759023-fed622ff2c3b'),
      ('travel', null, 'Sunset on a winding road. Sometimes the detour is the trip.', true, 'photo-1568605117036-5fe5e7bab0b7'),
      ('lifestyle', null, 'Saturday plan: no plan. Just a full tank and a free afternoon.', false, null),
      ('lifestyle', null, 'Best playlist for a coastal drive? Asking for a friend.', false, null),
      ('lifestyle', 'Slow mornings', 'Espresso first, then the road. The order matters.', false, null),
      ('rental', null, 'Picked up in five minutes, returned with a full tank. Easy.', false, null),
      ('rental', 'Clear and simple', 'No surprises, no fine print drama. That''s all I ask from a rental.', false, null),
      ('rental', null, 'Booking a car for a weekend away is now my favourite kind of planning.', false, null),
      ('host_experience', null, 'Message from a guest this morning: "The car was perfect." Made my day.', false, null),
      ('host_experience', 'Hosting tip', 'Reply fast and be clear on pickup details. Guests remember it more than the car.', false, null),
      ('host_experience', null, 'Fresh photos make a listing. Do them in soft evening light.', false, null),
      ('client_experience', null, 'First rental on CX: smooth. The host answered in minutes.', false, null),
      ('client_experience', 'Weekend trip', 'Drove to the lakes and back. The car was great and the trip was better.', false, null),
      ('client_experience', null, 'Rented for a wedding weekend. Worth every euro.', false, null),
      ('cx_community', null, 'Tell me your dream car for a summer road trip. I''ll start: anything with a roof that opens.', false, null),
      ('cx_community', 'Question', 'Coast or mountains for the next long weekend?', false, null),
      ('cx_community', null, 'Great to see more hosts joining this month.', false, null)
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
