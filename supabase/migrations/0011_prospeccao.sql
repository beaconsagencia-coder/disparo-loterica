-- =====================================================================
-- Prospecção: configuração do disparo automático + dedupe da fila
-- ---------------------------------------------------------------------
-- - prospeccao_config: liga/desliga o auto-disparo e guarda o template
-- - fila_bairros ganha unicidade (não enfileira o mesmo bairro 2x)
-- - índice por origem em leads (listagem da aba Prospecção)
-- =====================================================================

create table if not exists public.prospeccao_config (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  auto_disparo     boolean not null default true,   -- envia p/ fila de disparo automaticamente
  spintax_template text not null default '',        -- mensagem (vazio = usa padrão do código)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id)
);

alter table public.prospeccao_config enable row level security;
drop policy if exists "prospeccao_config_owner" on public.prospeccao_config;
create policy "prospeccao_config_owner" on public.prospeccao_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_prospeccao_config_updated on public.prospeccao_config;
create trigger trg_prospeccao_config_updated
  before update on public.prospeccao_config
  for each row execute function public.set_updated_at();

-- Evita enfileirar a mesma região duas vezes
create unique index if not exists uq_fila_bairros
  on public.fila_bairros(user_id, bairro, cidade, estado);

-- Listagem rápida dos contatos prospectados
create index if not exists idx_leads_origem on public.leads(user_id, origem);
