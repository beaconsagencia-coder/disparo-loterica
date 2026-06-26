-- =====================================================================
-- 0042 · Alfred: fase do contrato (Onboarding × Manutenção) + ativos
-- ---------------------------------------------------------------------
-- Depois do 1º mês o cronograma perde o protagonismo: o cliente passa a
-- perguntar sobre a OPERAÇÃO viva (campanhas no ar, criativos, anúncios).
--   • alfred_groups.fase_override : trava a fase (null = automático por idade).
--   • alfred_assets               : campanhas/criativos com estado e linhagem
--                                   (ativa → pausada → substituída por outra).
-- A fase EFETIVA é calculada na aplicação: override, ou idade do grupo
-- (>= 30 dias = manutenção). Aqui só guardamos o override e os ativos.
-- =====================================================================

-- 1) Fase do contrato por grupo (override manual; null = automático) -----
alter table public.alfred_groups
  add column if not exists fase_override text
    check (fase_override is null or fase_override in ('onboarding', 'manutencao'));

-- 2) Ativos operacionais do cliente (campanhas, criativos, anúncios) -----
create table if not exists public.alfred_assets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  group_id        uuid not null references public.alfred_groups(id) on delete cascade,
  titulo          text not null,                       -- nome da campanha/criativo
  tipo            text not null default 'campanha',    -- campanha | criativo | anuncio | outro
  status          text not null default 'ativa',       -- ativa | pausada | encerrada | substituida
  descricao       text,
  substituida_por uuid references public.alfred_assets(id) on delete set null, -- linhagem
  started_at      date,
  ended_at        date,
  origem          text not null default 'chat',        -- chat | manual
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint alfred_assets_status_chk check (status in ('ativa', 'pausada', 'encerrada', 'substituida')),
  constraint alfred_assets_tipo_chk   check (tipo   in ('campanha', 'criativo', 'anuncio', 'outro'))
);
create index if not exists idx_alfred_assets_group on public.alfred_assets(group_id, status);

drop trigger if exists trg_alfred_assets_updated on public.alfred_assets;
create trigger trg_alfred_assets_updated
  before update on public.alfred_assets
  for each row execute function public.set_updated_at();

alter table public.alfred_assets enable row level security;
drop policy if exists "alfred_assets_owner" on public.alfred_assets;
create policy "alfred_assets_owner" on public.alfred_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='alfred_assets') then
    execute 'alter publication supabase_realtime add table public.alfred_assets';
  end if;
end $$;
