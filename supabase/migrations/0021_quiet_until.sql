-- =====================================================================
-- 0021 · Período de silêncio por conversa (auto-reply fora do horário)
-- ---------------------------------------------------------------------
-- Quando o cliente responde com um auto-reply de "fora do horário /
-- fechado", marcamos quiet_until = próximo dia útil. O bot não cutuca
-- antes disso; ao passar, o follow-up retoma o contato naturalmente.
-- =====================================================================
alter table public.conversations
  add column if not exists quiet_until timestamptz;

create index if not exists idx_conversations_quiet on public.conversations(quiet_until)
  where quiet_until is not null;
