import { useEffect, useMemo, useState } from "react";
import { KanbanSquare, Search, Clock, Bell, CalendarCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LeadStatus } from "@/lib/types";

// =====================================================================
// CRM Kanban (passo 1 · read-only)
// ---------------------------------------------------------------------
// Visão do funil sobre dados que JÁ existem: leads.status é a fonte de
// verdade da coluna; o card lê preview/unread/chip da conversation.
// Drag-and-drop e analytics vêm nos próximos passos.
// =====================================================================

/** Modelo canônico do board: cada coluna "possui" um ou mais lead_status. */
const COLUMNS: { key: string; label: string; statuses: LeadStatus[]; dot: string }[] = [
  { key: "novo", label: "Lead novo", statuses: ["novo", "na_fila"], dot: "#888780" },
  { key: "abordagem", label: "Abordagem inicial", statuses: ["aguardando_resposta"], dot: "#378ADD" },
  { key: "respondeu", label: "Respondeu", statuses: ["respondeu"], dot: "#1D9E75" },
  { key: "followup", label: "Em follow-up", statuses: ["em_followup"], dot: "#EF9F27" },
  { key: "negociacao", label: "Em negociação", statuses: ["em_negociacao", "reuniao_agendada"], dot: "#7F77DD" },
  { key: "win", label: "Win", statuses: ["ganho"], dot: "#639922" },
  { key: "loss", label: "Loss", statuses: ["perdido"], dot: "#E24B4A" },
];
// Status que não entram no board (arquivados).
const OCULTOS: LeadStatus[] = ["sem_whatsapp"];

interface ConvJoin {
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  instance_id: string | null;
  whatsapp_instances: { nome: string; persona_nome: string | null } | null;
}
interface BoardLead {
  id: string;
  nome: string;
  empresa: string | null;
  telefone: string;
  status: LeadStatus;
  origem: string;
  tags: string[] | null;
  created_at: string;
  conversations: ConvJoin[];
}
interface Chip { id: string; nome: string; persona_nome: string | null }

/** "há 3 min" / "há 2 h" / "há 4 d" a partir de um ISO. */
function relTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  const m = s / 60;
  if (m < 60) return `há ${Math.floor(m)} min`;
  const h = m / 60;
  if (h < 24) return `há ${Math.floor(h)} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Cor do SLA pela inatividade: fresco → verde, parado → âmbar, esquecido → vermelho. */
function slaColor(iso: string | null): string {
  if (!iso) return "#c7c7cc";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 24) return "#34c759";
  if (h < 72) return "#ff9f0a";
  return "#ff453a";
}

function initials(s: string): string {
  const p = s.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function LeadCard({ lead }: { lead: BoardLead }) {
  const conv = lead.conversations?.[0];
  const titulo = lead.empresa?.trim() || lead.nome;
  const persona = conv?.whatsapp_instances?.persona_nome?.trim() || conv?.whatsapp_instances?.nome;
  const tags = (lead.tags ?? []).filter(Boolean);

  return (
    <div className="group rounded-xl border border-black/5 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: slaColor(conv?.last_message_at ?? null) }}
          title="SLA de atividade"
        />
        <span className="flex-1 truncate text-[13px] font-medium leading-tight">{titulo}</span>
        {!!conv?.unread_count && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-success/15 px-1 text-[10px] font-semibold text-[#1b7a35]">
            {conv.unread_count}
          </span>
        )}
      </div>

      {conv?.last_message_preview ? (
        <p className="mt-1 truncate text-[11.5px] text-ink-muted">{conv.last_message_preview}</p>
      ) : (
        <p className="mt-1 truncate text-[11.5px] text-ink-muted">{lead.nome}</p>
      )}

      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] text-ink-soft">{t}</span>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-ink-muted">
        <Clock size={11} />
        <span>{conv?.last_message_at ? relTime(conv.last_message_at) : relTime(lead.created_at)}</span>
        {persona && (
          <span className="ml-auto flex items-center gap-1 truncate">
            <span className="h-4 w-4 shrink-0 rounded-full bg-accent/10 text-center text-[8px] font-semibold leading-4 text-accent">
              {initials(persona)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function Crm() {
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [chipId, setChipId] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [soNaoLidos, setSoNaoLidos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErro(null);
    const [{ data: ld, error }, { data: ch }] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, nome, empresa, telefone, status, origem, tags, created_at, " +
            "conversations(last_message_preview, last_message_at, unread_count, instance_id, whatsapp_instances(nome, persona_nome))",
        )
        .order("created_at", { ascending: false }),
      supabase.from("whatsapp_instances").select("id, nome, persona_nome").order("nome"),
    ]);
    if (error) setErro(error.message);
    else setLeads((ld as unknown as BoardLead[]) ?? []);
    setChips((ch as Chip[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Realtime: mudança de status do lead ou nova mensagem re-puxa o board.
    const channel = supabase
      .channel("crm-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, []);

  // Filtros aplicados antes de agrupar por coluna.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (OCULTOS.includes(l.status)) return false;
      const conv = l.conversations?.[0];
      if (chipId && conv?.instance_id !== chipId) return false;
      if (soNaoLidos && !conv?.unread_count) return false;
      if (q && !(`${l.nome} ${l.empresa ?? ""} ${l.telefone}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [leads, chipId, busca, soNaoLidos]);

  // Agrupa por coluna respeitando o dono de cada status.
  const porColuna = useMemo(() => {
    const map = new Map<string, BoardLead[]>(COLUMNS.map((c) => [c.key, []]));
    const donoDe = new Map<LeadStatus, string>();
    for (const c of COLUMNS) for (const s of c.statuses) donoDe.set(s, c.key);
    for (const l of filtrados) {
      const k = donoDe.get(l.status);
      if (k) map.get(k)!.push(l);
    }
    return map;
  }, [filtrados]);

  const total = filtrados.length;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col md:h-[calc(100vh-3rem)]">
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-2">
          <KanbanSquare size={22} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
            <p className="text-sm text-ink-muted">Funil de operação — {total} {total === 1 ? "lead" : "leads"} no quadro.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input !h-9 w-44 pl-8 text-sm"
              placeholder="Buscar lead…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <select className="input !h-9 w-40 text-sm" value={chipId} onChange={(e) => setChipId(e.target.value)}>
            <option value="">Todos os chips</option>
            {chips.map((c) => (
              <option key={c.id} value={c.id}>{c.persona_nome?.trim() || c.nome}</option>
            ))}
          </select>
          <button
            onClick={() => setSoNaoLidos((v) => !v)}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors ${
              soNaoLidos ? "border-accent bg-accent text-white" : "border-black/10 text-ink-soft hover:bg-black/5"
            }`}
          >
            <Bell size={14} /> Não lidos
          </button>
          <button
            onClick={load}
            aria-label="Atualizar"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 text-ink-soft hover:bg-black/5"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {erro && (
        <div className="bento-card mb-3 border-danger/30 text-sm text-danger">
          Não consegui carregar o quadro: {erro}
        </div>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const cards = porColuna.get(col.key) ?? [];
          return (
            <section key={col.key} className="flex w-64 shrink-0 flex-col rounded-xl2 bg-black/[0.03]">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.dot }} />
                <span className="text-[13px] font-medium text-ink-soft">{col.label}</span>
                {col.key === "negociacao" && <CalendarCheck size={12} className="text-ink-muted" />}
                <span className="ml-auto text-xs text-ink-muted">{cards.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {loading && cards.length === 0 ? (
                  <div className="px-1 py-6 text-center text-xs text-ink-muted">Carregando…</div>
                ) : cards.length === 0 ? (
                  <div className="px-1 py-6 text-center text-xs text-ink-muted/70">—</div>
                ) : (
                  cards.map((l) => <LeadCard key={l.id} lead={l} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
