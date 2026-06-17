-- =====================================================================
-- Aba de Campanhas: pausar/cancelar disparos + realtime no Inbox
-- =====================================================================

-- 1) Novos estados da fila para dar controle ao usuário.
--    O dispatcher só reivindica status='pendente' (RPC claim_next_message),
--    então 'pausado' e 'cancelado' são naturalmente ignorados — sem precisar
--    alterar o dispatcher.
alter type queue_status add value if not exists 'pausado';
alter type queue_status add value if not exists 'cancelado';

-- 2) Ligar o "tempo real" (realtime) nas tabelas que o app observa.
--    Sem isso, mensagens novas/recebidas e mudanças de status só apareciam
--    ao recarregar a página. Idempotente: só adiciona se ainda não estiver.
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'conversations', 'whatsapp_instances', 'message_queue']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
