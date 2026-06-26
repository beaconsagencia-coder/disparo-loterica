-- =====================================================================
-- 0037 · Alfred: checklist do cronograma por cliente (grupo)
-- ---------------------------------------------------------------------
-- Cada grupo recebe automaticamente as tarefas do cronograma (4 semanas).
-- Você marca o que já foi entregue/coletado; o Alfred lê o andamento e
-- responde com precisão (e ele mesmo cobra o que depende do cliente).
-- =====================================================================
create table if not exists public.alfred_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.alfred_groups(id) on delete cascade,
  semana     int  not null,
  ordem      int  not null default 0,
  task_key   text not null,
  titulo     text not null,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, task_key)
);
create index if not exists idx_alfred_tasks_group on public.alfred_tasks(group_id, semana, ordem);
create index if not exists idx_alfred_tasks_user  on public.alfred_tasks(user_id);

-- Template do cronograma (mesma lista para todo cliente).
create or replace function public.alfred_task_template()
returns table(semana int, ordem int, task_key text, titulo text)
language sql immutable as $$
  select * from (values
    (1, 1, 'identidade_visual',         'Identidade visual da lotérica'),
    (2, 1, 'posts_feed',                'Criar 3 posts para o feed'),
    (2, 2, 'biografia',                 'Configurar a biografia do Instagram'),
    (2, 3, 'criar_instagram',           'Criar/configurar Instagram (se o cliente não tiver)'),
    (3, 1, 'conta_facebook',            'Solicitar conta de Facebook antiga (cliente/funcionário)'),
    (3, 2, 'treinamento_bolao_gestor',  'Treinamento do Bolão Gestor'),
    (3, 3, 'config_loterica_sistema',   'Configurar a lotérica no sistema'),
    (3, 4, 'automacao_instagram',       'Configurar a automação do Instagram'),
    (4, 1, 'solicitar_criativo',        'Solicitar vídeo da impressão de bolões (criativo)'),
    (4, 2, 'orcamento_anuncios',        'Solicitar orçamento financeiro dos anúncios'),
    (4, 3, 'subir_campanhas',           'Subir as primeiras campanhas')
  ) as t(semana, ordem, task_key, titulo)
$$;

-- Semeia o checklist quando um grupo é criado.
create or replace function public.seed_alfred_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.alfred_tasks (user_id, group_id, semana, ordem, task_key, titulo)
  select new.user_id, new.id, t.semana, t.ordem, t.task_key, t.titulo
  from public.alfred_task_template() t
  on conflict (group_id, task_key) do nothing;
  return new;
end $$;

drop trigger if exists trg_seed_alfred_tasks on public.alfred_groups;
create trigger trg_seed_alfred_tasks
  after insert on public.alfred_groups
  for each row execute function public.seed_alfred_tasks();

-- Backfill: cria o checklist para os grupos que já existem.
insert into public.alfred_tasks (user_id, group_id, semana, ordem, task_key, titulo)
select g.user_id, g.id, t.semana, t.ordem, t.task_key, t.titulo
from public.alfred_groups g
cross join public.alfred_task_template() t
on conflict (group_id, task_key) do nothing;

-- RLS
alter table public.alfred_tasks enable row level security;
drop policy if exists "alfred_tasks_owner" on public.alfred_tasks;
create policy "alfred_tasks_owner" on public.alfred_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: o checklist reflete a marcação na hora.
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='alfred_tasks') then
    execute 'alter publication supabase_realtime add table public.alfred_tasks';
  end if;
end $$;
