-- =====================================================================
-- 0048 · Alfred: escalonamento ao operador humano (handoff por DM privada)
-- ---------------------------------------------------------------------
-- Quando a conversa exige uma AÇÃO do operador (ex.: testar acesso a uma
-- conta), o Alfred manda uma DM no número pessoal do operador, espera o
-- retorno (o operador responde CITANDO a DM) e repassa o status ao grupo.
--   • alfred_configs.operator_number : número pessoal do operador (DM).
--   • alfred_escalations             : tarefas escaladas + retorno.
-- =====================================================================
alter table public.alfred_configs
  add column if not exists operator_number text;

create table if not exists public.alfred_escalations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  group_id          uuid not null references public.alfred_groups(id) on delete cascade,
  resumo            text not null,                 -- título curto da tarefa
  mensagem_operador text not null,                 -- DM exata enviada (usada p/ casar a citação)
  status            text not null default 'aberta',-- aberta | concluida
  resposta_operador text,                          -- retorno do operador
  created_at        timestamptz not null default now(),
  answered_at       timestamptz,
  constraint alfred_escalations_status_chk check (status in ('aberta', 'concluida'))
);
create index if not exists idx_alfred_escalations_open on public.alfred_escalations(user_id, status);
create index if not exists idx_alfred_escalations_group on public.alfred_escalations(group_id, status);

alter table public.alfred_escalations enable row level security;
drop policy if exists "alfred_escalations_owner" on public.alfred_escalations;
create policy "alfred_escalations_owner" on public.alfred_escalations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
