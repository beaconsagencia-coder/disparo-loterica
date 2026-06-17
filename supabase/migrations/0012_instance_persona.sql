-- =====================================================================
-- 0012 · Nome do atendente por chip (teste A/B de persona)
-- ---------------------------------------------------------------------
-- Cada instância (chip) pode ter um nome de atendente próprio. O SDR usa
-- esse nome ao se apresentar nas conversas que entram por aquele chip.
-- Vazio (null) => usa o nome global do SDR (ai_config.persona_nome).
-- =====================================================================
alter table public.whatsapp_instances
  add column if not exists persona_nome text;

comment on column public.whatsapp_instances.persona_nome is
  'Nome do atendente/persona usado pelo SDR neste chip (teste A/B). Vazio = usa o nome global do SDR.';
