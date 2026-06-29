-- =====================================================================
-- 0051 · Alfred × Financeiro: vincular grupo a um contrato/fatura
-- ---------------------------------------------------------------------
-- O Alfred passa a fazer a cobrança DENTRO do grupo do cliente e a tirar
-- dúvidas sobre a fatura (valor, vencimento, pago/pendente, PIX).
--   • alfred_groups.contract_id : contrato vinculado (1 grupo → 1 contrato).
--     Contratos vinculados a um grupo são PULADOS pelo billing-reminder
--     (PIX direto no privado) para não cobrar em dobro.
--   • invoices.alfred_lembrete_at / alfred_dia_at / alfred_atraso_at :
--     idempotência das 3 cobranças do Alfred (antes / no dia / atraso).
-- =====================================================================
alter table public.alfred_groups
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create index if not exists alfred_groups_contract_id_idx on public.alfred_groups(contract_id);

alter table public.invoices
  add column if not exists alfred_lembrete_at timestamptz,
  add column if not exists alfred_dia_at      timestamptz,
  add column if not exists alfred_atraso_at   timestamptz;
