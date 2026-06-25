export type InstanceStatus = "desconectado" | "conectando" | "conectado";

export type LeadStatus =
  | "novo"
  | "na_fila"
  | "aguardando_resposta"
  | "respondeu"
  | "em_followup"
  | "em_negociacao"
  | "reuniao_agendada"
  | "sem_whatsapp"
  | "ganho"
  | "perdido";

export type QueueStatus =
  | "pendente"
  | "enviando"
  | "enviado"
  | "falha"
  | "pausado"
  | "cancelado";

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviado: "Enviado",
  falha: "Falha",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

export interface WhatsappInstance {
  id: string;
  nome: string;
  evolution_instance: string;
  numero: string | null;
  status: InstanceStatus;
  last_message_sent_at: string | null;
  next_allowed_send_at: string | null;
  daily_count: number;
  daily_limit: number;
  active: boolean;
  persona_nome: string | null;
}

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  empresa: string | null;
  status: LeadStatus;
  origem: string;
  created_at: string;
  crm_stage?: string | null;
}

export interface Conversation {
  id: string;
  lead_id: string;
  instance_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  ai_enabled: boolean;
  // joins
  leads?: Pick<Lead, "nome" | "telefone">;
  whatsapp_instances?: Pick<WhatsappInstance, "nome">;
}

export interface Message {
  id: string;
  conversation_id: string;
  instance_id: string | null;
  direction: "inbound" | "outbound";
  body: string | null;
  status: string;
  created_at: string;
  media_url?: string | null;
  media_kind?: "image" | "audio" | "video" | "document" | null;
  media_mime?: string | null;
  media_name?: string | null;
}

export type ContractStatus = "active" | "cancelled" | "completed";
export type CommissionType = "percentage" | "fixed";

export interface Contract {
  id: string;
  client_name: string;
  contract_value: number;     // valor mensal bruto (MRR por contrato)
  duration_months: number;    // parcelas a partir do mês de início
  payer_contact: string | null;
  due_date_day: number;       // dia do vencimento (1–31)
  status: ContractStatus;
  start_date: string;         // YYYY-MM-DD
  // Comissionamento (opcional) — deduzido para compor a receita líquida.
  has_commission: boolean;
  commission_type: CommissionType | null;   // 'percentage' (%) | 'fixed' (R$/mês)
  commission_value: number | null;          // a % ou o valor fixo
  commission_recipient: string | null;      // beneficiário (vendedor/parceiro)
  cancelled_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ContractInput {
  client_name: string;
  contract_value: number;
  duration_months: number;
  payer_contact: string | null;
  due_date_day: number;
  start_date: string;
  has_commission: boolean;
  commission_type: CommissionType | null;
  commission_value: number | null;
  commission_recipient: string | null;
  notes?: string | null;
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  active: "Ativo",
  cancelled: "Cancelado",
  completed: "Concluído",
};

export interface Cadence {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export interface CadenceStep {
  id: string;
  cadence_id: string;
  ordem: number;
  spintax_template: string;
  aguardar_minutos: number;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  na_fila: "Na fila",
  aguardando_resposta: "Aguardando resposta",
  respondeu: "Respondeu",
  em_followup: "Em follow-up",
  em_negociacao: "Em negociação",
  reuniao_agendada: "Reunião agendada",
  sem_whatsapp: "Sem WhatsApp",
  ganho: "Ganho",
  perdido: "Perdido",
};
