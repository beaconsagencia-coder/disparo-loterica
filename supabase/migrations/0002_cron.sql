-- =====================================================================
-- Agendamento do dispatcher via Supabase Cron (pg_cron + pg_net)
-- ---------------------------------------------------------------------
-- Roda a cada 1 minuto. O rate limit de 30–45 min é controlado dentro
-- do dispatcher (next_allowed_send_at por instância), então rodar de
-- minuto em minuto é seguro: instâncias não elegíveis são ignoradas.
--
-- Antes de aplicar, configure as credenciais (uma vez):
--   select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
--   select vault.create_secret('SEU_DISPATCHER_CRON_SECRET', 'dispatcher_cron_secret');
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior, se existir (idempotente).
select cron.unschedule('dispatcher-tick')
where exists (select 1 from cron.job where jobname = 'dispatcher-tick');

select cron.schedule(
  'dispatcher-tick',
  '* * * * *', -- a cada minuto
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
