-- =====================================================================
-- 0033 · Módulo ALFRED — agente de IA para grupos de WhatsApp de clientes
-- ---------------------------------------------------------------------
-- Módulo ISOLADO: tabelas próprias (prefixo alfred_), sem tocar no resto.
--   alfred_configs : chaves (Gemini/Evolution) + prompt global, por usuário.
--   alfred_groups  : vincula o remoteJid do grupo ao cliente + on/off.
--   alfred_context : dados do cliente (drive, cronograma, financeiro) p/ a IA.
-- RLS por dono. A Edge Function (service_role) lê tudo via lookup do grupo.
-- =====================================================================

-- 1) Configurações globais do Alfred (1 por usuário) ------------------
create table if not exists public.alfred_configs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  gemini_api_key    text,                         -- chave da API do Google Gemini
  evolution_api_key text,                         -- chave da Evolution (fallback: env)
  evolution_api_url text,                         -- base URL da Evolution (fallback: env)
  system_prompt     text not null default
    'Você é o Alfred, assistente da agência no grupo de WhatsApp do cliente. Responda dúvidas sobre cronograma, financeiro e anúncios com base no contexto fornecido.',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id)
);

-- 2) Grupos gerenciados pelo Alfred ----------------------------------
create table if not exists public.alfred_groups (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  remote_jid         text not null,               -- ID do grupo no WhatsApp (..@g.us)
  client_name        text not null,               -- nome do cliente dono do grupo
  evolution_instance text,                         -- chip por onde responder (opcional)
  active             boolean not null default true,-- liga/desliga o bot no grupo
  created_at         timestamptz not null default now(),
  unique (user_id, remote_jid)
);
create index if not exists idx_alfred_groups_jid on public.alfred_groups(remote_jid) where active;
create index if not exists idx_alfred_groups_user on public.alfred_groups(user_id);

-- 3) Contexto do cliente (1 por grupo) -------------------------------
create table if not exists public.alfred_context (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  group_id    uuid not null references public.alfred_groups(id) on delete cascade,
  drive_link  text,                               -- link do Drive do cliente
  cronograma  text,                               -- cronograma atual (texto livre)
  financeiro  text,                               -- status financeiro
  observacoes text,                               -- outras notas para a IA
  updated_at  timestamptz not null default now(),
  unique (group_id)
);

-- updated_at automático (reutiliza a função de 0001) -----------------
drop trigger if exists trg_alfred_configs_updated on public.alfred_configs;
create trigger trg_alfred_configs_updated
  before update on public.alfred_configs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_alfred_context_updated on public.alfred_context;
create trigger trg_alfred_context_updated
  before update on public.alfred_context
  for each row execute function public.set_updated_at();

-- RLS: cada conta só enxerga os próprios registros -------------------
alter table public.alfred_configs enable row level security;
alter table public.alfred_groups  enable row level security;
alter table public.alfred_context enable row level security;

drop policy if exists "alfred_configs_owner" on public.alfred_configs;
create policy "alfred_configs_owner" on public.alfred_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "alfred_groups_owner" on public.alfred_groups;
create policy "alfred_groups_owner" on public.alfred_groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "alfred_context_owner" on public.alfred_context;
create policy "alfred_context_owner" on public.alfred_context
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: o painel /alfred reflete on/off e edição de contexto na hora.
do $$
declare t text;
begin
  foreach t in array array['alfred_configs','alfred_groups','alfred_context'] loop
    if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
