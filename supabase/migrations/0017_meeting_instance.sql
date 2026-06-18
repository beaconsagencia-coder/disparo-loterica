-- =====================================================================
-- 0017 · Responsável (chip) pela reunião
-- ---------------------------------------------------------------------
-- Reuniões ganham instance_id, para que reuniões MANUAIS possam ser
-- atribuídas a um chip e contadas no comparativo por chip dos Relatórios.
-- =====================================================================
alter table public.meetings
  add column if not exists instance_id uuid references public.whatsapp_instances(id) on delete set null;

create index if not exists idx_meetings_instance on public.meetings(instance_id);

-- RPC de estatísticas: atribui a reunião ao instance_id próprio (manual ou bot)
-- e, na falta dele, ao chip atual da conversa.
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
  reun as (
    select coalesce(m.instance_id, c.instance_id) as instance_id, count(*)::int as n
    from public.meetings m
    left join public.conversations c on c.id = m.conversation_id
    where m.user_id = (select id from uid) and m.status <> 'cancelada' and m.created_at >= p_inicio
    group by coalesce(m.instance_id, c.instance_id)
  )
  select jsonb_build_object(
    'funil', jsonb_build_object(
      'enviadas',    coalesce((select sum(n) from env), 0),
      'responderam', coalesce((select count(distinct conversation_id) from public.messages
                               where user_id = (select id from uid) and direction = 'inbound' and created_at >= p_inicio), 0),
      'reunioes',    coalesce((select count(*) from public.meetings
                               where user_id = (select id from uid) and status <> 'cancelada' and created_at >= p_inicio), 0),
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
        'reunioes',     coalesce(u.n, 0)
      ) order by coalesce(e.n, 0) desc, wi.nome)
      from public.whatsapp_instances wi
      left join env  e on e.instance_id = wi.id
      left join resp r on r.instance_id = wi.id
      left join reun u on u.instance_id = wi.id
      where wi.user_id = (select id from uid)
    ), '[]'::jsonb)
  );
$$;
