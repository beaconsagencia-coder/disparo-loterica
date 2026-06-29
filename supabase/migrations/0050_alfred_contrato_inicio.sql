-- =====================================================================
-- 0050 · Alfred: data de início do contrato (independente do cadastro)
-- ---------------------------------------------------------------------
-- A fase (onboarding/manutenção) e a SEMANA do cronograma eram calculadas
-- pela data em que o grupo foi cadastrado (created_at). Se o grupo é
-- adicionado dias depois do contrato começar, a contagem fica defasada.
--   • alfred_groups.contrato_inicio : data real de início do contrato.
--     Quando NULL, o cálculo cai em created_at (comportamento anterior).
-- =====================================================================
alter table public.alfred_groups
  add column if not exists contrato_inicio date;
