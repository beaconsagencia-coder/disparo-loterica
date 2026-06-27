-- =====================================================================
-- 0049 · Alfred: acompanhamento diário PROATIVO do cliente
-- ---------------------------------------------------------------------
-- O Alfred passa a INICIAR a conversa: 1x por dia, num horário, ele dá um
-- update do andamento, cobra pendências (acessos/configs que faltam) ou só
-- confirma que está tudo seguindo o cronograma.
--   • alfred_configs.proactive_ativo / proactive_hora : liga/desliga + hora.
--   • alfred_groups.last_proactive_at                 : controla 1x/dia.
-- =====================================================================
alter table public.alfred_configs
  add column if not exists proactive_ativo boolean not null default true,
  add column if not exists proactive_hora  integer not null default 9; -- hora (0-23), fuso de Brasília

alter table public.alfred_groups
  add column if not exists last_proactive_at timestamptz;
