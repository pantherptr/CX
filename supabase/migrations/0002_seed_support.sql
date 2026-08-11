-- Velora — schema extensions to support the demo-catalogue seed (Phase 2).
--
-- Adds: a stable slug for car detail routing, denormalized rating/trips
-- counters (populated from the seed today; real bookings/reviews can
-- update them going forward without changing the read shape), host-facing
-- profile stats, and support for reviews that aren't tied to a real
-- account (the seeded historical reviews) alongside real ones that are.
--
-- Safe to run once, right after 0001_init.sql, before any rows exist.

alter table public.cars
  add column slug text not null unique,
  add column rating numeric not null default 0,
  add column trips int not null default 0;

alter table public.profiles
  add column rating numeric not null default 0,
  add column trips int not null default 0,
  add column joined text,
  add column verified boolean not null default false,
  add column is_superhost boolean not null default false;

alter table public.reviews
  alter column author_id drop not null,
  add column author_name text not null default '',
  add column author_avatar_url text,
  add column author_location text;
