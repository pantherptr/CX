-- Language of each person, so what the database writes on their behalf (CX chat messages, inbox
-- rows) and what the API pushes is in the language they chose in the app.

alter table public.user_notification_prefs add column if not exists lang text not null default 'en';

create or replace function public.save_my_language(p_lang text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_notification_prefs (user_id, lang, updated_at)
  values (auth.uid(), case when p_lang in ('it', 'ro', 'es') then p_lang else 'en' end, now())
  on conflict (user_id) do update set lang = excluded.lang, updated_at = now();
$$;
grant execute on function public.save_my_language(text) to authenticated;

create or replace function public.user_lang(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lang from public.user_notification_prefs where user_id = p_user), 'en');
$$;
revoke all on function public.user_lang(uuid) from public;

create table if not exists public.cx_texts (
  key text not null,
  lang text not null,
  body text not null,
  primary key (key, lang)
);
alter table public.cx_texts enable row level security;
-- no policies: read only through cx_text() below.

insert into public.cx_texts (key, lang, body) values
  ('verif_ok_identity', 'en', 'Your identity is verified ✓ — your profile now carries the verified badge.'),
  ('verif_ok_identity', 'it', 'La tua identità è verificata ✓: il tuo profilo ora ha il badge di verifica.'),
  ('verif_ok_identity', 'ro', 'Identitatea ta este verificată ✓ — profilul tău are acum insigna de verificare.'),
  ('verif_ok_identity', 'es', 'Tu identidad está verificada ✓: tu perfil ya tiene la insignia de verificado.'),
  ('verif_ok_licence', 'en', 'Your driving licence is verified ✓ — you are ready to rent.'),
  ('verif_ok_licence', 'it', 'La tua patente è verificata ✓: sei pronto a noleggiare.'),
  ('verif_ok_licence', 'ro', 'Permisul tău de conducere este verificat ✓ — ești gata să închiriezi.'),
  ('verif_ok_licence', 'es', 'Tu carnet de conducir está verificado ✓: ya puedes alquilar.'),
  ('msg_verif_no_identity', 'en', 'We could not accept your identity this time: {a}. You can send it again from Settings → Verification — it only takes a minute.'),
  ('msg_verif_no_identity', 'it', 'Questa volta non abbiamo potuto accettare la tua identità: {a}. Puoi inviarla di nuovo da Impostazioni → Verifica: ci vuole un minuto.'),
  ('msg_verif_no_identity', 'ro', 'De data aceasta nu am putut accepta identitatea ta: {a}. O poți trimite din nou din Setări → Verificare — durează un minut.'),
  ('msg_verif_no_identity', 'es', 'Esta vez no pudimos aceptar tu identidad: {a}. Puedes volver a enviar el documento desde Ajustes → Verificación; solo lleva un minuto.'),
  ('msg_verif_no_licence', 'en', 'We could not accept your driving licence this time: {a}. You can send it again from Settings → Verification — it only takes a minute.'),
  ('msg_verif_no_licence', 'it', 'Questa volta non abbiamo potuto accettare la tua patente: {a}. Puoi inviarla di nuovo da Impostazioni → Verifica: ci vuole un minuto.'),
  ('msg_verif_no_licence', 'ro', 'De data aceasta nu am putut accepta permisul tău de conducere: {a}. Îl poți trimite din nou din Setări → Verificare — durează un minut.'),
  ('msg_verif_no_licence', 'es', 'Esta vez no pudimos aceptar tu carnet de conducir: {a}. Puedes volver a enviar el documento desde Ajustes → Verificación; solo lleva un minuto.'),
  ('n_verif_ok_identity_t', 'en', 'Your identity is verified'),
  ('n_verif_ok_identity_t', 'it', 'La tua identità è verificata'),
  ('n_verif_ok_identity_t', 'ro', 'Identitatea ta este verificată'),
  ('n_verif_ok_identity_t', 'es', 'Tu identidad está verificada'),
  ('n_verif_ok_identity_b', 'en', 'Your profile now has the verified badge.'),
  ('n_verif_ok_identity_b', 'it', 'Il tuo profilo ora ha il badge di verifica.'),
  ('n_verif_ok_identity_b', 'ro', 'Profilul tău are acum insigna de verificare.'),
  ('n_verif_ok_identity_b', 'es', 'Tu perfil ya tiene la insignia de verificado.'),
  ('n_verif_ok_licence_t', 'en', 'Your driving licence is verified'),
  ('n_verif_ok_licence_t', 'it', 'La tua patente è verificata'),
  ('n_verif_ok_licence_t', 'ro', 'Permisul tău de conducere este verificat'),
  ('n_verif_ok_licence_t', 'es', 'Tu carnet de conducir está verificado'),
  ('n_verif_ok_licence_b', 'en', 'You are all set.'),
  ('n_verif_ok_licence_b', 'it', 'È tutto a posto.'),
  ('n_verif_ok_licence_b', 'ro', 'Totul este în regulă.'),
  ('n_verif_ok_licence_b', 'es', 'Todo listo.'),
  ('n_verif_no_identity_t', 'en', 'Your identity needs a new photo'),
  ('n_verif_no_identity_t', 'it', 'La tua identità ha bisogno di una nuova foto'),
  ('n_verif_no_identity_t', 'ro', 'Identitatea ta are nevoie de o fotografie nouă'),
  ('n_verif_no_identity_t', 'es', 'Tu identidad necesita una foto nueva'),
  ('n_verif_no_licence_t', 'en', 'Your driving licence needs a new photo'),
  ('n_verif_no_licence_t', 'it', 'La tua patente ha bisogno di una nuova foto'),
  ('n_verif_no_licence_t', 'ro', 'Permisul tău de conducere are nevoie de o fotografie nouă'),
  ('n_verif_no_licence_t', 'es', 'Tu carnet de conducir necesita una foto nueva'),
  ('listing_live_msg', 'en', 'Your {a} is live ✓ — renters can find it now.'),
  ('listing_live_msg', 'it', 'Il tuo annuncio per {a} è online ✓: ora i clienti possono trovarlo.'),
  ('listing_live_msg', 'ro', 'Anunțul tău pentru {a} este live ✓ — chiriașii îl pot găsi acum.'),
  ('listing_live_msg', 'es', 'Tu anuncio de {a} ya está en línea ✓: los clientes ya pueden encontrarlo.'),
  ('listing_live_t', 'en', 'Your {a} is live'),
  ('listing_live_t', 'it', 'Il tuo annuncio {a} è online'),
  ('listing_live_t', 'ro', 'Anunțul {a} este live'),
  ('listing_live_t', 'es', 'Tu anuncio de {a} está en línea'),
  ('listing_live_b', 'en', 'Renters can find it now.'),
  ('listing_live_b', 'it', 'Ora i clienti possono trovarlo.'),
  ('listing_live_b', 'ro', 'Chiriașii îl pot găsi acum.'),
  ('listing_live_b', 'es', 'Los clientes ya pueden encontrarlo.'),
  ('listing_no_msg', 'en', 'We could not publish your {a} yet: {b}. Open the listing, fix it and publish again — it only takes a minute.'),
  ('listing_no_msg', 'it', 'Non abbiamo ancora potuto pubblicare il tuo annuncio per {a}: {b}. Aprilo, correggilo e pubblicalo di nuovo: ci vuole un minuto.'),
  ('listing_no_msg', 'ro', 'Nu am putut încă publica anunțul tău pentru {a}: {b}. Deschide-l, corectează-l și publică-l din nou — durează un minut.'),
  ('listing_no_msg', 'es', 'Todavía no pudimos publicar tu anuncio de {a}: {b}. Ábrelo, corrígelo y vuelve a publicarlo: solo lleva un minuto.'),
  ('listing_no_t', 'en', 'Your {a} needs changes'),
  ('listing_no_t', 'it', 'Il tuo annuncio {a} richiede modifiche'),
  ('listing_no_t', 'ro', 'Anunțul {a} necesită modificări'),
  ('listing_no_t', 'es', 'Tu anuncio de {a} necesita cambios'),
  ('review_new_t', 'en', 'New {a}★ review on your {b}'),
  ('review_new_t', 'it', 'Nuova recensione {a}★ sulla tua {b}'),
  ('review_new_t', 'ro', 'Recenzie nouă {a}★ pentru {b}'),
  ('review_new_t', 'es', 'Nueva reseña de {a}★ en tu {b}')
on conflict (key, lang) do update set body = excluded.body;

-- cx_text('listing_live_t', 'it', 'Porsche 911') → the sentence in that language, {a} / {b} filled in.
create or replace function public.cx_text(p_key text, p_lang text, p_a text default '', p_b text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select replace(replace(
    coalesce(
      (select body from public.cx_texts where key = p_key and lang = p_lang),
      (select body from public.cx_texts where key = p_key and lang = 'en'),
      ''
    ), '{a}', coalesce(p_a, '')), '{b}', coalesce(p_b, ''));
$$;
revoke all on function public.cx_text(text, text, text, text) from public;

-- ---------------------------------------------------------------- the database-side events, localised
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
  v_lang text := public.user_lang(p_user_id);
  v_msg text;
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
    update public.profiles set is_verified_client = (p_decision = 'approved') where id = p_user_id and not is_host;
  else
    update public.verifications set
      licence_status = p_decision,
      licence_reason = case when p_decision = 'rejected' then v_reason else null end,
      licence_reviewed_at = now(),
      status = p_decision,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where user_id = p_user_id;
  end if;

  insert into public.verification_events (user_id, kind, action, reason, actor_id)
  values (p_user_id, p_kind, p_decision, case when p_decision = 'rejected' then v_reason end, auth.uid());

  if p_decision = 'approved' then
    v_msg := public.cx_text('verif_ok_' || p_kind, v_lang);
  else
    v_msg := public.cx_text('msg_verif_no_' || p_kind, v_lang, v_reason);
  end if;
  perform public.send_cx_message(p_user_id, v_msg);

  perform public.create_app_notification(
    p_user_id,
    case when p_decision = 'approved' then 'verification_approved' else 'verification_rejected' end,
    public.cx_text('n_verif_' || case when p_decision = 'approved' then 'ok_' else 'no_' end || p_kind || '_t', v_lang),
    case when p_decision = 'approved' then public.cx_text('n_verif_ok_' || p_kind || '_b', v_lang) else v_reason end,
    case when p_kind = 'identity' then '/settings#verification' else '/settings#licence' end,
    true
  );
end;
$$;

create or replace function public.review_listing(p_car_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_label text;
  v_lang text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision'; end if;
  if p_decision = 'rejected' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Say what needs to change';
  end if;

  select host_id, make || ' ' || model into v_host, v_label from public.cars where id = p_car_id;
  if v_host is null then raise exception 'Listing not found'; end if;
  v_lang := public.user_lang(v_host);

  perform set_config('cx.car_review', 'on', true);
  if p_decision = 'approved' then
    update public.cars set status = 'published', review_status = 'approved', reviewed_by = auth.uid(), publish_at = now(),
           review_note = null, review_claimed_at = null where id = p_car_id;
    perform public.send_cx_message(v_host, public.cx_text('listing_live_msg', v_lang, v_label));
    perform public.create_app_notification(v_host, 'listing_live', public.cx_text('listing_live_t', v_lang, v_label), public.cx_text('listing_live_b', v_lang), '/host#cars', true);
  else
    update public.cars set status = 'draft', review_status = 'rejected', reviewed_by = auth.uid(),
           review_note = v_reason, review_claimed_at = null, publish_at = null where id = p_car_id;
    perform public.send_cx_message(v_host, public.cx_text('listing_no_msg', v_lang, v_label, v_reason));
    perform public.create_app_notification(v_host, 'listing_rejected', public.cx_text('listing_no_t', v_lang, v_label), v_reason, '/host#cars', true);
  end if;
end;
$$;

create or replace function public.promote_due_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  perform set_config('cx.car_review', 'on', true);
  with promoted as (
    update public.cars
       set status = 'published', review_status = 'approved'
     where review_status = 'pending'
       and publish_at is not null
       and publish_at <= now()
       and (review_claimed_at is null or review_claimed_at < now() - interval '10 minutes')
    returning host_id, make, model
  )
  insert into public.app_notifications (user_id, kind, title, body, url, skip_push)
  select host_id, 'listing_live',
         public.cx_text('listing_live_t', public.user_lang(host_id), make || ' ' || model),
         public.cx_text('listing_live_b', public.user_lang(host_id)),
         '/host#cars', false
  from promoted;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.notify_host_of_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_label text;
begin
  select host_id, make || ' ' || model into v_host, v_label from public.cars where id = new.car_id;
  if v_host is null or (new.author_id is not null and v_host = new.author_id) then
    return new;
  end if;
  perform public.create_app_notification(
    v_host, 'review_new',
    public.cx_text('review_new_t', public.user_lang(v_host), trim(to_char(new.rating, 'FM9.9')), v_label),
    left(coalesce(new.body, ''), 140),
    '/host#cars', false
  );
  return new;
exception when others then
  return new;
end;
$$;
