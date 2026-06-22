-- =====================================================================
-- 0025 · Motivo da espera (quiet_reason) na conversa
-- ---------------------------------------------------------------------
-- Diferencia o tipo de pausa para escolher o TOM da retomada:
--   'deferral' -> cliente pediu para retornar depois (semana corrida);
--                 retoma em 2 dias com tom compreensivo.
-- (auto-reply de horário continua usando só quiet_until.)
-- =====================================================================
alter table public.conversations
  add column if not exists quiet_reason text;
