-- =====================================================================
-- 0039 · Alfred: equipe por grupo + handoff humano com tempo de espera
-- ---------------------------------------------------------------------
-- O Alfred lê tudo (contexto) mas NUNCA responde à equipe; foco no cliente.
-- Regras de espera (configuráveis):
--   • equipe interagiu -> pausa team_cooldown_min (5) min;
--   • cliente sem resposta há intervene_after_min (30) min -> Alfred intervém;
--   • equipe resolveu antes disso -> bot fica calado.
-- A intervenção é avaliada por cron (alfred-tick), não em tempo real.
-- =====================================================================

-- Equipe (contatos) de cada grupo.
create table if not exists public.alfred_group_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.alfred_groups(id) on delete cascade,
  numero     text not null,                 -- dígitos E.164 (ex.: 5598999998888)
  nome       text,
  created_at timestamptz not null default now(),
  unique (group_id, numero)
);
create index if not exists idx_alfred_members_group on public.alfred_group_members(group_id);

-- Mensagens: quem enviou (equipe x cliente).
alter table public.alfred_messages
  add column if not exists is_team       boolean not null default false,
  add column if not exists sender_number text;

-- Tempos do handoff (por usuário) + chip e prompt já existentes.
alter table public.alfred_configs
  add column if not exists team_cooldown_min   int not null default 5,
  add column if not exists intervene_after_min int not null default 30;

-- Marcador do último aprendizado por grupo (para o cron consolidar em lote).
alter table public.alfred_groups
  add column if not exists last_learned_at timestamptz;

-- RLS
alter table public.alfred_group_members enable row level security;
drop policy if exists "alfred_members_owner" on public.alfred_group_members;
create policy "alfred_members_owner" on public.alfred_group_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='alfred_group_members') then
    execute 'alter publication supabase_realtime add table public.alfred_group_members';
  end if;
end $$;

-- Cron: avalia o handoff a cada 2 min (a função decide se intervém).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('alfred-tick')
where exists (select 1 from cron.job where jobname = 'alfred-tick');

select cron.schedule(
  'alfred-tick',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/alfred-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
