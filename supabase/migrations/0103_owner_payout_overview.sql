-- Owner / Admin: one place to see what CX earns from hosts and which payouts are stuck.
-- Read-only overview + one narrow function to change the host commission %.
-- Builds on 0068 (payout_status on bookings) and 0102 (booking_payouts, host_commission_pct).

create or replace function public.fetch_payout_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'commission_pct', coalesce((select host_commission_pct from public.platform_settings where id = 'main'), 0),
    'paid_count', (select count(*) from public.booking_payouts),
    'gross', coalesce((select sum(gross) from public.booking_payouts), 0),
    'commission', coalesce((select sum(commission) from public.booking_payouts), 0),
    'net', coalesce((select sum(net) from public.booking_payouts), 0),
    'commission_30d', coalesce((select sum(commission) from public.booking_payouts where paid_at > now() - interval '30 days'), 0),
    'pending_count', (select count(*) from public.bookings where status = 'confirmed' and payout_status = 'pending'),
    'pending_amount', coalesce((select sum(host_payout_amount) from public.bookings where status = 'confirmed' and payout_status = 'pending'), 0),
    'stuck', coalesce((
      select jsonb_agg(row_to_json(x) order by x.end_date desc)
      from (
        select b.id, b.reference, b.end_date, b.host_payout_amount as amount, b.payout_status as status,
               p.full_name as host_name, (p.stripe_connect_account_id is not null) as onboarding_started,
               p.stripe_connect_payouts_enabled as payouts_enabled
        from public.bookings b
        join public.profiles p on p.id = b.host_id
        where b.payout_status in ('blocked', 'failed')
        order by b.end_date desc
        limit 50
      ) x
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row_to_json(y) order by y.paid_at desc)
      from (
        select bp.booking_id, bp.gross, bp.commission, bp.net, bp.paid_at, bk.reference, pr.full_name as host_name
        from public.booking_payouts bp
        join public.bookings bk on bk.id = bp.booking_id
        join public.profiles pr on pr.id = bp.host_id
        order by bp.paid_at desc
        limit 20
      ) y
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
grant execute on function public.fetch_payout_overview() to authenticated;

create or replace function public.set_host_commission_pct(p_pct numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 50 then raise exception 'The commission must be between 0 and 50'; end if;
  update public.platform_settings set host_commission_pct = p_pct where id = 'main';
end;
$$;
grant execute on function public.set_host_commission_pct(numeric) to authenticated;
