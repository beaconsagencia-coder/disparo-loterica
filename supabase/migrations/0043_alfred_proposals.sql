-- =====================================================================
-- 0043 · Alfred: proposta/plano contratado por cliente (1 por grupo)
-- ---------------------------------------------------------------------
-- As condições de negociação variam por cliente: valor mensal, setup,
-- vigência, forma de pagamento e ENTREGÁVEIS incluídos. O Alfred usa isso
-- para responder "quanto pago?" e "o que está no meu pacote?".
-- =====================================================================
create table if not exists public.alfred_proposals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  group_id        uuid not null references public.alfred_groups(id) on delete cascade,
  valor_mensal    numeric(12,2),
  valor_setup     numeric(12,2),
  vigencia_meses  integer,
  forma_pagamento text,
  entregaveis     jsonb not null default '[]'::jsonb,  -- lista de strings
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (group_id)
);

drop trigger if exists trg_alfred_proposals_updated on public.alfred_proposals;
create trigger trg_alfred_proposals_updated
  before update on public.alfred_proposals
  for each row execute function public.set_updated_at();

alter table public.alfred_proposals enable row level security;
drop policy if exists "alfred_proposals_owner" on public.alfred_proposals;
create policy "alfred_proposals_owner" on public.alfred_proposals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='alfred_proposals') then
    execute 'alter publication supabase_realtime add table public.alfred_proposals';
  end if;
end $$;
