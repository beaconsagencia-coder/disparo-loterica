-- =====================================================================
-- 0029 · No-show -> o bot tenta reagendar sozinho
-- ---------------------------------------------------------------------
-- Ao marcar uma reunião como no_show, além de mover o card para "No Show":
--   • o lead volta para o funil ativo (reuniao_agendada -> em_negociacao),
--   • a conversa é REABERTA para o follow-up proativo (ai-followup):
--       IA ligada, followup_count zerado, quiet_reason='no_show' e uma
--       carência de ~90 min antes da 1ª tentativa de reagendamento.
-- E quando o bot remarca, o card sai de "No Show" e volta p/ "Reunião Agendada".
-- =====================================================================

-- Reavanço do card ao criar reunião: agora também a partir de "No Show"
-- (o reagendamento depois de uma falta tira o card da coluna No Show).
create or replace function public.crm_stage_on_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'agendada' and new.lead_id is not null then
    update public.leads set crm_stage = 'reuniao_agendada'
     where id = new.lead_id and crm_stage in ('disparados', 'negociando_datas', 'no_show');
  end if;
  return new;
end $$;

-- Desfecho da reunião: realizada / no-show / venda.
-- (Substitui a versão de 0028 acrescentando a REABERTURA no no-show.)
create or replace function public.meeting_after_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Realizada (a venda já forçou 'realizada' no BEFORE): atendimento manual.
  if new.status = 'realizada' and coalesce(old.status, '') <> 'realizada' then
    update public.conversations set ai_enabled = false
     where (new.conversation_id is not null and id = new.conversation_id)
        or (new.conversation_id is null and new.lead_id is not null and lead_id = new.lead_id);
  end if;

  -- No-show: move o card e REABRE a conversa para o bot tentar reagendar.
  if new.status = 'no_show' and coalesce(old.status, '') <> 'no_show' then
    if new.lead_id is not null then
      update public.leads
         set crm_stage = 'no_show',
             status = case when status = 'reuniao_agendada' then 'em_negociacao' else status end
       where id = new.lead_id
         and (crm_stage is distinct from 'no_show' or status = 'reuniao_agendada');
    end if;
    -- Reabre para o follow-up proativo (respeita SDR ativo + disparos ligados).
    update public.conversations
       set ai_enabled = true,
           followup_count = 0,
           quiet_reason = 'no_show',
           last_direction = 'outbound',
           quiet_until = now() + interval '90 minutes'
     where (new.conversation_id is not null and id = new.conversation_id)
        or (new.conversation_id is null and new.lead_id is not null and lead_id = new.lead_id);
  end if;

  -- Venda: marca o lead como ganho (a trigger do lead espelha em "Contrato Assinado").
  if new.gerou_venda and not coalesce(old.gerou_venda, false) and new.lead_id is not null then
    update public.leads set status = 'ganho'
     where id = new.lead_id and status is distinct from 'ganho';
  end if;

  return new;
end $$;
