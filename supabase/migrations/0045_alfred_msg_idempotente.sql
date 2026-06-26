-- =====================================================================
-- 0045 · Alfred: idempotência das mensagens recebidas (anti-duplicação)
-- ---------------------------------------------------------------------
-- O webhook pode receber o MESMO evento duas vezes (retry de entrega ou
-- número compartilhado/multi-dispositivo). Guardamos o id da mensagem no
-- WhatsApp (key.id) e impedimos processar/responder a mesma mensagem 2x.
-- Mensagens do próprio Alfred (role=model) ficam com wa_message_id nulo.
-- =====================================================================
alter table public.alfred_messages
  add column if not exists wa_message_id text;

-- Único por grupo (ids do WhatsApp podem repetir entre grupos diferentes).
-- Parcial: ignora os nulos (respostas do Alfred), que não precisam de chave.
create unique index if not exists uq_alfred_messages_wa
  on public.alfred_messages (group_id, wa_message_id)
  where wa_message_id is not null;
