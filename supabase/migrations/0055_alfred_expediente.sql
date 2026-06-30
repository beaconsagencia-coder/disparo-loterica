-- =====================================================================
-- 0055 · Alfred: horário de atendimento (expediente)
-- ---------------------------------------------------------------------
-- O Alfred só responde mensagens dentro dos dias/horários configurados.
-- Mensagens recebidas fora do expediente ficam RETIDAS e são respondidas
-- quando o horário abre (sem mensagem automática de ausência).
--   • expediente_ativo  : liga/desliga a restrição de horário.
--   • expediente_dias   : dias da semana que atende (0=dom .. 6=sáb).
--   • expediente_inicio / expediente_fim : faixa de horas (Brasília, 0-23).
-- =====================================================================
alter table public.alfred_configs
  add column if not exists expediente_ativo  boolean not null default false,
  add column if not exists expediente_dias   integer[] not null default '{1,2,3,4,5}',
  add column if not exists expediente_inicio integer not null default 8,
  add column if not exists expediente_fim    integer not null default 18;
