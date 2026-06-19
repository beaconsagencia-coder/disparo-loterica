-- =====================================================================
-- 0019 · Liga/desliga dos disparos pela interface
-- ---------------------------------------------------------------------
-- Interruptor mestre por usuário. Quando disparos_ativos = false, o
-- dispatcher (fila de prospecção) e o ai-followup (cutucadas proativas)
-- param de enviar — as mensagens ficam na fila e saem ao reativar.
-- Respostas reativas da IA a quem mandou mensagem continuam normais.
-- =====================================================================
create table if not exists public.dispatch_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  disparos_ativos boolean not null default true,
  updated_at      timestamptz not null default now()
);

alter table public.dispatch_settings enable row level security;

drop policy if exists "dispatch_settings_owner" on public.dispatch_settings;
create policy "dispatch_settings_owner" on public.dispatch_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
