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
