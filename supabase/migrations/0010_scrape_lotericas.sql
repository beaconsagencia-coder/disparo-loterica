-- =====================================================================
-- Extração assíncrona de lotéricas por micro-região (bairro a bairro)
-- - fila_bairros: fila de regiões a processar
-- - leads_lotericas: contatos extraídos e validados no WhatsApp
-- - claim_bairros(): reivindica um lote (SKIP LOCKED, à prova de corrida)
-- - cron: dispara a Edge Function scrape-lotericas em intervalos
-- =====================================================================

-- Fila de bairros a processar
create table if not exists public.fila_bairros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  bairro     text not null,
  cidade     text not null,
  estado     text not null,                         -- UF (ex: MA)
  status     text not null default 'pendente',      -- pendente | processando | concluido | erro
  erro       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_fila_bairros_status on public.fila_bairros(status, created_at);

-- Leads extraídos das lotéricas
create table if not exists public.leads_lotericas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  nome            text,
  telefone        text not null,                    -- 55DDDXXXXXYYYY
  status_validacao text not null default 'valido',  -- valido | sem_whatsapp
  bairro          text,
  cidade          text,
  estado          text,
  created_at      timestamptz not null default now(),
  unique (user_id, telefone)                        -- evita duplicar o mesmo contato
);
create index if not exists idx_leads_lotericas_user on public.leads_lotericas(user_id);

-- RLS (dono enxerga só os seus)
alter table public.fila_bairros    enable row level security;
alter table public.leads_lotericas enable row level security;

drop policy if exists "fila_bairros_owner" on public.fila_bairros;
create policy "fila_bairros_owner" on public.fila_bairros
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "leads_lotericas_owner" on public.leads_lotericas;
create policy "leads_lotericas_owner" on public.leads_lotericas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reivindica um lote de bairros pendentes de forma atômica (sem corrida
-- entre execuções sobrepostas do cron). Marca como 'processando' e retorna.
create or replace function public.claim_bairros(p_lote int)
returns setof public.fila_bairros
language sql
security definer
set search_path = public
as $$
  update public.fila_bairros f
  set status = 'processando'
  where f.id in (
    select id from public.fila_bairros
    where status = 'pendente'
    order by created_at
    limit p_lote
    for update skip locked
  )
  returning f.*;
$$;

-- Cron: dispara a Edge Function a cada 5 min (usa segredos do Vault)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('scrape-lotericas-tick')
where exists (select 1 from cron.job where jobname = 'scrape-lotericas-tick');

select cron.schedule(
  'scrape-lotericas-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/scrape-lotericas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
