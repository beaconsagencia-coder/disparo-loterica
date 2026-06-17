-- =====================================================================
-- SDR com IA: delay humanizado + follow-up por inatividade
-- (a transcrição de áudio não precisa de schema — é feita pelo Gemini)
-- =====================================================================

alter table public.ai_config
  add column if not exists delay_min_seg            int not null default 3,   -- "digitando" mínimo
  add column if not exists delay_max_seg            int not null default 8,   -- "digitando" máximo
  add column if not exists followup_inatividade_min int not null default 30,  -- min de silêncio p/ cutucar
  add column if not exists followup_max             int not null default 2;   -- máx de follow-ups por conversa

-- Conta quantos follow-ups automáticos já mandamos nesta conversa (zera quando o cliente responde)
alter table public.conversations
  add column if not exists followup_count int not null default 0;

-- O gatilho de conversa passa a registrar a direção da última mensagem,
-- para o follow-up saber quando o BOT está esperando resposta.
alter table public.conversations
  add column if not exists last_direction text;

create or replace function public.touch_conversation()
returns trigger language plpgsql as $$
begin
  update public.conversations c
     set last_message_at      = new.created_at,
         last_message_preview = left(coalesce(new.body, ''), 120),
         last_direction       = new.direction::text,
         unread_count = case when new.direction = 'inbound'
                             then c.unread_count + 1 else c.unread_count end
   where c.id = new.conversation_id;
  return new;
end $$;

-- Agenda o follow-up de IA a cada 5 minutos (reusa o cofre do dispatcher).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ai-followup-tick')
where exists (select 1 from cron.job where jobname = 'ai-followup-tick');

select cron.schedule(
  'ai-followup-tick',
  '*/5 * * * *', -- a cada 5 minutos
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/ai-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
