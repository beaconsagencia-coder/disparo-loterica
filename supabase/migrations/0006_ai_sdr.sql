-- =====================================================================
-- SDR com IA (Claude): conduz a conversa, qualifica e agenda reuniões
-- ---------------------------------------------------------------------
-- A IA responde automaticamente as conversas (quando ligada) seguindo
-- um "playbook" (a copy do usuário). Quando o cliente combina um horário,
-- a IA chama a ferramenta agendar_reuniao -> grava em `meetings`.
-- O atendente pode assumir manualmente a qualquer momento.
-- =====================================================================

-- Configuração do SDR de IA (1 por usuário)
create table if not exists public.ai_config (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  ativo        boolean not null default false,         -- liga/desliga o SDR globalmente
  persona_nome text not null default 'Pedro',          -- como a IA se apresenta
  empresa      text not null default 'Chamada Beacons', -- empresa do remetente
  model        text not null default 'claude-opus-4-8', -- modelo Claude
  playbook     text not null,                           -- a copy / roteiro (system prompt)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id)
);

-- Reuniões agendadas pela IA
create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  quando_texto    text not null,                  -- horário combinado em linguagem natural
  scheduled_for   timestamptz,                    -- quando a IA conseguiu inferir a data/hora
  titulo          text,
  observacao      text,
  status          text not null default 'agendada', -- agendada | realizada | cancelada
  created_at      timestamptz not null default now()
);
create index if not exists idx_meetings_user on public.meetings(user_id, created_at desc);
create index if not exists idx_meetings_conversation on public.meetings(conversation_id);

-- Por conversa: a IA está cuidando dela? (atendente pode assumir)
alter table public.conversations
  add column if not exists ai_enabled boolean not null default true;

-- Status de lead para reunião marcada
alter type lead_status add value if not exists 'reuniao_agendada';

-- RLS
alter table public.ai_config enable row level security;
alter table public.meetings  enable row level security;

drop policy if exists "ai_config_owner" on public.ai_config;
create policy "ai_config_owner" on public.ai_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meetings_owner" on public.meetings;
create policy "meetings_owner" on public.meetings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at automático em ai_config
drop trigger if exists trg_ai_config_updated on public.ai_config;
create trigger trg_ai_config_updated
  before update on public.ai_config
  for each row execute function public.set_updated_at();

-- Realtime para a tela refletir reuniões/estado
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='meetings') then
    alter publication supabase_realtime add table public.meetings;
  end if;
end $$;
