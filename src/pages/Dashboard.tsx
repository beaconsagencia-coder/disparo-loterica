import { useEffect, useState } from "react";
import { Clock, Send, Users, Smartphone } from "lucide-react";
import { BentoGrid, BentoCard, Metric } from "@/components/ui/Bento";
import { InstanceBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";

interface Stats {
  leads: number;
  pendentes: number;
  enviados: number;
  emNegociacao: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ leads: 0, pendentes: 0, enviados: 0, emNegociacao: 0 });
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);

  useEffect(() => {
    (async () => {
      const count = (q: any) => q.then((r: any) => r.count ?? 0);
      const [leads, pendentes, enviados, emNeg, inst] = await Promise.all([
        count(supabase.from("leads").select("id", { count: "exact", head: true })),
        count(supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "pendente")),
        count(supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "enviado")),
        count(supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "em_negociacao")),
        supabase.from("whatsapp_instances").select("*").order("nome"),
      ]);
      setStats({ leads, pendentes, enviados, emNegociacao: emNeg });
      setInstances((inst as any).data ?? []);
    })();
  }, []);

  const conectados = instances.filter((i) => i.status === "conectado").length;
  // Capacidade teórica/h: cada chip ~1 msg / 37.5min (média de 30-45) => ~1.6/h
  const capacidadeHora = Math.round(conectados * (60 / 37.5));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-ink-muted">Visão geral da prospecção B2B</p>
      </header>

      <BentoGrid>
        <BentoCard colSpan={1}>
          <Metric label="Leads" value={stats.leads} hint={<><Users size={12} className="inline" /> base total</>} />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Na fila" value={stats.pendentes} accent="text-accent" hint="aguardando envio" />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Enviadas" value={stats.enviados} hint={<><Send size={12} className="inline" /> total</>} />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Em negociação" value={stats.emNegociacao} accent="text-success" hint="responderam" />
        </BentoCard>

        {/* Card grande: chips conectados */}
        <BentoCard colSpan={2} rowSpan={2}>
          <div className="flex h-full flex-col">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Instâncias (chips)</span>
              <Smartphone size={16} className="text-ink-muted" />
            </div>
            <div className="flex-1 space-y-2 overflow-auto">
              {instances.length === 0 && (
                <p className="text-sm text-ink-muted">Nenhuma instância. Conecte um chip em “Instâncias”.</p>
              )}
              {instances.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{i.nome}</div>
                    <div className="text-xs text-ink-muted">
                      {i.next_allowed_send_at && new Date(i.next_allowed_send_at) > new Date()
                        ? `Próximo envio ${new Date(i.next_allowed_send_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                        : "Pronto para enviar"}
                    </div>
                  </div>
                  <InstanceBadge status={i.status} />
                </div>
              ))}
            </div>
          </div>
        </BentoCard>

        {/* Capacidade */}
        <BentoCard colSpan={2}>
          <Metric
            label="Capacidade estimada"
            value={`~${capacidadeHora}/h`}
            accent="text-accent"
            hint={`${conectados} chip(s) · 1 msg a cada 30–45min cada`}
          />
        </BentoCard>

        <BentoCard colSpan={2}>
          <div className="flex h-full items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Clock size={20} />
            </div>
            <div>
              <div className="text-sm font-medium">Dispatcher ativo</div>
              <div className="text-xs text-ink-muted">Cron de 1 min · round-robin entre chips</div>
            </div>
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
