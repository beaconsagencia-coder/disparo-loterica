-- =====================================================================
-- 0023 · Horários da confirmação de reunião configuráveis (aba Agenda)
-- ---------------------------------------------------------------------
-- Torna editável a regra antes fixa no código:
--   manhã  -> X horas antes (confirm_manha_horas)
--   tarde  -> horário fixo  (confirm_tarde_hora, ex: 09:00)
--   noite  -> horário fixo  (confirm_noite_hora, ex: 14:00)
-- confirm_ativo liga/desliga a confirmação antecipada.
-- =====================================================================
alter table public.agenda_settings
  add column if not exists confirm_ativo       boolean not null default true,
  add column if not exists confirm_manha_horas int     not null default 2,
  add column if not exists confirm_tarde_hora  text    not null default '09:00',
  add column if not exists confirm_noite_hora  text    not null default '14:00';
