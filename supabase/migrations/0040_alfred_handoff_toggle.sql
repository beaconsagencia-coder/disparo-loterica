-- =====================================================================
-- 0040 · Alfred: liga/desliga o modo handoff (cron)
-- ---------------------------------------------------------------------
-- handoff_ativo = true  -> o cron alfred-tick espera a equipe e só intervém
--                          após o prazo (comportamento atual).
-- handoff_ativo = false -> o Alfred responde NA HORA pelo webhook (mas nunca
--                          responde a um membro da equipe).
-- O aprendizado contínuo segue rodando no cron nos dois modos.
-- =====================================================================
alter table public.alfred_configs
  add column if not exists handoff_ativo boolean not null default true;
