import { useEffect, useState } from "react";
import {
  Clock, Send, Users, Smartphone, CalendarCheck, CalendarClock,
  KanbanSquare, ArrowRight, RotateCcw, AlertTriangle, CalendarClock as PrazoIcon,
} from "lucide-react";
import { BentoGrid, BentoCard, Metric } from "@/components/ui/Bento";
import { InstanceBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance } from "@/lib/types";
import type { AlfredDemand, DemandStatus } from "@/lib/useAlfred";

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

// =====================================================================
// Kanban de demandas do Alfred (integrado à visão geral)
// =====================================================================
interface DemandaView extends AlfredDemand { client_name: string }

const DEMAND_COLS: { key: DemandStatus; label: string; dot: string; soft: string }[] = [
  { key: "pendente", label: "Pendente", dot: "bg-warning", soft: "bg-warning/10" },
  { key: "em_andamento", label: "Em andamento", dot: "bg-accent", soft: "bg-accent/10" },
  { key: "concluida", label: "Concluída", dot: "bg-success", soft: "bg-success/10" },
];
const proximoStatus: Record<DemandStatus, DemandStatus> = {
  pendente: "em_andamento", em_andamento: "concluida", concluida: "pendente",
};

function prazoBR(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
function diasAteHoje(iso: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - hoje.getTime()) / 86_400_000);
}

/** Card de demanda — CSS Grid, drop shadow leve, hover suave. */
function DemandCard({ d, onMover }: { d: DemandaView; onMover: (id: string, s: DemandStatus) => void }) {
  const dias = diasAteHoje(d.prazo);
  const atrasada = d.status !== "concluida" && dias < 0;
  const hoje = d.status !== "concluida" && dias === 0;
  const concluida = d.status === "concluida";
  const next = proximoStatus[d.status];
  return (
    <article className="rounded-2xl border border-black/[0.06] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_4px_12px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.06),0_10px_24px_rgba(16,24,40,0.08)]">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">{d.client_name}</div>
      <h4 className={`mt-1 text-sm font-medium leading-snug ${concluida ? "text-ink-muted line-through" : "text-ink"}`}>{d.titulo}</h4>
      {d.descricao && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{d.descricao}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`chip ${atrasada ? "bg-danger/12 text-danger" : hoje ? "bg-warning/15 text-[#9a6400]" : "bg-black/[0.04] text-ink-muted"}`}>
          {atrasada ? <AlertTriangle size={11} /> : <PrazoIcon size={11} />}
          {prazoBR(d.prazo)}{atrasada ? " · atrasada" : hoje ? " · hoje" : ""}
        </span>
        <button
          onClick={() => onMover(d.id, next)}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            concluida
              ? "text-ink-muted hover:bg-black/5 hover:text-ink-soft"
              : "bg-accent/10 text-accent hover:bg-accent hover:text-white"
          }`}
          title={concluida ? "Reabrir demanda" : `Mover para ${DEMAND_COLS.find((c) => c.key === next)?.label}`}
        >
          {concluida ? <><RotateCcw size={12} /> Reabrir</> : <>Avançar <ArrowRight size={12} /></>}
        </button>
      </div>
    </article>
  );
}

/** Seção do Kanban: colunas por status (CSS Grid), mobile-first. */
function DemandasKanban({ demandas, onMover }: { demandas: DemandaView[]; onMover: (id: string, s: DemandStatus) => void }) {
  const abertas = demandas.filter((d) => d.status !== "concluida");
  const atrasadas = abertas.filter((d) => diasAteHoje(d.prazo) < 0).length;
  const ordenar = (a: DemandaView, b: DemandaView) => a.prazo.localeCompare(b.prazo);

  return (
    <section className="mt-8 sm:mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><KanbanSquare size={18} /></span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Demandas dos clientes</h2>
            <p className="text-sm text-ink-muted">Solicitações captadas pelo Alfred, organizadas por status.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-black/5 px-2.5 py-1 font-medium text-ink-soft">{abertas.length} aberta(s)</span>
          {atrasadas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2.5 py-1 font-medium text-danger">
              <AlertTriangle size={12} /> {atrasadas} atrasada(s)
            </span>
          )}
        </div>
      </div>

      {demandas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/50 py-10 text-center text-sm text-ink-muted">
          Nenhuma demanda ainda. Elas aparecem aqui quando o Alfred capta um pedido de um cliente no chat.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEMAND_COLS.map((col) => {
            const itens = demandas.filter((d) => d.status === col.key).sort(ordenar);
            return (
              <div key={col.key} className={`rounded-2xl ${col.soft} p-3`}>
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                  <span className="text-sm font-semibold text-ink-soft">{col.label}</span>
                  <span className="ml-auto rounded-full bg-white/70 px-2 text-xs text-ink-muted">{itens.length}</span>
                </div>
                <div className="grid gap-3">
                  {itens.map((d) => <DemandCard key={d.id} d={d} onMover={onMover} />)}
                  {itens.length === 0 && <p className="py-3 text-center text-xs text-ink-muted/70">Vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<number>(7);
  const [stats, setStats] = useState<Stats>({
    leads: 0, pendentes: 0, emNegociacao: 0, disparosPeriodo: 0, reunioesPeriodo: 0, reunioesHoje: 0,
  });
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);
  const [disparosAtivos, setDisparosAtivos] = useState(true);
  const [savingDisparo, setSavingDisparo] = useState(false);
  const [demandas, setDemandas] = useState<DemandaView[]>([]);

  // Demandas do Alfred (carga leve: só grupos + demandas) com realtime.
  useEffect(() => {
    let active = true;
    async function carregar() {
      const [{ data: grps }, { data: dem }] = await Promise.all([
        supabase.from("alfred_groups").select("id, client_name"),
        supabase.from("alfred_demands").select("id, group_id, titulo, descricao, status, prazo").order("prazo"),
      ]);
      if (!active) return;
      const nome = new Map<string, string>(((grps as { id: string; client_name: string }[]) ?? []).map((g) => [g.id, g.client_name]));
      setDemandas(((dem as AlfredDemand[]) ?? []).map((d) => ({ ...d, client_name: nome.get(d.group_id) ?? "Cliente" })));
    }
    carregar();
    const ch = supabase.channel("dash-alfred-demands")
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_demands" }, () => carregar())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(ch); };
  }, []);

  async function moverDemanda(id: string, status: DemandStatus) {
    setDemandas((p) => p.map((d) => (d.id === id ? { ...d, status } : d))); // otimista
    const { error } = await supabase.from("alfred_demands").update({ status }).eq("id", id);
    if (error) alert("Não foi possível mover a demanda: " + error.message);
  }

  // Estado do interruptor mestre de disparos (independe do período).
  useEffect(() => {
    supabase.from("dispatch_settings").select("disparos_ativos").maybeSingle()
      .then(({ data }) => { if (data) setDisparosAtivos(data.disparos_ativos); });
  }, []);

  async function toggleDisparos() {
    const novo = !disparosAtivos;
    setDisparosAtivos(novo); // otimista
    setSavingDisparo(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setSavingDisparo(false); return; }
    const { error } = await supabase.from("dispatch_settings").upsert(
      { user_id: u.user.id, disparos_ativos: novo, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) { setDisparosAtivos(!novo); alert("Não foi possível salvar: " + error.message); }
    setSavingDisparo(false);
  }

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
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${disparosAtivos ? "bg-accent/10 text-accent" : "bg-black/10 text-ink-muted"}`}>
              <Clock size={20} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Disparos {disparosAtivos ? "ativos" : "pausados"}</div>
              <div className="text-xs text-ink-muted">
                {disparosAtivos
                  ? "Cron de 1 min · round-robin entre chips"
                  : "Fila parada — nada sai até reativar"}
              </div>
            </div>
            <button
              onClick={toggleDisparos}
              disabled={savingDisparo}
              title={disparosAtivos ? "Pausar disparos" : "Retomar disparos"}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${disparosAtivos ? "bg-accent" : "bg-black/15"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${disparosAtivos ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </BentoCard>
      </BentoGrid>

      {/* Kanban de demandas do Alfred — visão centralizada do atendimento */}
      <DemandasKanban demandas={demandas} onMover={moverDemanda} />
    </div>
  );
}
