-- =====================================================================
-- 0038 · Alfred: aprendizado contínuo (memória + resumo consolidado)
-- ---------------------------------------------------------------------
-- alfred_memory: fatos/dados operacionais aprendidos da conversa (1 valor
--   por chave por grupo — ex.: senha_instagram, login_facebook, orcamento).
-- alfred_context.resumo: a ESSÊNCIA consolidada do cliente (não o volume
--   bruto de mensagens), atualizada automaticamente pelo Alfred.
-- =====================================================================
create table if not exists public.alfred_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.alfred_groups(id) on delete cascade,
  chave      text not null,                 -- ex.: senha_instagram, orcamento_anuncios
  valor      text not null,
  updated_at timestamptz not null default now(),
  unique (group_id, chave)
);
create index if not exists idx_alfred_memory_group on public.alfred_memory(group_id);

alter table public.alfred_context
  add column if not exists resumo text;     -- resumo consolidado (essência do cliente)

drop trigger if exists trg_alfred_memory_updated on public.alfred_memory;
create trigger trg_alfred_memory_updated
  before update on public.alfred_memory
  for each row execute function public.set_updated_at();

alter table public.alfred_memory enable row level security;
drop policy if exists "alfred_memory_owner" on public.alfred_memory;
create policy "alfred_memory_owner" on public.alfred_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='alfred_memory') then
    execute 'alter publication supabase_realtime add table public.alfred_memory';
  end if;
end $$;
