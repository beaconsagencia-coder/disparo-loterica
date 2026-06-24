-- =====================================================================
-- 0027 · Etapa do funil do CRM (Kanban) — separada do status do bot
-- ---------------------------------------------------------------------
-- crm_stage controla a COLUNA do Kanban (gestão manual, estilo Trello).
-- O status operacional (usado pela automação) continua intacto.
-- Etapas: disparados, negociando_datas, reuniao_agendada, no_show,
--         proposta_enviada, contrato, contrato_assinado.
-- =====================================================================
alter table public.leads
  add column if not exists crm_stage text not null default 'disparados';

create index if not exists idx_leads_crm_stage on public.leads(user_id, crm_stage);

-- Semeia a etapa inicial a partir do status atual (primeira vez).
update public.leads set crm_stage = case
  when status = 'ganho'            then 'contrato_assinado'
  when status = 'reuniao_agendada' then 'reuniao_agendada'
  when status = 'em_negociacao'    then 'negociando_datas'
  else 'disparados'
end;

-- Avanço automático para "Reunião Agendada" quando uma reunião é criada
-- (só a partir de etapas anteriores; nunca puxa um card que já avançou).
create or replace function public.crm_stage_on_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'agendada' and new.lead_id is not null then
    update public.leads set crm_stage = 'reuniao_agendada'
     where id = new.lead_id and crm_stage in ('disparados', 'negociando_datas');
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_stage_meeting on public.meetings;
create trigger trg_crm_stage_meeting
  after insert on public.meetings
  for each row execute function public.crm_stage_on_meeting();
