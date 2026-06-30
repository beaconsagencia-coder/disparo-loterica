-- =====================================================================
-- 0056 · Alfred: pauta do acompanhamento proativo
-- ---------------------------------------------------------------------
-- O OPERADOR pode, no privado, pedir para o Alfred PERGUNTAR algo a um
-- cliente no próximo acompanhamento proativo (ex.: "amanhã pergunta pra
-- Lotérica Lírio se conseguiram enviar a apelação do Instagram").
-- Cada item fica como pauta PENDENTE do grupo e é incorporado na próxima
-- mensagem proativa; depois é marcado como concluído.
--   • agendar_para : null = já no próximo acompanhamento; senão só a partir
--                    desta data (Brasília).
--   • status       : pendente | concluida
-- =====================================================================
create table if not exists public.alfred_proativo_pauta (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  group_id     uuid not null references public.alfred_groups(id) on delete cascade,
  item         text not null,
  agendar_para date,
  status       text not null default 'pendente',
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);

create index if not exists alfred_pauta_group_status_idx
  on public.alfred_proativo_pauta(group_id, status);

alter table public.alfred_proativo_pauta enable row level security;
do $$ begin
  create policy alfred_proativo_pauta_owner on public.alfred_proativo_pauta
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
