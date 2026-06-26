-- =====================================================================
-- 0046 · Alfred: trava atômica de resposta (anti-resposta-dupla)
-- ---------------------------------------------------------------------
-- A idempotência de ENTRADA (0045) evita registrar a mesma mensagem 2x,
-- mas duas execuções concorrentes (retry/debounce/duplo dispositivo) ainda
-- podiam GERAR duas respostas. Aqui marcamos a mensagem do cliente como
-- "respondida": só quem conseguir setar answered_at (de nulo p/ agora) é que
-- responde — os demais desistem. É um lock atômico via UPDATE condicional.
-- =====================================================================
alter table public.alfred_messages
  add column if not exists answered_at timestamptz;
