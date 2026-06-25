-- =====================================================================
-- 0030 · Gestão Financeira: contratos de clientes da agência
-- ---------------------------------------------------------------------
-- Base para previsibilidade de caixa (MRR, M+1, M+2) e churn.
-- O cálculo de vigência por mês é feito no cliente (reativo ao status),
-- mas o banco guarda os dados crus: valor, duração e data de início.
-- =====================================================================
create table if not exists public.contracts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  client_name    text not null,
  contract_value numeric(12,2) not null default 0,   -- valor mensal (MRR por contrato)
  duration_months int not null default 12,           -- nº de parcelas a partir do mês de início
  payer_contact  text,                                -- WhatsApp/e-mail do pagador
  due_date_day   int not null default 5,              -- dia do vencimento (1–31)
  status         text not null default 'active',      -- active | cancelled | completed
  start_date     date not null default current_date,  -- início da vigência
  cancelled_at   timestamptz,                         -- quando virou churn (relatórios)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint contracts_status_chk   check (status in ('active', 'cancelled', 'completed')),
  constraint contracts_due_day_chk  check (due_date_day between 1 and 31),
  constraint contracts_duration_chk check (duration_months >= 1)
);

create index if not exists idx_contracts_user_status on public.contracts(user_id, status);

-- updated_at automático (reutiliza a função criada em 0001).
drop trigger if exists trg_contracts_updated on public.contracts;
create trigger trg_contracts_updated
  before update on public.contracts
  for each row execute function public.set_updated_at();

-- RLS: cada conta só enxerga os próprios contratos.
alter table public.contracts enable row level security;
drop policy if exists "contracts_owner" on public.contracts;
create policy "contracts_owner" on public.contracts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: o dashboard recalcula na hora ao inserir/cancelar.
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contracts') then
    execute 'alter publication supabase_realtime add table public.contracts';
  end if;
end $$;
