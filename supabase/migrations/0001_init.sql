-- =====================================================================
-- Disparo Lotérica · Schema inicial
-- SaaS de disparo B2B via WhatsApp (Evolution API) + CRM unificado
-- =====================================================================
-- Convenções:
--  * Toda tabela é multi-tenant por user_id (dono da conta).
--  * RLS liga auth.uid() = user_id para acesso via cliente (anon key).
--  * As Edge Functions usam o service_role e ignoram RLS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type instance_status as enum ('desconectado', 'conectando', 'conectado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum (
    'novo',                 -- importado, ainda não enfileirado
    'na_fila',              -- mensagem pendente na message_queue
    'aguardando_resposta',  -- mensagem enviada, sem resposta
    'em_negociacao',        -- respondeu / conversa ativa
    'sem_whatsapp',         -- número inválido / sem WhatsApp
    'ganho',
    'perdido'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type queue_status as enum ('pendente', 'enviando', 'enviado', 'falha');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msg_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- whatsapp_instances : cada "chip" conectado via Evolution API
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_instances (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  nome                  text not null,                         -- rótulo amigável ("Chip 1")
  evolution_instance    text not null,                         -- nome da instância na Evolution API
  numero                text,                                  -- E.164 quando conhecido
  status                instance_status not null default 'desconectado',
  -- Controle do round-robin / rate limit
  last_message_sent_at  timestamptz,
  next_allowed_send_at   timestamptz,                          -- now + random(30..45)min após enviar
  daily_count           int not null default 0,                -- enviadas no dia (anti-ban extra)
  daily_count_date      date not null default (now() at time zone 'America/Sao_Paulo')::date,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (user_id, evolution_instance)
);

create index if not exists idx_instances_user on public.whatsapp_instances(user_id);
create index if not exists idx_instances_dispatch
  on public.whatsapp_instances(user_id, status, next_allowed_send_at);

-- ---------------------------------------------------------------------
-- leads : contatos prospectados (donos de lotéricas)
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  telefone    text not null,                  -- E.164 normalizado (ex: 5562999998888)
  empresa     text,
  status      lead_status not null default 'novo',
  origem      text default 'import',          -- import_csv, manual, etc.
  tags        text[] default '{}',
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, telefone)                  -- dedupe por conta
);

create index if not exists idx_leads_user_status on public.leads(user_id, status);
create index if not exists idx_leads_telefone on public.leads(telefone);

-- ---------------------------------------------------------------------
-- message_queue : fila de disparo (1 linha = 1 mensagem a enviar)
-- ---------------------------------------------------------------------
create table if not exists public.message_queue (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  instance_id      uuid references public.whatsapp_instances(id) on delete set null, -- definido ao enviar (round-robin)
  spintax_template text not null,             -- template bruto com {a|b|c}
  rendered_message text,                      -- resultado final após render (auditoria)
  status           queue_status not null default 'pendente',
  scheduled_for    timestamptz not null default now(),
  attempts         int not null default 0,
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

-- Índice usado pelo dispatcher para "pegar a próxima pendente" rapidamente
create index if not exists idx_queue_pending
  on public.message_queue(user_id, status, scheduled_for)
  where status = 'pendente';

-- ---------------------------------------------------------------------
-- conversations : 1 por (lead) — alimenta o Inbox unificado
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  lead_id              uuid not null references public.leads(id) on delete cascade,
  instance_id          uuid references public.whatsapp_instances(id) on delete set null, -- chip por onde a conversa entrou/saiu
  last_message_at      timestamptz,
  last_message_preview text,
  unread_count         int not null default 0,
  created_at           timestamptz not null default now(),
  unique (user_id, lead_id)
);

create index if not exists idx_conversations_inbox
  on public.conversations(user_id, last_message_at desc);

-- ---------------------------------------------------------------------
-- messages : histórico de chat (entrada e saída)
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  instance_id         uuid references public.whatsapp_instances(id) on delete set null,
  direction           msg_direction not null,
  body                text,
  evolution_message_id text,                  -- id remoto p/ dedupe de webhook
  status              text default 'sent',    -- sent, delivered, read, failed
  created_at          timestamptz not null default now(),
  unique (instance_id, evolution_message_id)
);

create index if not exists idx_messages_conversation
  on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------------
-- Trigger: manter conversations.* sincronizado ao inserir messages
-- ---------------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger language plpgsql as $$
begin
  update public.conversations c
     set last_message_at      = new.created_at,
         last_message_preview = left(coalesce(new.body, ''), 120),
         unread_count = case when new.direction = 'inbound'
                             then c.unread_count + 1 else c.unread_count end
   where c.id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------
-- Trigger: updated_at automático em leads
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_leads_updated on public.leads;
create trigger trg_leads_updated
  before update on public.leads
  for each row execute function public.set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.whatsapp_instances enable row level security;
alter table public.leads             enable row level security;
alter table public.message_queue     enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;

-- Helper macro: política "own row" para SELECT/INSERT/UPDATE/DELETE.
-- (Repetida por tabela porque o Postgres não tem macro nativa.)

-- whatsapp_instances
drop policy if exists "instances_owner" on public.whatsapp_instances;
create policy "instances_owner" on public.whatsapp_instances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- leads
drop policy if exists "leads_owner" on public.leads;
create policy "leads_owner" on public.leads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- message_queue
drop policy if exists "queue_owner" on public.message_queue;
create policy "queue_owner" on public.message_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- conversations
drop policy if exists "conversations_owner" on public.conversations;
create policy "conversations_owner" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages
drop policy if exists "messages_owner" on public.messages;
create policy "messages_owner" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- RPC ATÔMICO: claim_next_message
-- Usado pelo dispatcher. Seleciona e marca como 'enviando' a próxima
-- mensagem pendente de um usuário, com SKIP LOCKED para evitar corrida
-- entre execuções concorrentes do cron. Roda com service_role.
-- =====================================================================
create or replace function public.claim_next_message(p_user_id uuid, p_instance_id uuid)
returns public.message_queue
language plpgsql
as $$
declare
  v_row public.message_queue;
begin
  select * into v_row
    from public.message_queue
   where user_id = p_user_id
     and status = 'pendente'
     and scheduled_for <= now()
   order by scheduled_for asc, created_at asc
   for update skip locked
   limit 1;

  if not found then
    return null;
  end if;

  update public.message_queue
     set status = 'enviando',
         instance_id = p_instance_id,
         attempts = attempts + 1
   where id = v_row.id
   returning * into v_row;

  return v_row;
end $$;
