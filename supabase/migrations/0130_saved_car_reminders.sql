-- 0130 · "A car you saved is still available" reminders.
--
-- The daily sweep (api/send-pickup-reminders.ts) calls saved_car_reminder_candidates(): at most ONE reminder
-- per person per week, for the car they saved the longest ago (but at least 3 days ago), only if the car is
-- still published and has no booking in the next 7 days. The API then marks the favourite as reminded.
-- Run this in the Supabase SQL Editor. Until it is run the sweep simply skips this step.

alter table public.favorites add column if not exists reminded_at timestamptz;

create or replace function public.saved_car_reminder_candidates(max_rows int default 200)
returns table (user_id uuid, car_id uuid, slug text, make text, model text, city text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (f.user_id)
         f.user_id, c.id, c.slug, c.make, c.model, c.city
    from public.favorites f
    join public.cars c on c.id = f.car_id and c.status = 'published'
   where f.created_at < now() - interval '3 days'
     and (f.reminded_at is null or f.reminded_at < now() - interval '30 days')
     -- nothing reminded to this person in the last 7 days (any saved car)
     and not exists (
       select 1 from public.favorites r
        where r.user_id = f.user_id and r.reminded_at > now() - interval '7 days'
     )
     -- the car is actually free for the coming week
     and not exists (
       select 1 from public.bookings b
        where b.car_id = c.id
          and b.status in ('confirmed', 'pending', 'payment_processing')
          and b.start_date <= (current_date + 7)
          and b.end_date >= current_date
     )
   order by f.user_id, f.created_at
   limit max_rows;
$$;

-- only the service role (the daily sweep) may call it
revoke all on function public.saved_car_reminder_candidates(int) from public, anon, authenticated;
grant execute on function public.saved_car_reminder_candidates(int) to service_role;
