-- =====================================================================
-- 0047 · Alfred: entender "responder a uma mensagem" (citação do WhatsApp)
-- ---------------------------------------------------------------------
-- Quando o cliente responde a uma mensagem específica (reply), o WhatsApp
-- manda a mensagem citada no payload (contextInfo.quotedMessage). Guardamos
-- o texto citado para o Alfred entender referências como "essa", "esse aí".
-- =====================================================================
alter table public.alfred_messages
  add column if not exists quoted_body text;
