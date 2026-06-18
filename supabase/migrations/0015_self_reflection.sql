-- =====================================================================
-- 0015 · Self-Reflection Loop (autoaprimoramento do SDR)
-- ---------------------------------------------------------------------
-- A função self-reflect analisa conversas recentes e sugere "lições".
-- O usuário revisa e aprova; as APROVADAS são injetadas no prompt do SDR.
-- =====================================================================
create table if not exists public.sdr_aprendizados (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  texto      text not null,                      -- a lição/regra acionável
  categoria  text not null default 'geral',      -- abertura | objecao | agendamento | tom | timing | qualificacao | geral
  evidencia  text,                               -- justificativa/observação do padrão
  status     text not null default 'sugerido',   -- sugerido | aprovado | descartado
  origem     text not null default 'reflexao',   -- reflexao | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_aprendizados_user_status
  on public.sdr_aprendizados(user_id, status, created_at desc);

alter table public.sdr_aprendizados enable row level security;

drop policy if exists "aprendizados_owner" on public.sdr_aprendizados;
create policy "aprendizados_owner" on public.sdr_aprendizados
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_aprendizados_updated on public.sdr_aprendizados;
create trigger trg_aprendizados_updated
  before update on public.sdr_aprendizados
  for each row execute function public.set_updated_at();
