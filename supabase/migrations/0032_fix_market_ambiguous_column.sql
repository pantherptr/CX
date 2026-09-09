-- Fix: refresh_and_list_market() failed with "column reference is
-- ambiguous" for `expires_at`. RETURNS TABLE(...) output columns become
-- implicit PL/pgSQL variables in scope for the whole function body — its
-- own expiry-sweep line referenced the bare column name `expires_at`,
-- which collided with that variable. Qualifying it with the table name
-- resolves it unambiguously to the column.

create or replace function public.refresh_and_list_market()
returns table (
  id uuid, template_id uuid, name text, brand text, category text, rarity text,
  price numeric, market_value numeric, condition_pct integer, mileage_km integer,
  top_speed integer, acceleration integer, handling integer, braking integer,
  silhouette text, expires_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_active_count integer;
  v_template public.game_vehicle_templates;
  v_condition integer;
  v_price numeric;
begin
  update public.game_market_listings set status = 'expired'
  where status = 'available' and game_market_listings.expires_at < now();

  select count(*) into v_active_count from public.game_market_listings where status = 'available';

  while v_active_count < 8 loop
    select * into v_template from public.game_vehicle_templates
    where active order by random() limit 1;

    v_condition := 55 + floor(random() * 40)::int;
    v_price := round(v_template.base_price * (0.85 + random() * 0.3) * (0.7 + v_condition / 200.0));

    insert into public.game_market_listings (template_id, price, market_value, condition_pct, mileage_km, expires_at)
    values (
      v_template.id, v_price,
      round(v_template.base_price * (0.95 + random() * 0.25)),
      v_condition, floor(random() * 80000)::int,
      now() + interval '6 hours'
    );
    v_active_count := v_active_count + 1;
  end loop;

  return query
    select l.id, l.template_id, t.name, t.brand, t.category, t.rarity,
      l.price, l.market_value, l.condition_pct, l.mileage_km,
      t.top_speed, t.acceleration, t.handling, t.braking, t.silhouette, l.expires_at
    from public.game_market_listings l
    join public.game_vehicle_templates t on t.id = l.template_id
    where l.status = 'available'
    order by l.listed_at desc;
end;
$$;
