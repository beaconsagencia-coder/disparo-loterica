import type { LeadStatus, InstanceStatus } from "@/lib/types";
import { LEAD_STATUS_LABEL } from "@/lib/types";

const leadColors: Record<LeadStatus, string> = {
  novo: "bg-black/5 text-ink-soft",
  na_fila: "bg-accent/10 text-accent",
  aguardando_resposta: "bg-warning/15 text-[#9a6200]",
  em_negociacao: "bg-success/15 text-[#1b7a35]",
  sem_whatsapp: "bg-danger/15 text-[#b4231b]",
  ganho: "bg-success/20 text-[#1b7a35]",
  perdido: "bg-black/10 text-ink-muted",
};

export function LeadBadge({ status }: { status: LeadStatus }) {
  return <span className={`chip ${leadColors[status]}`}>{LEAD_STATUS_LABEL[status]}</span>;
}

const instColors: Record<InstanceStatus, string> = {
  conectado: "bg-success/15 text-[#1b7a35]",
  conectando: "bg-warning/15 text-[#9a6200]",
  desconectado: "bg-danger/15 text-[#b4231b]",
};

export function InstanceBadge({ status }: { status: InstanceStatus }) {
  const dot = { conectado: "bg-success", conectando: "bg-warning", desconectado: "bg-danger" }[status];
  return (
    <span className={`chip ${instColors[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}
