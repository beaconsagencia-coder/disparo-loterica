-- =====================================================================
-- 0013 · Reclaim de bairros travados em 'processando'
-- ---------------------------------------------------------------------
-- Se a scrape-lotericas estoura o timeout no meio de um lote, os bairros
-- ficavam presos em 'processando' para sempre (nunca reprocessados).
-- Agora cada reivindicação registra claimed_at e, a cada execução, os
-- bairros presos há mais de 15 min voltam para 'pendente'.
-- =====================================================================

alter table public.fila_bairros
  add column if not exists claimed_at timestamptz;

create or replace function public.claim_bairros(p_lote int)
returns setof public.fila_bairros
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Reclaim: bairros presos em 'processando' há >15 min voltam para a fila.
  --    (claimed_at nulo = linha antiga; usa created_at como referência.)
  update public.fila_bairros
     set status = 'pendente'
   where status = 'processando'
     and coalesce(claimed_at, created_at) < now() - interval '15 minutes';

  -- 2) Reivindica um lote pendente de forma atômica (SKIP LOCKED).
  return query
  update public.fila_bairros f
     set status = 'processando',
         claimed_at = now()
   where f.id in (
     select id from public.fila_bairros
     where status = 'pendente'
     order by created_at
     limit p_lote
     for update skip locked
   )
  returning f.*;
end $$;
