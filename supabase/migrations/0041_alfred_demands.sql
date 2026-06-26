-- =====================================================================
-- 0041 · Alfred: demandas avulsas (Kanban por cliente) com prazo obrigatório
-- ---------------------------------------------------------------------
-- Diferente do checklist do cronograma (alfred_tasks). Aqui ficam os pedidos
-- pontuais do cliente no chat (artes, alterações), capturados pelo Alfred.
-- Cada demanda tem status de execução e um PRAZO de entrega (obrigatório).
-- =====================================================================
create table if not exists public.alfred_demands (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.alfred_groups(id) on delete cascade,
  titulo     text not null,
  descricao  text,
  status     text not null default 'pendente',          -- pendente | em_andamento | concluida
  prazo      date not null default (current_date + 3),   -- prazo de entrega (sempre definido)
  origem     text not null default 'chat',               -- chat | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alfred_demands_status_chk check (status in ('pendente', 'em_andamento', 'concluida'))
);
create index if not exists idx_alfred_demands_group on public.alfred_demands(group_id, status);

drop trigger if exists trg_alfred_demands_updated on public.alfred_demands;
create trigger trg_alfred_demands_updated
  before update on public.alfred_demands
  for each row execute function public.set_updated_at();

alter table public.alfred_demands enable row level security;
drop policy if exists "alfred_demands_owner" on public.alfred_demands;
create policy "alfred_demands_owner" on public.alfred_demands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='alfred_demands') then
    execute 'alter publication supabase_realtime add table public.alfred_demands';
  end if;
end $$;
