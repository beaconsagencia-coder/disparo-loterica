import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  KanbanSquare, Search, RefreshCw, X, Bot, Paperclip, Send, FileText, Loader2,
  Phone, Tag as TagIcon, Building2, Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { maskPhoneBR } from "@/lib/phone";

// =====================================================================
// CRM Kanban — funil de prospecção (estilo Trello)
// 7 etapas, drag-and-drop, etiquetas, filtro de período e modal do card
// com a conversa do WhatsApp embutida (ler + responder sem sair da tela).
// =====================================================================

const STAGES: { key: string; label: string; dot: string }[] = [
  { key: "disparados", label: "Disparados", dot: "#888780" },
  { key: "negociando_datas", label: "Negociando Datas", dot: "#378ADD" },
  { key: "reuniao_agendada", label: "Reunião Agendada", dot: "#7F77DD" },
  { key: "no_show", label: "No Show", dot: "#EF9F27" },
  { key: "proposta_enviada", label: "Proposta Enviada", dot: "#D4537E" },
  { key: "contrato", label: "Contrato", dot: "#1D9E75" },
  { key: "contrato_assinado", label: "Contrato Assinado", dot: "#639922" },
];
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

interface ConvLite {
  id: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  instance_id: string | null;
  ai_enabled: boolean;
  whatsapp_instances: { nome: string; persona_nome: string | null } | null;
}
interface BoardLead {
  id: string; nome: string; empresa: string | null; telefone: string;
  status: string; origem: string; tags: string[] | null; created_at: string; crm_stage: string;
  conversations: ConvLite[];
}

// --- helpers visuais ---
function initials(s: string) {
  const p = (s || "").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
function slaColor(iso: string | null) {
  if (!iso) return "#c7c7cc";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 24) return "#34c759";
  if (h < 72) return "#ff9f0a";
  return "#ff453a";
}
const LABEL_COLORS = ["#0a84ff", "#34c759", "#ff9f0a", "#ff453a", "#5e5ce6", "#bf5af2", "#64d2ff", "#ff375f"];
function labelColor(t: string) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length];
}
function relTime(iso?: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

// --- períodos de filtro ---
const PERIODOS = [
  { key: "tudo", label: "Tudo" },
  { key: "hoje", label: "Hoje" },
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "custom", label: "Personalizado" },
] as const;

export default function Crm() {
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<string>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null); // lead id no modal

  async function load() {
    setLoading(true);
    setErro(null);
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, nome, empresa, telefone, status, origem, tags, created_at, crm_stage, " +
          "conversations(id, last_message_preview, last_message_at, unread_count, instance_id, ai_enabled, whatsapp_instances(nome, persona_nome))",
      )
      .not("status", "in", "(perdido,sem_whatsapp)")
      .order("created_at", { ascending: false });
    if (error) setErro(error.message);
    else setLeads((data as unknown as BoardLead[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("crm-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, []);

  // Janela de datas do filtro de período.
  const janela = useMemo(() => {
    const now = Date.now();
    if (periodo === "hoje") { const d = new Date(); d.setHours(0, 0, 0, 0); return { ini: d.getTime(), fim: Infinity }; }
    if (periodo === "7") return { ini: now - 7 * 864e5, fim: Infinity };
    if (periodo === "30") return { ini: now - 30 * 864e5, fim: Infinity };
    if (periodo === "custom") {
      const ini = de ? new Date(de + "T00:00:00").getTime() : -Infinity;
      const fim = ate ? new Date(ate + "T23:59:59").getTime() : Infinity;
      return { ini, fim };
    }
    return { ini: -Infinity, fim: Infinity };
  }, [periodo, de, ate]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter((l) => {
      const t = new Date(l.created_at).getTime();
      if (t < janela.ini || t > janela.fim) return false;
      if (q && !`${l.nome} ${l.empresa ?? ""} ${l.telefone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, busca, janela]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, BoardLead[]>(STAGES.map((s) => [s.key, []]));
    for (const l of filtrados) {
      const k = STAGE_LABEL[l.crm_stage] ? l.crm_stage : "disparados";
      m.get(k)!.push(l);
    }
    return m;
  }, [filtrados]);

  async function moveStage(leadId: string, stage: string) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, crm_stage: stage } : l)));
    const { error } = await supabase.from("leads").update({ crm_stage: stage }).eq("id", leadId);
    if (error) { alert("Não consegui mover: " + error.message); load(); return; }
    // Registra o desfecho na reunião do lead para alimentar os relatórios
    // (no-show e venda). O trigger do banco cuida do sync inverso.
    if (stage === "no_show" || stage === "contrato_assinado") {
      const { data: mt } = await supabase.from("meetings")
        .select("id").eq("lead_id", leadId).neq("status", "cancelada")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (mt) {
        const patch = stage === "no_show" ? { status: "no_show" } : { gerou_venda: true };
        await supabase.from("meetings").update(patch).eq("id", (mt as { id: string }).id);
      }
    }
  }

  const leadAberto = leads.find((l) => l.id === aberto) ?? null;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col md:h-[calc(100vh-3rem)]">
      <header className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <KanbanSquare size={22} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
            <p className="text-sm text-ink-muted">{filtrados.length} leads no funil</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input !h-9 w-44 pl-8 text-sm" placeholder="Buscar lead…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="inline-flex rounded-xl bg-black/5 p-1">
            {PERIODOS.map((p) => (
              <button key={p.key} onClick={() => setPeriodo(p.key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${periodo === p.key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {periodo === "custom" && (
            <div className="flex items-center gap-1">
              <input type="date" className="input !h-9 text-xs" value={de} onChange={(e) => setDe(e.target.value)} />
              <span className="text-ink-muted">–</span>
              <input type="date" className="input !h-9 text-xs" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          )}
          <button onClick={load} aria-label="Atualizar" className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 text-ink-soft hover:bg-black/5">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {erro && <div className="bento-card mb-3 border-danger/30 text-sm text-danger">Não consegui carregar o quadro: {erro}</div>}

      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {STAGES.map((col) => {
          const cards = porEtapa.get(col.key) ?? [];
          const over = overStage === col.key;
          return (
            <section
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOverStage(col.key); }}
              onDragLeave={() => setOverStage((s) => (s === col.key ? null : s))}
              onDrop={(e) => { e.preventDefault(); setOverStage(null); if (dragId) moveStage(dragId, col.key); setDragId(null); }}
              className={`flex w-72 shrink-0 flex-col rounded-xl2 transition-colors ${over ? "bg-accent/10 ring-2 ring-accent/40" : "bg-black/[0.03]"}`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.dot }} />
                <span className="text-[13px] font-semibold text-ink-soft">{col.label}</span>
                <span className="ml-auto rounded-full bg-black/5 px-1.5 text-xs text-ink-muted">{cards.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {loading && cards.length === 0 ? (
                  <div className="px-1 py-6 text-center text-xs text-ink-muted">Carregando…</div>
                ) : cards.length === 0 ? (
                  <div className="px-1 py-6 text-center text-xs text-ink-muted/60">—</div>
                ) : (
                  cards.map((l) => (
                    <LeadCard key={l.id} lead={l} onOpen={() => setAberto(l.id)} onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {leadAberto && <LeadModal lead={leadAberto} onClose={() => setAberto(null)} onMove={moveStage} reload={load} />}
    </div>
  );
}

function LeadCard({ lead, onOpen, onDragStart, onDragEnd }: { lead: BoardLead; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const conv = lead.conversations?.[0];
  const titulo = lead.empresa?.trim() || lead.nome;
  const persona = conv?.whatsapp_instances?.persona_nome?.trim() || conv?.whatsapp_instances?.nome;
  const tags = (lead.tags ?? []).filter(Boolean);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="group cursor-pointer rounded-xl border border-black/5 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md"
    >
      {tags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="h-1.5 w-7 rounded-full" style={{ backgroundColor: labelColor(t) }} title={t} />
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: slaColor(conv?.last_message_at ?? null) }} />
        <span className="flex-1 truncate text-[13px] font-medium leading-tight">{titulo}</span>
        {!!conv?.unread_count && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-success/15 px-1 text-[10px] font-semibold text-[#1b7a35]">{conv.unread_count}</span>
        )}
      </div>
      {conv?.last_message_preview && <p className="mt-1 truncate text-[11.5px] text-ink-muted">{conv.last_message_preview}</p>}
      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-ink-muted">
        <Clock size={11} />
        <span>{relTime(conv?.last_message_at ?? lead.created_at)}</span>
        {persona && (
          <span className="ml-auto h-4 w-4 shrink-0 rounded-full bg-accent/10 text-center text-[8px] font-semibold leading-4 text-accent" title={persona}>
            {initials(persona)}
          </span>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Modal do card: info + etiquetas + conversa do WhatsApp embutida
// =====================================================================
type MediaKind = "image" | "audio" | "video" | "document";
function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}
interface Msg { id: string; direction: "inbound" | "outbound"; body: string | null; created_at: string; media_url?: string | null; media_kind?: string | null; media_name?: string | null }

function MediaContent({ m }: { m: Msg }) {
  const u = m.media_url!;
  if (m.media_kind === "image") return <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="max-h-52 max-w-full rounded-lg" /></a>;
  if (m.media_kind === "video") return <video src={u} controls className="max-h-52 max-w-full rounded-lg" />;
  if (m.media_kind === "audio") return <audio src={u} controls className="w-48 max-w-full" />;
  return <a href={u} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline"><FileText size={15} /> {m.media_name || "documento"}</a>;
}

function LeadModal({ lead, onClose, onMove, reload }: { lead: BoardLead; onClose: () => void; onMove: (id: string, stage: string) => void; reload: () => void }) {
  const conv = lead.conversations?.[0];
  const convId = conv?.id ?? null;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [tags, setTags] = useState<string[]>((lead.tags ?? []).filter(Boolean));
  const [novaTag, setNovaTag] = useState("");
  const [aiOn, setAiOn] = useState(conv?.ai_enabled ?? false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!convId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("messages")
        .select("id, direction, body, created_at, media_url, media_kind, media_name")
        .eq("conversation_id", convId).order("created_at");
      if (active) setMessages((data as Msg[]) ?? []);
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId);
    })();
    const ch = supabase.channel("crm-modal-" + convId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (p) => setMessages((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg])))
      .subscribe();
    return () => { active = false; void supabase.removeChannel(ch); };
  }, [convId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!draft.trim() || !convId) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.functions.invoke("send-reply", { body: { conversation_id: convId, body } });
    if (error) { setDraft(body); alert("Falha ao enviar: " + error.message); }
    setSending(false);
  }

  async function sendFile(file: File) {
    if (!convId) return;
    setSending(true);
    const { data: u } = await supabase.auth.getUser();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : (file.type.split("/")[1] || "bin");
    const path = `${u.user?.id}/outbound/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) { alert("Falha no upload: " + up.error.message); setSending(false); return; }
    const url = supabase.storage.from("chat-media").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.functions.invoke("send-reply", {
      body: { conversation_id: convId, body: draft.trim() || undefined, media: { url, kind: kindFromMime(file.type || ""), mime: file.type, name: file.name } },
    });
    if (error) alert("Falha ao enviar: " + error.message); else setDraft("");
    setSending(false);
  }

  async function toggleAi() {
    if (!convId) return;
    const v = !aiOn; setAiOn(v);
    await supabase.from("conversations").update({ ai_enabled: v }).eq("id", convId);
  }

  async function salvarTags(next: string[]) {
    setTags(next);
    await supabase.from("leads").update({ tags: next }).eq("id", lead.id);
    reload();
  }
  function addTag() {
    const t = novaTag.trim();
    if (!t || tags.includes(t)) { setNovaTag(""); return; }
    salvarTags([...tags, t]); setNovaTag("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="glass-strong flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl2 md:flex-row" onClick={(e) => e.stopPropagation()}>
        {/* Coluna info */}
        <div className="flex w-full flex-col gap-3 overflow-y-auto border-b border-black/5 p-4 md:w-72 md:border-b-0 md:border-r">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{lead.empresa?.trim() || lead.nome}</div>
              <div className="text-xs text-ink-muted">{lead.nome}</div>
            </div>
            <button onClick={onClose} className="rounded-full p-1.5 text-ink-muted hover:bg-black/5 md:hidden"><X size={18} /></button>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-ink-soft"><Phone size={14} className="text-ink-muted" /> {maskPhoneBR(lead.telefone)}</div>
            <div className="flex items-center gap-2 text-ink-soft"><Building2 size={14} className="text-ink-muted" /> origem: {lead.origem}</div>
            <div className="flex items-center gap-2 text-ink-soft"><Clock size={14} className="text-ink-muted" /> criado {relTime(lead.created_at)}</div>
            {conv?.whatsapp_instances && <div className="text-xs text-ink-muted">via {conv.whatsapp_instances.persona_nome?.trim() || conv.whatsapp_instances.nome}</div>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Etapa do funil</label>
            <select className="input !h-9 text-sm" value={lead.crm_stage} onChange={(e) => onMove(lead.id, e.target.value)}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-soft"><TagIcon size={12} /> Etiquetas</label>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: labelColor(t) }}>
                  {t}
                  <button onClick={() => salvarTags(tags.filter((x) => x !== t))} className="opacity-80 hover:opacity-100"><X size={11} /></button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-xs text-ink-muted">Sem etiquetas</span>}
            </div>
            <input
              className="input !h-8 text-sm" placeholder="Nova etiqueta + Enter" value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            />
          </div>
        </div>

        {/* Coluna chat */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-2.5">
            <span className="text-sm font-medium">Conversa WhatsApp</span>
            <div className="flex items-center gap-1.5">
              {convId && (
                <button onClick={toggleAi} className={`chip ${aiOn ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`} title={aiOn ? "IA respondendo — clique para assumir" : "Manual — clique para devolver à IA"}>
                  <Bot size={14} /> <span className="hidden sm:inline">{aiOn ? "IA" : "Manual"}</span>
                </button>
              )}
              <button onClick={onClose} className="rounded-full p-1.5 text-ink-muted hover:bg-black/5"><X size={18} /></button>
            </div>
          </header>

          <div className="flex-1 space-y-1.5 overflow-auto bg-black/[0.02] px-4 py-3">
            {!convId ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-ink-muted">Este lead ainda não tem conversa no WhatsApp.</div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-ink-muted">Sem mensagens ainda.</div>
            ) : (
              messages.map((m) => {
                const out = m.direction === "outbound";
                const placeholder = m.media_url && /^(📷|🎤|🎥|📄|📇)\s?\[/.test(m.body ?? "");
                return (
                  <Fragment key={m.id}>
                    <div className={`w-fit max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${out ? "ml-auto rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-white"}`}>
                      {m.media_url && <div className="mb-1"><MediaContent m={m} /></div>}
                      {(!placeholder) && m.body}
                      <span className={`ml-2 inline-block align-bottom text-[10px] ${out ? "text-white/70" : "text-ink-muted"}`}>
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </Fragment>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          {convId && (
            <div className="flex items-end gap-2 border-t border-black/5 p-3">
              <input ref={fileRef} type="file" className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendFile(f); }} />
              <button onClick={() => fileRef.current?.click()} disabled={sending} className="shrink-0 rounded-full p-2.5 text-ink-muted hover:bg-black/5 disabled:opacity-50" title="Anexar">
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
              </button>
              <textarea
                rows={1} className="input max-h-28 flex-1 resize-none leading-snug" placeholder="Escreva uma resposta…"
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button onClick={send} disabled={sending || !draft.trim()} className="btn-accent shrink-0 !px-3 !py-2.5" aria-label="Enviar"><Send size={16} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
