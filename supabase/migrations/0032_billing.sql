-- =====================================================================
-- 0032 · Cobrança automática (lembrete de vencimento + PIX) e baixa de fatura
-- ---------------------------------------------------------------------
-- billing_settings: chave PIX, favorecido, horário do envio e template.
-- invoices: 1 parcela por (contrato, competência=mês). Guarda o envio do
--   lembrete (reminder_sent_at) e a baixa (status/paid_at). O unique
--   (contract_id, competencia) garante idempotência: nunca cobra 2x o mês.
-- =====================================================================
create table if not exists public.billing_settings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ativo         boolean not null default false,   -- liga/desliga a automação
  pix_key       text,                             -- chave PIX (favorecido)
  pix_nome      text,                             -- nome do favorecido
  pix_copia_cola text,                            -- payload "copia e cola" (opcional)
  hora_envio    int not null default 8,           -- hora (0–23, Brasília) do disparo diário
  dias_antes    int not null default 0,           -- enviar N dias ANTES do vencimento (0 = no dia)
  template      text,                             -- mensagem personalizada (placeholders abaixo)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id),
  constraint billing_hora_chk  check (hora_envio between 0 and 23),
  constraint billing_dias_chk  check (dias_antes between 0 and 30)
);

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  competencia     date not null,                  -- 1º dia do mês de referência
  due_date        date not null,                  -- vencimento real (dia do contrato)
  valor           numeric(12,2) not null default 0,
  status          text not null default 'pending',-- pending | paid
  reminder_sent_at timestamptz,                   -- quando o lembrete foi enviado (anti-duplicidade)
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (contract_id, competencia),
  constraint invoices_status_chk check (status in ('pending', 'paid'))
);
create index if not exists idx_invoices_user on public.invoices(user_id, competencia);
create index if not exists idx_invoices_contract on public.invoices(contract_id);

-- updated_at automático (reutiliza a função de 0001).
drop trigger if exists trg_billing_settings_updated on public.billing_settings;
create trigger trg_billing_settings_updated
  before update on public.billing_settings
  for each row execute function public.set_updated_at();

-- RLS
alter table public.billing_settings enable row level security;
alter table public.invoices         enable row level security;

drop policy if exists "billing_settings_owner" on public.billing_settings;
create policy "billing_settings_owner" on public.billing_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "invoices_owner" on public.invoices;
create policy "invoices_owner" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: o painel reflete baixa de fatura e envio do lembrete.
do $$
declare t text;
begin
  foreach t in array array['billing_settings','invoices'] loop
    if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Cron: roda de hora em hora; a função decide se é a hora configurada (Brasília).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('billing-reminder-tick')
where exists (select 1 from cron.job where jobname = 'billing-reminder-tick');

select cron.schedule(
  'billing-reminder-tick',
  '0 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/billing-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
