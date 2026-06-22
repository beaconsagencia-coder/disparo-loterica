-- =====================================================================
-- 0022 · Confirmação extra de reunião (reduzir no-show)
-- ---------------------------------------------------------------------
-- Além do lembrete de 15 min (reminder_sent), uma confirmação anterior:
--   - reunião à TARDE  -> confirma de manhã (09h, fuso SP);
--   - reunião de MANHÃ -> confirma 2h antes.
-- confirm_sent evita repetir.
-- =====================================================================
alter table public.meetings
  add column if not exists confirm_sent boolean not null default false;
