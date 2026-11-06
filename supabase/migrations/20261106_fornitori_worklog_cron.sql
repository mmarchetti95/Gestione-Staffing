-- v18.251.0 — Giro automatico di jira-fornitori-worklog (vedi 20261106_fornitori_worklog.sql),
-- attivato dopo la prova in anteprima sui dati reali. Per fermarlo:
--   select cron.unschedule('fornitori_worklog');
-- Giro automatico ogni 15 minuti, lunedì–sabato, ~6–22 ora italiana (orari in UTC).
select cron.schedule('fornitori_worklog', '*/15 5-20 * * 1-6', $cron$
  select net.http_post(
    url := 'https://ypbuleyropgoqalwioqb.supabase.co/functions/v1/jira-fornitori-worklog',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'fornitori_wl_cron_token')),
    body := '{"origine":"cron"}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);
