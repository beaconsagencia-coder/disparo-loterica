-- =====================================================================
-- 0054 · Valor da venda na reunião (somatório de vendas do mês)
-- ---------------------------------------------------------------------
-- Ao marcar uma reunião como "fechou venda", o operador informa o valor
-- do plano vendido. A dashboard soma esses valores no mês corrente.
-- =====================================================================
alter table public.meetings
  add column if not exists valor_venda numeric;
