export type InstanceStatus = "desconectado" | "conectando" | "conectado";

export type LeadStatus =
  | "novo"
  | "na_fila"
  | "aguardando_resposta"
  | "em_negociacao"
  | "sem_whatsapp"
  | "ganho"
  | "perdido";

export type QueueStatus = "pendente" | "enviando" | "enviado" | "falha";

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
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  na_fila: "Na fila",
  aguardando_resposta: "Aguardando resposta",
  em_negociacao: "Em negociação",
  sem_whatsapp: "Sem WhatsApp",
  ganho: "Ganho",
  perdido: "Perdido",
};
