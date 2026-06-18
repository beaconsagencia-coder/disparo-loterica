import { useEffect, useState } from "react";
import { Clock, Send, Users, Smartphone, CalendarCheck, CalendarClock } from "lucide-react";
import { BentoGrid, BentoCard, Metric } from "@/components/ui/Bento";
import { InstanceBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";

interface Stats {
  leads: number;
  pendentes: number;
  emNegociacao: number;
  disparosPeriodo: number;     // enviadas no período selecionado
  reunioesPeriodo: number;     // reuniões agendadas (marcadas) no período
  reunioesHoje: number;        // reuniões com horário marcado para hoje
}

// Janelas de período (em dias, olhando para trás a partir de agora).
const PERIODOS = [
  { dias: 1, label: "Hoje" },
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
] as const;

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<number>(7);
  const [stats, setStats] = useState<Stats>({
    leads: 0, pendentes: 0, emNegociacao: 0, disparosPeriodo: 0, reunioesPeriodo: 0, reunioesHoje: 0,
  });
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);

  useEffect(() => {
    (async () => {
      const count = (q: any) => q.then((r: any) => r.count ?? 0);

      // Janela do período + janela "hoje" (00:00 → 24:00 local).
      const now = new Date();
      const inicio = new Date(now);
      inicio.setDate(now.getDate() - (periodo - 1));
      inicio.setHours(0, 0, 0, 0);
      const hojeInicio = new Date(now); hojeInicio.setHours(0, 0, 0, 0);
      const hojeFim = new Date(hojeInicio); hojeFim.setDate(hojeFim.getDate() + 1);
      const inicioISO = inicio.toISOString();

      const [leads, pendentes, emNeg, disparos, reunioes, reunioesHoje, inst] = await Promise.all([
        count(supabase.from("leads").select("id", { count: "exact", head: true })),
        count(supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "pendente")),
        count(supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "em_negociacao")),
        // Disparos: mensagens efetivamente enviadas dentro do período.
        count(supabase.from("message_queue").select("id", { count: "exact", head: true })
          .eq("status", "enviado").gte("sent_at", inicioISO)),
        // Reuniões marcadas (criadas) dentro do período, exceto canceladas.
        count(supabase.from("meetings").select("id", { count: "exact", head: true })
          .neq("status", "cancelada").gte("created_at", inicioISO)),
        // Reuniões cujo horário cai em hoje, exceto canceladas.
        count(supabase.from("meetings").select("id", { count: "exact", head: true })
          .neq("status", "cancelada")
          .gte("scheduled_for", hojeInicio.toISOString())
          .lt("scheduled_for", hojeFim.toISOString())),
        supabase.from("whatsapp_instances").select("*").order("nome"),
      ]);

      setStats({
        leads, pendentes, emNegociacao: emNeg,
        disparosPeriodo: disparos, reunioesPeriodo: reunioes, reunioesHoje,
      });
      setInstances((inst as any).data ?? []);
    })();
  }, [periodo]);

  const conectados = instances.filter((i) => i.status === "conectado").length;
  // Capacidade teórica/h: cada chip ~1 msg / 37.5min (média de 30-45) => ~1.6/h
  const capacidadeHora = Math.round(conectados * (60 / 37.5));
  const periodoLabel = PERIODOS.find((p) => p.dias === periodo)?.label ?? `${periodo} dias`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-muted">Visão geral da prospecção B2B</p>
        </div>
        {/* Filtro de período */}
        <div className="inline-flex self-start rounded-xl bg-black/5 p-1 sm:self-auto">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setPeriodo(p.dias)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                periodo === p.dias ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <BentoGrid>
        {/* Métricas do período */}
        <BentoCard colSpan={1}>
          <Metric label="Disparos no período" value={stats.disparosPeriodo} accent="text-accent"
            hint={<><Send size={12} className="inline" /> {periodoLabel}</>} />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Reuniões no período" value={stats.reunioesPeriodo}
            hint={<><CalendarCheck size={12} className="inline" /> agendadas · {periodoLabel}</>} />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Reuniões hoje" value={stats.reunioesHoje} accent="text-success"
            hint={<><CalendarClock size={12} className="inline" /> marcadas p/ hoje</>} />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Em negociação" value={stats.emNegociacao} accent="text-success" hint="responderam" />
        </BentoCard>

        {/* Base e fila (totais, independem do período) */}
        <BentoCard colSpan={1}>
          <Metric label="Leads" value={stats.leads} hint={<><Users size={12} className="inline" /> base total</>} />
        </BentoCard>
        <BentoCard colSpan={1}>
          <Metric label="Na fila" value={stats.pendentes} accent="text-accent" hint="aguardando envio" />
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
