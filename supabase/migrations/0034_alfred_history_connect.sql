-- =====================================================================
-- 0034 · Alfred: histórico do grupo + chip dedicado (WhatsApp isolado)
-- ---------------------------------------------------------------------
-- - alfred_messages: histórico das conversas dos grupos (>=50 p/ a IA).
-- - alfred_configs ganha o chip PRÓPRIO do Alfred (instância + status),
--   separado dos chips de disparo (whatsapp_instances), para isolar.
-- =====================================================================

-- Chip dedicado do Alfred (não entra no round-robin de disparo).
alter table public.alfred_configs
  add column if not exists evolution_instance text,
  add column if not exists connection_status  text not null default 'desconectado', -- desconectado|conectando|conectado
  add column if not exists numero              text;

-- Histórico de mensagens dos grupos (alimenta o contexto da IA).
create table if not exists public.alfred_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  group_id    uuid not null references public.alfred_groups(id) on delete cascade,
  remote_jid  text not null,
  role        text not null,                 -- 'user' (participantes) | 'model' (Alfred)
  sender_name text,                          -- pushName de quem falou (grupo tem vários)
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint alfred_messages_role_chk check (role in ('user', 'model'))
);
create index if not exists idx_alfred_messages_group on public.alfred_messages(group_id, created_at);

alter table public.alfred_messages enable row level security;
drop policy if exists "alfred_messages_owner" on public.alfred_messages;
create policy "alfred_messages_owner" on public.alfred_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
