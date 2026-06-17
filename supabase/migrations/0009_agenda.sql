-- =====================================================================
-- Agenda do SDR: disponibilidade, bloqueios fixos, painel e lembrete
-- ---------------------------------------------------------------------
-- - agenda_settings: horário de atendimento + link fixo da reunião
-- - agenda_blocks: compromissos fixos semanais (horários bloqueados)
-- - meetings: ganha link, duração e flag de lembrete enviado
-- - cron: envia o link 15 min antes (função meeting-reminder)
-- =====================================================================

-- Configuração de disponibilidade (1 por usuário)
create table if not exists public.agenda_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  meet_link   text not null default '',                  -- link fixo (Meet/Zoom/sala)
  dias        int[] not null default '{0,1,2,3,4,5,6}',  -- 0=domingo ... 6=sábado
  inicio      text not null default '08:00',             -- início do atendimento
  fim         text not null default '22:00',             -- fim do atendimento
  duracao_min int not null default 30,                   -- duração padrão da reunião
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)
);

-- Compromissos fixos semanais (bloqueiam o agendamento)
create table if not exists public.agenda_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  dia_semana  int not null,            -- 0=domingo ... 6=sábado
  hora_inicio text not null,           -- "12:00"
  hora_fim    text not null,           -- "13:00"
  titulo      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_agenda_blocks_user on public.agenda_blocks(user_id, dia_semana);

-- Reuniões: link, duração e controle do lembrete
alter table public.meetings
  add column if not exists meet_link     text,
  add column if not exists duracao_min   int not null default 30,
  add column if not exists reminder_sent boolean not null default false;

create index if not exists idx_meetings_reminder
  on public.meetings(scheduled_for) where status = 'agendada' and reminder_sent = false;

-- RLS
alter table public.agenda_settings enable row level security;
alter table public.agenda_blocks   enable row level security;

drop policy if exists "agenda_settings_owner" on public.agenda_settings;
create policy "agenda_settings_owner" on public.agenda_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "agenda_blocks_owner" on public.agenda_blocks;
create policy "agenda_blocks_owner" on public.agenda_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_agenda_settings_updated on public.agenda_settings;
create trigger trg_agenda_settings_updated
  before update on public.agenda_settings
  for each row execute function public.set_updated_at();

-- Realtime para o painel
do $$
declare t text;
begin
  foreach t in array array['agenda_settings','agenda_blocks'] loop
    if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Cron: lembrete 15 min antes (a cada minuto)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('meeting-reminder-tick')
where exists (select 1 from cron.job where jobname = 'meeting-reminder-tick');

select cron.schedule(
  'meeting-reminder-tick',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/meeting-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
