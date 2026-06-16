-- =====================================================================
-- Camada extra anti-ban: teto diário de mensagens por chip
-- ---------------------------------------------------------------------
-- daily_limit: máximo de mensagens que UMA instância pode enviar por dia
-- (reset no fuso de São Paulo). O dispatcher pula instâncias que já
-- atingiram o teto, mesmo que a janela de 30–45 min já tenha vencido.
-- =====================================================================

alter table public.whatsapp_instances
  add column if not exists daily_limit int not null default 40;

-- Garante que o número de conexão capturado no CONNECTION_UPDATE persista.
-- (coluna `numero` já existe no 0001; aqui apenas documentamos o uso)
comment on column public.whatsapp_instances.numero is
  'E.164 do dono da instância, preenchido quando a Evolution envia connection.update state=open';
comment on column public.whatsapp_instances.daily_limit is
  'Teto anti-ban: máximo de envios por dia por chip (reset no fuso America/Sao_Paulo)';
