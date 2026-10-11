-- Push for every SIGNAL event (Respect, comment, share, save, follow, request, accepted, Circle,
-- collab, Spotlight, sponsorship) — not only messages. Written in the recipient's language, and it
-- names the person only when they are connected (same privacy rule as the notifications list).
--
-- Needs the one-off setup in NOTIFICHE-CHIAVI.local.txt (a row in notify_config + NOTIFY_FANOUT_SECRET
-- on Vercel). Without it these events still land in the bell exactly as before.

do $$ begin create extension if not exists pg_net; exception when others then null; end $$;

alter table public.notifications add column if not exists last_pushed_at timestamptz;

insert into public.cx_texts (key, lang, body) values
  ('sig_follow', 'en', '{a} started following you'),
  ('sig_follow', 'it', '{a} ha iniziato a seguirti'),
  ('sig_follow', 'ro', '{a} a început să te urmărească'),
  ('sig_follow', 'es', '{a} ha empezado a seguirte'),
  ('sig_follow_anon', 'en', 'Someone started following you'),
  ('sig_follow_anon', 'it', 'Qualcuno ha iniziato a seguirti'),
  ('sig_follow_anon', 'ro', 'Cineva a început să te urmărească'),
  ('sig_follow_anon', 'es', 'Alguien ha empezado a seguirte'),
  ('sig_follow_request', 'en', '{a} asked to follow you'),
  ('sig_follow_request', 'it', '{a} ha chiesto di seguirti'),
  ('sig_follow_request', 'ro', '{a} a cerut să te urmărească'),
  ('sig_follow_request', 'es', '{a} ha pedido seguirte'),
  ('sig_follow_request_anon', 'en', 'Someone asked to follow you'),
  ('sig_follow_request_anon', 'it', 'Qualcuno ha chiesto di seguirti'),
  ('sig_follow_request_anon', 'ro', 'Cineva a cerut să te urmărească'),
  ('sig_follow_request_anon', 'es', 'Alguien ha pedido seguirte'),
  ('sig_follow_accepted', 'en', '{a} accepted your request'),
  ('sig_follow_accepted', 'it', '{a} ha accettato la tua richiesta'),
  ('sig_follow_accepted', 'ro', '{a} ți-a acceptat cererea'),
  ('sig_follow_accepted', 'es', '{a} ha aceptado tu solicitud'),
  ('sig_follow_accepted_anon', 'en', 'Your request was accepted'),
  ('sig_follow_accepted_anon', 'it', 'La tua richiesta è stata accettata'),
  ('sig_follow_accepted_anon', 'ro', 'Cererea ta a fost acceptată'),
  ('sig_follow_accepted_anon', 'es', 'Tu solicitud fue aceptada'),
  ('sig_circle', 'en', 'You and {a} are now in CX Circle'),
  ('sig_circle', 'it', 'Tu e {a} siete ora nel CX Circle'),
  ('sig_circle', 'ro', 'Tu și {a} sunteți acum în CX Circle'),
  ('sig_circle', 'es', 'Tú y {a} ya estáis en CX Circle'),
  ('sig_circle_anon', 'en', 'You are now in CX Circle'),
  ('sig_circle_anon', 'it', 'Ora sei nel CX Circle'),
  ('sig_circle_anon', 'ro', 'Ești acum în CX Circle'),
  ('sig_circle_anon', 'es', 'Ya estás en CX Circle'),
  ('sig_respect', 'en', '{a} respected your post'),
  ('sig_respect', 'it', '{a} ha dato Respect al tuo post'),
  ('sig_respect', 'ro', '{a} a dat Respect postării tale'),
  ('sig_respect', 'es', '{a} ha dado Respect a tu publicación'),
  ('sig_respect_anon', 'en', 'Your post received a new Respect'),
  ('sig_respect_anon', 'it', 'Il tuo post ha ricevuto un nuovo Respect'),
  ('sig_respect_anon', 'ro', 'Postarea ta a primit un Respect nou'),
  ('sig_respect_anon', 'es', 'Tu publicación recibió un nuevo Respect'),
  ('sig_respect_many', 'en', 'Your post received {b} new Respects'),
  ('sig_respect_many', 'it', 'Il tuo post ha ricevuto {b} nuovi Respect'),
  ('sig_respect_many', 'ro', 'Postarea ta a primit {b} Respect-uri noi'),
  ('sig_respect_many', 'es', 'Tu publicación recibió {b} Respect nuevos'),
  ('sig_comment', 'en', '{a} commented on your post'),
  ('sig_comment', 'it', '{a} ha commentato il tuo post'),
  ('sig_comment', 'ro', '{a} a comentat postarea ta'),
  ('sig_comment', 'es', '{a} ha comentado tu publicación'),
  ('sig_comment_anon', 'en', 'Your post received a comment'),
  ('sig_comment_anon', 'it', 'Il tuo post ha ricevuto un commento'),
  ('sig_comment_anon', 'ro', 'Postarea ta a primit un comentariu'),
  ('sig_comment_anon', 'es', 'Tu publicación recibió un comentario'),
  ('sig_share', 'en', '{a} shared your post'),
  ('sig_share', 'it', '{a} ha condiviso il tuo post'),
  ('sig_share', 'ro', '{a} ți-a distribuit postarea'),
  ('sig_share', 'es', '{a} ha compartido tu publicación'),
  ('sig_share_anon', 'en', 'Your post was shared'),
  ('sig_share_anon', 'it', 'Il tuo post è stato condiviso'),
  ('sig_share_anon', 'ro', 'Postarea ta a fost distribuită'),
  ('sig_share_anon', 'es', 'Tu publicación fue compartida'),
  ('sig_save', 'en', '{a} saved your post'),
  ('sig_save', 'it', '{a} ha salvato il tuo post'),
  ('sig_save', 'ro', '{a} ți-a salvat postarea'),
  ('sig_save', 'es', '{a} ha guardado tu publicación'),
  ('sig_save_anon', 'en', 'Your post was saved'),
  ('sig_save_anon', 'it', 'Il tuo post è stato salvato'),
  ('sig_save_anon', 'ro', 'Postarea ta a fost salvată'),
  ('sig_save_anon', 'es', 'Tu publicación fue guardada'),
  ('sig_collab_invite', 'en', '{a} invited you to collaborate'),
  ('sig_collab_invite', 'it', '{a} ti ha invitato a collaborare'),
  ('sig_collab_invite', 'ro', '{a} te-a invitat să colaborezi'),
  ('sig_collab_invite', 'es', '{a} te ha invitado a colaborar'),
  ('sig_collab_invite_anon', 'en', 'You were invited to collaborate'),
  ('sig_collab_invite_anon', 'it', 'Sei stato invitato a collaborare'),
  ('sig_collab_invite_anon', 'ro', 'Ai fost invitat să colaborezi'),
  ('sig_collab_invite_anon', 'es', 'Te han invitado a colaborar'),
  ('sig_collab_left', 'en', 'A collaborator left the collaboration'),
  ('sig_collab_left', 'it', 'Un collaboratore ha lasciato la collaborazione'),
  ('sig_collab_left', 'ro', 'Un colaborator a părăsit colaborarea'),
  ('sig_collab_left', 'es', 'Un colaborador dejó la colaboración'),
  ('sig_vision_selected', 'en', 'Your Vision was selected for Signal Spotlight'),
  ('sig_vision_selected', 'it', 'La tua Vision è stata scelta per Signal Spotlight'),
  ('sig_vision_selected', 'ro', 'Vision-ul tău a fost ales pentru Signal Spotlight'),
  ('sig_vision_selected', 'es', 'Tu Vision fue elegida para Signal Spotlight'),
  ('sig_vision_featured', 'en', 'Your Vision is now featured on Signal Spotlight'),
  ('sig_vision_featured', 'it', 'La tua Vision è ora in evidenza su Signal Spotlight'),
  ('sig_vision_featured', 'ro', 'Vision-ul tău este acum prezentat în Signal Spotlight'),
  ('sig_vision_featured', 'es', 'Tu Vision ya está destacada en Signal Spotlight'),
  ('sig_ad_approved', 'en', 'Your sponsorship is live'),
  ('sig_ad_approved', 'it', 'La tua sponsorizzazione è attiva'),
  ('sig_ad_approved', 'ro', 'Sponsorizarea ta este activă'),
  ('sig_ad_approved', 'es', 'Tu patrocinio está activo'),
  ('sig_ad_rejected', 'en', 'Your sponsorship was not approved — you were refunded'),
  ('sig_ad_rejected', 'it', 'La tua sponsorizzazione non è stata approvata: sei stato rimborsato'),
  ('sig_ad_rejected', 'ro', 'Sponsorizarea ta nu a fost aprobată — ai fost rambursat'),
  ('sig_ad_rejected', 'es', 'Tu patrocinio no fue aprobado: te hemos reembolsado')
on conflict (key, lang) do update set body = excluded.body;

-- The 0110 trigger could not know the actor (it lives in notification_actors); replaced below.
drop trigger if exists signal_notifications_fanout on public.notifications;
drop function if exists public.fanout_signal_notification();

create or replace function public.push_signal_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n record;
  cfg record;
  v_actor uuid;
  v_name text;
  v_lang text;
  v_visible boolean;
  v_key text;
  v_title text;
begin
  select * into n from public.notifications where id = p_id;
  if not found then return; end if;

  -- a burst of Respects / comments on one post is one buzz, not twenty
  if n.last_pushed_at is not null and n.last_pushed_at > now() - interval '3 minutes' then return; end if;

  select url, secret into cfg from public.notify_config limit 1;
  if cfg.url is null then return; end if;

  select actor_id into v_actor from public.notification_actors where notification_id = p_id;
  v_visible := v_actor is not null and (
    n.type = 'follow'
    or exists (
      select 1 from public.profile_follows f
      where (f.follower_id = n.recipient_id and f.followee_id = v_actor)
         or (f.follower_id = v_actor and f.followee_id = n.recipient_id)
    )
  );
  select full_name into v_name from public.profiles where id = v_actor;
  v_lang := public.user_lang(n.recipient_id);

  v_key := case n.type
    when 'follow' then case when v_visible then 'sig_follow' else 'sig_follow_anon' end
    when 'follow_request' then case when v_visible then 'sig_follow_request' else 'sig_follow_request_anon' end
    when 'follow_accepted' then case when v_visible then 'sig_follow_accepted' else 'sig_follow_accepted_anon' end
    when 'circle' then case when v_visible then 'sig_circle' else 'sig_circle_anon' end
    when 'post_respect' then case when coalesce(n.count, 1) > 1 then 'sig_respect_many' when v_visible then 'sig_respect' else 'sig_respect_anon' end
    when 'post_comment' then case when v_visible then 'sig_comment' else 'sig_comment_anon' end
    when 'post_share' then case when v_visible then 'sig_share' else 'sig_share_anon' end
    when 'post_save' then case when v_visible then 'sig_save' else 'sig_save_anon' end
    when 'collab_invite' then case when v_visible then 'sig_collab_invite' else 'sig_collab_invite_anon' end
    when 'collab_left' then 'sig_collab_left'
    when 'vision_selected' then 'sig_vision_selected'
    when 'vision_featured' then 'sig_vision_featured'
    when 'ad_approved' then 'sig_ad_approved'
    when 'ad_rejected' then 'sig_ad_rejected'
    else null
  end;
  if v_key is null then return; end if;

  v_title := public.cx_text(v_key, v_lang, coalesce(v_name, ''), coalesce(n.count, 1)::text);

  update public.notifications set last_pushed_at = now() where id = p_id;

  begin
    perform net.http_post(
      url := cfg.url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cx-secret', cfg.secret),
      body := jsonb_build_object('type', 'fanout', 'userId', n.recipient_id, 'title', v_title, 'body', '', 'url', '/notifications')
    );
  exception when others then
    null; -- a push must never fail the action that caused it
  end;
end;
$$;
revoke all on function public.push_signal_notification(uuid) from public;

create or replace function public.trg_push_signal_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.push_signal_notification(new.notification_id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notification_actors_push on public.notification_actors;
create trigger notification_actors_push
  after insert or update on public.notification_actors
  for each row execute function public.trg_push_signal_actor();

-- events with no person behind them (Spotlight, sponsorship, a collaborator leaving)
create or replace function public.trg_push_signal_system()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.push_signal_notification(new.id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notifications_push_system on public.notifications;
create trigger notifications_push_system
  after insert on public.notifications
  for each row
  when (new.type in ('vision_selected', 'vision_featured', 'ad_approved', 'ad_rejected', 'collab_left'))
  execute function public.trg_push_signal_system();
