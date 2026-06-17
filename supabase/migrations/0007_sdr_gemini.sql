-- =====================================================================
-- SDR: troca o provedor de IA de Claude (Opus) para Google Gemini
-- ---------------------------------------------------------------------
-- Muda o modelo padrão e migra configs existentes que ainda apontavam
-- para um modelo Claude.
-- =====================================================================

alter table public.ai_config alter column model set default 'gemini-2.5-flash';

update public.ai_config
   set model = 'gemini-2.5-flash'
 where model is null or model not like 'gemini%';
