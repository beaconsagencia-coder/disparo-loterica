-- =====================================================================
-- 0028 · Resultado da reunião: no-show e venda (alimenta os relatórios)
-- ---------------------------------------------------------------------
-- Agora a reunião tem desfecho explícito:
--   status: agendada | realizada | no_show | cancelada
--   gerou_venda: a reunião fechou negócio?
-- E os dois lados (Agenda e CRM) ficam em sincronia por trigger:
--   • reunião no_show   -> card do lead vai para a coluna "No Show"
--   • reunião com venda -> reunião vira "realizada" + lead vira "ganho"
--   • lead "ganho"      <-> card "Contrato Assinado" (espelho)
-- Os relatórios (prospeccao_stats) ganham comparecimento, no-show e vendas.
-- =====================================================================
alter table public.meetings
  add column if not exists gerou_venda boolean not null default false;

comment on column public.meetings.status is 'agendada | realizada | no_show | cancelada';

-- ---------------------------------------------------------------------
-- BEFORE: marcar "gerou venda" implica que a reunião aconteceu (realizada).
-- ---------------------------------------------------------------------
create or replace function public.meeting_before_outcome()
returns trigger language plpgsql as $$
begin
  if new.gerou_venda and not coalesce(old.gerou_venda, false) then
    new.status := 'realizada';
  end if;
  return new;
end $$;

drop trigger if exists trg_meeting_before_outcome on public.meetings;
create trigger trg_meeting_before_outcome
  before update on public.meetings
  for each row execute function public.meeting_before_outcome();

-- ---------------------------------------------------------------------
-- AFTER: reflete o desfecho no lead. Substitui a trigger 0018 (que só
-- desligava a IA na reunião realizada) — agora cobre também no-show e venda.
-- ---------------------------------------------------------------------
create or replace function public.meeting_after_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Realizada (a venda já forçou 'realizada' no BEFORE): atendimento manual.
  if new.status = 'realizada' and coalesce(old.status, '') <> 'realizada' then
    update public.conversations set ai_enabled = false
     where (new.conversation_id is not null and id = new.conversation_id)
        or (new.conversation_id is null and new.lead_id is not null and lead_id = new.lead_id);
  end if;

  -- No-show: avança o card do CRM para a coluna "No Show".
  if new.status = 'no_show' and coalesce(old.status, '') <> 'no_show' and new.lead_id is not null then
    update public.leads set crm_stage = 'no_show'
     where id = new.lead_id and crm_stage is distinct from 'no_show';
  end if;

  -- Venda: marca o lead como ganho (a trigger do lead espelha em "Contrato Assinado").
  if new.gerou_venda and not coalesce(old.gerou_venda, false) and new.lead_id is not null then
    update public.leads set status = 'ganho'
     where id = new.lead_id and status is distinct from 'ganho';
  end if;

  return new;
end $$;

drop trigger if exists trg_meeting_realizada on public.meetings;
drop trigger if exists trg_meeting_after_outcome on public.meetings;
create trigger trg_meeting_after_outcome
  after update on public.meetings
  for each row execute function public.meeting_after_outcome();

-- ---------------------------------------------------------------------
-- Lead: espelho status <-> etapa do funil (mantém relatórios e CRM coerentes).
-- BEFORE => altera o próprio NEW, sem recursão.
-- ---------------------------------------------------------------------
create or replace function public.lead_stage_status_sync()
returns trigger language plpgsql as $$
begin
  -- Card arrastado para "Contrato Assinado" => lead ganho (entra nos relatórios).
  if new.crm_stage = 'contrato_assinado' and coalesce(old.crm_stage, '') <> 'contrato_assinado'
     and new.status is distinct from 'ganho' then
    new.status := 'ganho';
  end if;
  -- Lead marcado "ganho" em qualquer lugar => card vai para "Contrato Assinado".
  if new.status = 'ganho' and coalesce(old.status::text, '') <> 'ganho'
     and new.crm_stage is distinct from 'contrato_assinado' then
    new.crm_stage := 'contrato_assinado';
  end if;
  return new;
end $$;

drop trigger if exists trg_lead_stage_status_sync on public.leads;
create trigger trg_lead_stage_status_sync
  before update on public.leads
  for each row execute function public.lead_stage_status_sync();

-- ---------------------------------------------------------------------
-- Relatórios: funil + comparativo por chip agora com comparecimento,
-- no-show e vendas. Mantém a semântica de período por created_at da reunião.
-- ---------------------------------------------------------------------
create or replace function public.prospeccao_stats(p_inicio timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select auth.uid() as id),
  env as (
    select instance_id, count(*)::int as n
    from public.message_queue
    where user_id = (select id from uid) and status = 'enviado' and sent_at >= p_inicio
    group by instance_id
  ),
  resp as (
    select instance_id, count(distinct conversation_id)::int as n
    from public.messages
    where user_id = (select id from uid) and direction = 'inbound' and created_at >= p_inicio
    group by instance_id
  ),
  -- métricas de reunião por chip (atribuídas ao chip da reunião ou da conversa)
  meet as (
    select coalesce(m.instance_id, c.instance_id) as instance_id,
           count(*) filter (where m.status <> 'cancelada')::int as agendadas,
           count(*) filter (where m.status = 'realizada')::int  as realizadas,
           count(*) filter (where m.status = 'no_show')::int    as no_show,
           count(*) filter (where m.gerou_venda)::int           as vendas
    from public.meetings m
    left join public.conversations c on c.id = m.conversation_id
    where m.user_id = (select id from uid) and m.created_at >= p_inicio
    group by coalesce(m.instance_id, c.instance_id)
  )
  select jsonb_build_object(
    'funil', jsonb_build_object(
      'enviadas',    coalesce((select sum(n) from env), 0),
      'responderam', coalesce((select count(distinct conversation_id) from public.messages
                               where user_id = (select id from uid) and direction = 'inbound' and created_at >= p_inicio), 0),
      'reunioes',    coalesce((select count(*) from public.meetings
                               where user_id = (select id from uid) and status <> 'cancelada' and created_at >= p_inicio), 0),
      'realizadas',  coalesce((select count(*) from public.meetings
                               where user_id = (select id from uid) and status = 'realizada' and created_at >= p_inicio), 0),
      'no_show',     coalesce((select count(*) from public.meetings
                               where user_id = (select id from uid) and status = 'no_show' and created_at >= p_inicio), 0),
      'ganhos',      coalesce((select count(*) from public.leads
                               where user_id = (select id from uid) and status = 'ganho' and updated_at >= p_inicio), 0)
    ),
    'chips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'instance_id',  wi.id,
        'nome',         wi.nome,
        'persona_nome', wi.persona_nome,
        'enviadas',     coalesce(e.n, 0),
        'respostas',    coalesce(r.n, 0),
        'reunioes',     coalesce(mt.agendadas, 0),
        'realizadas',   coalesce(mt.realizadas, 0),
        'no_show',      coalesce(mt.no_show, 0),
        'vendas',       coalesce(mt.vendas, 0)
      ) order by coalesce(e.n, 0) desc, wi.nome)
      from public.whatsapp_instances wi
      left join env  e  on e.instance_id  = wi.id
      left join resp r  on r.instance_id  = wi.id
      left join meet mt on mt.instance_id = wi.id
      where wi.user_id = (select id from uid)
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.prospeccao_stats(timestamptz) to anon, authenticated;
