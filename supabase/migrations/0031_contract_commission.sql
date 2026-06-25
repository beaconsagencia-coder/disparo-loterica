-- =====================================================================
-- 0031 · Comissionamento de contratos (vendedores / parceiros / indicação)
-- ---------------------------------------------------------------------
-- Campos OPCIONAIS. Quando has_commission = true, a comissão é deduzida do
-- valor do contrato para compor a RECEITA LÍQUIDA (MRR líquido, M+1, M+2).
--   commission_type:  'percentage' (% sobre o valor) | 'fixed' (R$/mês)
--   commission_value: a porcentagem (ex.: 10) ou o valor fixo mensal
-- =====================================================================
alter table public.contracts
  add column if not exists has_commission       boolean not null default false,
  add column if not exists commission_type      text,
  add column if not exists commission_value     numeric(12,2),
  add column if not exists commission_recipient text;

-- Tipo de comissão restrito (nulo quando não há comissão).
alter table public.contracts drop constraint if exists contracts_commission_type_chk;
alter table public.contracts add constraint contracts_commission_type_chk
  check (commission_type is null or commission_type in ('percentage', 'fixed'));
