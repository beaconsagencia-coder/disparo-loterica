-- =====================================================================
-- 0020 · Limite de buscas (Google Places) por dia
-- ---------------------------------------------------------------------
-- Trava de custo: o usuário define quantas buscas de lotérica o sistema
-- pode fazer por dia. Ao atingir o teto, a extração pausa e retoma no
-- dia seguinte (sem estourar a cota grátis do Google). 0 = sem limite.
-- =====================================================================
alter table public.prospeccao_config
  add column if not exists buscas_max_dia   int  not null default 0,
  add column if not exists buscas_dia_count int  not null default 0,
  add column if not exists buscas_dia_data  date;
