-- =====================================================================
-- 0053 · Alfred: memória melhor (categorias + higiene + memória semântica)
-- ---------------------------------------------------------------------
-- (item 2) alfred_memory.categoria : agrupa os fatos (perfil, acesso,
--          decisão, financeiro, preferência, contato...) p/ priorizar/expirar.
-- (item 3) alfred_memory_vectors   : trechos de conversa com embedding
--          (Gemini text-embedding-004, 768 dims) para RECUPERAÇÃO semântica —
--          o Alfred lembra de algo antigo, fora da janela recente, quando relevante.
-- =====================================================================
alter table public.alfred_memory
  add column if not exists categoria text;

create extension if not exists vector;

create table if not exists public.alfred_memory_vectors (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  group_id   uuid not null references public.alfred_groups(id) on delete cascade,
  kind       text not null default 'conversa',   -- conversa | fato | resumo
  content    text not null,
  embedding  vector(768) not null,
  created_at timestamptz not null default now()
);

create index if not exists alfred_memory_vectors_group_idx on public.alfred_memory_vectors(group_id);
create index if not exists alfred_memory_vectors_embedding_idx
  on public.alfred_memory_vectors using hnsw (embedding vector_cosine_ops);

alter table public.alfred_memory_vectors enable row level security;
do $$ begin
  create policy alfred_memory_vectors_owner on public.alfred_memory_vectors
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Busca por similaridade (cosseno). p_query é o embedding como texto '[...]'.
create or replace function public.alfred_match_vectors(p_group_id uuid, p_query text, p_count int)
returns table(content text, kind text, similarity float)
language sql stable as $$
  select v.content, v.kind, 1 - (v.embedding <=> p_query::vector) as similarity
  from public.alfred_memory_vectors v
  where v.group_id = p_group_id
  order by v.embedding <=> p_query::vector
  limit p_count;
$$;
