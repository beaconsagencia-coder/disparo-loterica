-- =====================================================================
-- 0014 · Estatísticas de prospecção (funil + comparativo por chip)
-- ---------------------------------------------------------------------
-- Uma única RPC que devolve, para o período [p_inicio, agora]:
--  - funil: enviadas -> responderam -> reuniões -> ganhos
--  - chips: as mesmas métricas por instância (para o teste A/B de persona)
-- security invoker => roda com o JWT do usuário; o RLS + o filtro por
-- auth.uid() garantem que cada conta só vê os próprios números.
-- =====================================================================
create or replace function public.prospeccao_stats(p_inicio timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select auth.uid() as id),
  -- enviadas no período, por chip
  env as (
    select instance_id, count(*)::int as n
    from public.message_queue
    where user_id = (select id from uid) and status = 'enviado' and sent_at >= p_inicio
    group by instance_id
  ),
  -- conversas que responderam (mensagem inbound), por chip
  resp as (
    select instance_id, count(distinct conversation_id)::int as n
    from public.messages
    where user_id = (select id from uid) and direction = 'inbound' and created_at >= p_inicio
    group by instance_id
  ),
  -- reuniões (não canceladas) no período, atribuídas ao chip atual da conversa
  reun as (
    select c.instance_id, count(*)::int as n
    from public.meetings m
    join public.conversations c on c.id = m.conversation_id
    where m.user_id = (select id from uid) and m.status <> 'cancelada' and m.created_at >= p_inicio
    group by c.instance_id
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

grant execute on function public.prospeccao_stats(timestamptz) to anon, authenticated;
