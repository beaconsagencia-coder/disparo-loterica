-- =====================================================================
-- 0016 · Impacto do Self-Reflection Loop
-- ---------------------------------------------------------------------
-- Contadores de lições + taxa de resposta ANTES x DEPOIS de o loop
-- começar a moldar o bot (marco = 1ª lição aprovada). A janela "antes"
-- tem a mesma duração da "depois", imediatamente anterior ao marco.
-- =====================================================================
create or replace function public.aprendizado_impacto()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with uid as (select auth.uid() as id),
  b as (
    select (select min(updated_at) from public.sdr_aprendizados
            where user_id = (select id from uid) and status = 'aprovado') as inicio
  ),
  bb as (
    select inicio, inicio - (now() - inicio) as antes_ini from b
  )
  select jsonb_build_object(
    'ativas',      (select count(*) from public.sdr_aprendizados where user_id = (select id from uid) and status = 'aprovado'),
    'geradas',     (select count(*) from public.sdr_aprendizados where user_id = (select id from uid) and origem = 'reflexao'),
    'descartadas', (select count(*) from public.sdr_aprendizados where user_id = (select id from uid) and status = 'descartado'),
    'inicio',      (select inicio from bb),
    'depois', jsonb_build_object(
      'enviadas',  coalesce((select count(*) from public.message_queue
                     where user_id = (select id from uid) and status = 'enviado' and sent_at >= (select inicio from bb)), 0),
      'respostas', coalesce((select count(distinct conversation_id) from public.messages
                     where user_id = (select id from uid) and direction = 'inbound' and created_at >= (select inicio from bb)), 0)
    ),
    'antes', jsonb_build_object(
      'enviadas',  coalesce((select count(*) from public.message_queue
                     where user_id = (select id from uid) and status = 'enviado'
                       and sent_at >= (select antes_ini from bb) and sent_at < (select inicio from bb)), 0),
      'respostas', coalesce((select count(distinct conversation_id) from public.messages
                     where user_id = (select id from uid) and direction = 'inbound'
                       and created_at >= (select antes_ini from bb) and created_at < (select inicio from bb)), 0)
    )
  );
$$;

grant execute on function public.aprendizado_impacto() to anon, authenticated;
