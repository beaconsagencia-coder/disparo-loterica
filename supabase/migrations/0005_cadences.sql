-- =====================================================================
-- Cadências (fluxos de follow-up com caminhos condicionais)
-- ---------------------------------------------------------------------
-- Uma cadência é uma sequência de passos. O passo 1 é a 1ª mensagem.
-- Cada passo seguinte só dispara SE o cliente NÃO respondeu até lá
-- (condição "ignorou"), após esperar X minutos. Se o cliente responde,
-- a cadência é interrompida (o atendente assume no CRM).
-- =====================================================================

-- Definição da cadência (o "molde" da campanha)
create table if not exists public.cadences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cadences_user on public.cadences(user_id);

-- Passos da cadência (ordenados). aguardar_minutos = espera ANTES deste
-- passo, contada a partir do envio do passo anterior. Passo 1 = 0.
create table if not exists public.cadence_steps (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  cadence_id       uuid not null references public.cadences(id) on delete cascade,
  ordem            int not null,
  spintax_template text not null,
  aguardar_minutos int not null default 1440,  -- padrão: 24h
  created_at       timestamptz not null default now(),
  unique (cadence_id, ordem)
);
create index if not exists idx_cadence_steps_cadence on public.cadence_steps(cadence_id, ordem);

-- Liga a fila de disparo à cadência: cada mensagem sabe de qual cadência
-- e qual passo ela é. cadence_id null = disparo único (comportamento antigo).
alter table public.message_queue
  add column if not exists cadence_id   uuid references public.cadences(id) on delete set null,
  add column if not exists cadence_step int;

-- RLS (mesmo padrão: dono da linha)
alter table public.cadences      enable row level security;
alter table public.cadence_steps enable row level security;

drop policy if exists "cadences_owner" on public.cadences;
create policy "cadences_owner" on public.cadences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cadence_steps_owner" on public.cadence_steps;
create policy "cadence_steps_owner" on public.cadence_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime para a tela de cadências refletir mudanças
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='cadences') then
    alter publication supabase_realtime add table public.cadences;
  end if;
end $$;
