-- =====================================================================
-- 0035 · Alfred: contexto individual por empresa (cada grupo = 1 cliente)
-- ---------------------------------------------------------------------
-- Enriquece alfred_context com dados da empresa e regras de atendimento,
-- além do cronograma/financeiro/drive já existentes.
-- (As API Keys saíram do alfred_configs no app: o Alfred passa a usar a
--  MESMA chave do Agente SDR — o secret de ambiente GEMINI_API_KEY.)
-- =====================================================================
alter table public.alfred_context
  add column if not exists empresa_dados      text,   -- dados/descrição da empresa
  add column if not exists regras_atendimento text;   -- regras de atendimento do cliente
