-- =====================================================================
-- 0026 · Fragmentação de mensagens longas (não estourar o teto anti-spam)
-- ---------------------------------------------------------------------
-- Uma resposta longa do bot é enviada em 2–3 bolhas. As bolhas seguintes
-- (continuações) NÃO contam como mensagens novas no teto de follow-up:
-- só a 1ª bolha de cada "turno" é contada.
-- =====================================================================
alter table public.messages
  add column if not exists is_continuation boolean not null default false;
