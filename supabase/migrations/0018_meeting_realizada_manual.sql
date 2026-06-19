-- =====================================================================
-- 0018 · Reunião realizada -> atendimento manual (desliga a IA da conversa)
-- ---------------------------------------------------------------------
-- Ao marcar uma reunião como 'realizada', o cliente passa a ser atendido
-- manualmente: a IA é desligada NAQUELA conversa para não responder
-- dúvidas que surgem depois da reunião. Feito por trigger (robusto: vale
-- para a aba Agenda, o CRM e qualquer automação futura).
-- =====================================================================
create or replace function public.meeting_realizada_desliga_ia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só na transição PARA 'realizada' (não re-dispara em updates repetidos).
  if new.status = 'realizada' and coalesce(old.status, '') <> 'realizada' then
    update public.conversations
       set ai_enabled = false
     where (new.conversation_id is not null and id = new.conversation_id)
        or (new.conversation_id is null and new.lead_id is not null and lead_id = new.lead_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_meeting_realizada on public.meetings;
create trigger trg_meeting_realizada
  after update of status on public.meetings
  for each row
  execute function public.meeting_realizada_desliga_ia();
