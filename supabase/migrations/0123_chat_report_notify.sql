-- 0123 — Tell the team the moment a chat message is reported.
--
-- Every time a row lands in chat_reports, the Owner and each admin get an update in their inbox (and the
-- usual push, through create_app_notification) that opens the Reports tab of Admin.
-- (The Admin page opens on the tab named in the link's #hash.)

insert into public.cx_texts (key, lang, body) values
  ('chat_report_t', 'en', 'A chat message was reported'),
  ('chat_report_t', 'it', 'Un messaggio in chat è stato segnalato'),
  ('chat_report_t', 'ro', 'Un mesaj din chat a fost raportat'),
  ('chat_report_t', 'es', 'Se denunció un mensaje del chat'),
  ('chat_report_b', 'en', 'Open Admin → Reports to review it.'),
  ('chat_report_b', 'it', 'Apri Admin → Segnalazioni per esaminarla.'),
  ('chat_report_b', 'ro', 'Deschide Admin → Rapoarte pentru a o revizui.'),
  ('chat_report_b', 'es', 'Abre Admin → Denuncias para revisarla.')
on conflict (key, lang) do nothing;

create or replace function public.notify_team_chat_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_lang text;
begin
  for r in select id from public.profiles where is_owner = true or is_admin = true loop
    -- the person who filed it is not told about their own report
    continue when r.id = new.reporter_id;
    v_lang := public.user_lang(r.id);
    perform public.create_app_notification(
      r.id, 'chat_report',
      public.cx_text('chat_report_t', v_lang),
      public.cx_text('chat_report_b', v_lang),
      '/admin#reports'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists chat_reports_notify_team on public.chat_reports;
create trigger chat_reports_notify_team
  after insert on public.chat_reports
  for each row execute function public.notify_team_chat_report();
