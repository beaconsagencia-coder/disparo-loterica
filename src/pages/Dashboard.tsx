import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send, Users, Clock, Rocket, MessageCircle, ChevronRight, X,
  Paperclip, Mic, Square, FileText, ArrowRight, RotateCcw, AlertTriangle,
  Calendar, Check, Loader2, CalendarDays, Image as ImageIcon, FileCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { WhatsappInstance, Message } from "@/lib/types";
import type { AlfredDemand, DemandStatus } from "@/lib/useAlfred";

// =====================================================================
// Paleta dark (auto-contida nesta página) + helpers
// =====================================================================
const C = { ac: "#0a84ff", acT: "#4da3ff", gr: "#30d158", rd: "#ff453a", am: "#ff9f0a" };
function prazoBR(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
function diasAteHoje(iso: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - hoje.getTime()) / 86_400_000);
}
const horaDe = (iso: string | null, fallback?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : (fallback ?? "—");

type MediaKind = "image" | "audio" | "video" | "document";
function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

// Só estes estágios do CRM entram em "Propostas recentes".
const STAGE_PROP: Record<string, { label: string; tone: string }> = {
  proposta_enviada: { label: "Proposta enviada", tone: "#D4537E" },
  contrato: { label: "Contrato", tone: "#1D9E75" },
};
const STAGES_PROP = Object.keys(STAGE_PROP);

interface AgendaItem { id: string; titulo: string | null; quando_texto: string; scheduled_for: string | null; conversation_id: string | null; nome: string }
interface PropostaItem { conversation_id: string; nome: string; preview: string | null; last_at: string | null; stage: string; unread: number }
interface DemandaView extends AlfredDemand { client_name: string }
interface ChatTarget { conversationId: string; nome: string; sub: string }

// =====================================================================
// Drawer de conversa (abre pela agenda e pelas propostas)
// =====================================================================
function ChatDrawer({ target, onClose }: { target: ChatTarget; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("messages")
        .select("*").eq("conversation_id", target.conversationId).order("created_at");
      if (!alive) return;
      setMessages((data as Message[]) ?? []);
      setLoading(false);
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", target.conversationId);
    })();
    const ch = supabase.channel("dash-chat-" + target.conversationId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const msg = p.new as Message;
        if (msg.conversation_id === target.conversationId) {
          setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
        }
      }).subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [target.conversationId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true); setDraft("");
    const { error } = await supabase.functions.invoke("send-reply", { body: { conversation_id: target.conversationId, body } });
    if (error) { setDraft(body); alert("Falha ao enviar: " + error.message); }
    setSending(false);
  }

  // Sobe ao Storage e devolve a URL pública (mesmo bucket do Inbox).
  async function uploadToStorage(file: File) {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? "anon";
    const ext = file.name.includes(".") ? file.name.split(".").pop() : (file.type.split("/")[1] || "bin");
    const path = `${uid}/outbound/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) { alert("Falha no upload: " + error.message); return null; }
    return { url: supabase.storage.from("chat-media").getPublicUrl(path).data.publicUrl, mime: file.type || "application/octet-stream", name: file.name };
  }

  // Envia imagem/áudio/vídeo/documento pela conversa (Edge Function send-reply).
  async function sendFile(file: File) {
    setSending(true);
    const up = await uploadToStorage(file);
    if (!up) { setSending(false); return; }
    const { error } = await supabase.functions.invoke("send-reply", {
      body: { conversation_id: target.conversationId, body: draft.trim() || undefined, media: { url: up.url, kind: kindFromMime(up.mime), mime: up.mime, name: up.name } },
    });
    if (error) alert("Falha ao enviar: " + error.message); else setDraft("");
    setSending(false);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) sendFile(f);
  }

  // Grava nota de voz pelo microfone e envia ao parar.
  async function toggleRecord() {
    if (recording) { mediaRecRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        await sendFile(new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }));
        setRecording(false);
      };
      mr.start(); mediaRecRef.current = mr; setRecording(true);
    } catch { alert("Não consegui acessar o microfone. Verifique a permissão do navegador."); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={`Conversa com ${target.nome}`}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0c0d12] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10" aria-label="Fechar"><X size={20} /></button>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a84ff] text-sm font-medium text-white">{target.nome.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{target.nome}</div>
            <div className="truncate text-[11px] text-white/45">{target.sub}</div>
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex justify-center pt-10 text-white/40"><Loader2 className="animate-spin" size={20} /></div>
          ) : messages.length === 0 ? (
            <p className="pt-10 text-center text-sm text-white/40">Nenhuma mensagem nesta conversa ainda.</p>
          ) : messages.map((m) => {
            const out = m.direction === "outbound";
            return (
              <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${out ? "rounded-br-md bg-[#0a84ff] text-white" : "rounded-bl-md border border-white/10 bg-white/[0.07] text-white/90"}`}>
                  {m.media_url && m.media_kind === "image" && <a href={m.media_url} target="_blank" rel="noreferrer"><img src={m.media_url} alt="" className="mb-1 max-h-56 rounded-lg" /></a>}
                  {m.media_url && m.media_kind === "audio" && <audio controls src={m.media_url} className="mb-1 w-56 max-w-full" />}
                  {m.media_url && m.media_kind === "video" && <video controls src={m.media_url} className="mb-1 max-h-56 rounded-lg" />}
                  {m.media_url && m.media_kind === "document" && <a href={m.media_url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 underline"><FileText size={13} /> {m.media_name || "documento"}</a>}
                  {m.body}
                  <div className={`mt-0.5 text-[10px] ${out ? "text-white/70" : "text-white/40"}`}>{horaDe(m.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/10 px-3 pb-3 pt-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1 pl-4 pr-1.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Enviar uma mensagem…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none" />
            <button onClick={send} disabled={sending || !draft.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0a84ff] text-white disabled:opacity-50" aria-label="Enviar">
              {sending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1 px-1 text-white/55">
            <button onClick={() => docRef.current?.click()} disabled={sending || recording} aria-label="Enviar documento" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"><Paperclip size={18} /></button>
            <button onClick={() => imgRef.current?.click()} disabled={sending || recording} aria-label="Enviar imagem ou vídeo" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"><ImageIcon size={18} /></button>
            <button onClick={toggleRecord} disabled={sending} aria-label={recording ? "Parar gravação" : "Gravar áudio"}
              className={`flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40 ${recording ? "bg-[#ff453a]/20 text-[#ff453a]" : "hover:bg-white/10"}`}>
              {recording ? <Square size={16} /> : <Mic size={18} />}
            </button>
            {recording && <span className="text-[11px] text-[#ff453a]">gravando… toque pra enviar</span>}
          </div>
          <input ref={imgRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPick} />
          <input ref={docRef} type="file" className="hidden" onChange={onPick} />
        </div>
      </aside>
    </div>
  );
}

// =====================================================================
// Kanban de demandas (dark, scroll horizontal)
// =====================================================================
const DEMAND_COLS: { key: DemandStatus; label: string; dot: string }[] = [
  { key: "pendente", label: "Aberto", dot: C.am },
  { key: "em_andamento", label: "Em progresso", dot: C.ac },
  { key: "concluida", label: "Concluído", dot: C.gr },
];
const proximoStatus: Record<DemandStatus, DemandStatus> = {
  pendente: "em_andamento", em_andamento: "concluida", concluida: "pendente",
};

function DemandCard({ d, onMover }: { d: DemandaView; onMover: (id: string, s: DemandStatus) => void }) {
  const dias = diasAteHoje(d.prazo);
  const atrasada = d.status !== "concluida" && dias < 0;
  const hoje = d.status !== "concluida" && dias === 0;
  const concluida = d.status === "concluida";
  const next = proximoStatus[d.status];
  return (
    <article className={`rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 ${concluida ? "opacity-70" : ""}`}>
      <h4 className={`text-sm font-medium leading-snug ${concluida ? "text-white/60 line-through" : "text-white"}`}>{d.titulo}</h4>
      <div className="mt-0.5 truncate text-xs text-white/45">{d.client_name}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: atrasada ? C.rd : hoje ? C.am : "rgba(255,255,255,0.45)" }}>
          {concluida ? <Check size={12} /> : atrasada ? <AlertTriangle size={12} /> : <Calendar size={12} />}
          {concluida ? "feito" : prazoBR(d.prazo) + (atrasada ? " · atrasada" : hoje ? " · hoje" : "")}
        </span>
        <button onClick={() => onMover(d.id, next)}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10"
          title={concluida ? "Reabrir" : "Avançar"}>
          {concluida ? <><RotateCcw size={11} /> Reabrir</> : <>Avançar <ArrowRight size={11} /></>}
        </button>
      </div>
    </article>
  );
}

// =====================================================================
// Dashboard (dark, mobile-first)
// =====================================================================
interface Stats { leads: number; pendentes: number; disparos: number; reunioesHoje: number }

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ leads: 0, pendentes: 0, disparos: 0, reunioesHoje: 0 });
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);
  const [disparosAtivos, setDisparosAtivos] = useState(true);
  const [demandas, setDemandas] = useState<DemandaView[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [propostas, setPropostas] = useState<PropostaItem[]>([]);
  const [chat, setChat] = useState<ChatTarget | null>(null);

  const refreshDemandas = useCallback(async () => {
    const [{ data: grps }, { data: dem }] = await Promise.all([
      supabase.from("alfred_groups").select("id, client_name"),
      supabase.from("alfred_demands").select("id, group_id, titulo, descricao, status, prazo").order("prazo"),
    ]);
    const nome = new Map<string, string>(((grps as { id: string; client_name: string }[]) ?? []).map((g) => [g.id, g.client_name]));
    setDemandas(((dem as AlfredDemand[]) ?? []).map((d) => ({ ...d, client_name: nome.get(d.group_id) ?? "Cliente" })));
  }, []);

  const refreshStats = useCallback(async () => {
    const count = (q: any) => q.then((r: any) => r.count ?? 0);
    const hojeInicio = new Date(); hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date(hojeInicio); hojeFim.setDate(hojeFim.getDate() + 1);
    const [leads, pendentes, disparos, reunioesHoje, inst] = await Promise.all([
      count(supabase.from("leads").select("id", { count: "exact", head: true })),
      count(supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "pendente")),
      count(supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "enviado").gte("sent_at", hojeInicio.toISOString())),
      count(supabase.from("meetings").select("id", { count: "exact", head: true }).neq("status", "cancelada").gte("scheduled_for", hojeInicio.toISOString()).lt("scheduled_for", hojeFim.toISOString())),
      supabase.from("whatsapp_instances").select("*").order("nome"),
    ]);
    setStats({ leads, pendentes, disparos, reunioesHoje });
    setInstances((inst as any).data ?? []);
  }, []);

  const refreshAgenda = useCallback(async () => {
    const hojeInicio = new Date(); hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date(hojeInicio); hojeFim.setDate(hojeFim.getDate() + 1);
    const { data } = await supabase.from("meetings")
      .select("id, titulo, quando_texto, scheduled_for, conversation_id, leads(nome)")
      .neq("status", "cancelada")
      .gte("scheduled_for", hojeInicio.toISOString()).lt("scheduled_for", hojeFim.toISOString())
      .order("scheduled_for");
    setAgenda(((data as any[]) ?? []).map((m) => ({
      id: m.id, titulo: m.titulo, quando_texto: m.quando_texto, scheduled_for: m.scheduled_for,
      conversation_id: m.conversation_id, nome: m.leads?.nome ?? "Lead",
    })));
  }, []);

  const refreshPropostas = useCallback(async () => {
    // Apenas conversas de leads nas colunas "Proposta enviada" e "Contrato" do CRM.
    const { data } = await supabase.from("conversations")
      .select("id, last_message_at, last_message_preview, unread_count, leads!inner(nome, crm_stage)")
      .in("leads.crm_stage", STAGES_PROP)
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(12);
    setPropostas(((data as any[]) ?? []).map((c) => ({
      conversation_id: c.id, nome: c.leads?.nome ?? "Lead", preview: c.last_message_preview,
      last_at: c.last_message_at, stage: c.leads?.crm_stage ?? "proposta_enviada", unread: c.unread_count ?? 0,
    })));
  }, []);

  useEffect(() => {
    refreshStats(); refreshDemandas(); refreshAgenda(); refreshPropostas();
    supabase.from("dispatch_settings").select("disparos_ativos").maybeSingle()
      .then(({ data }) => { if (data) setDisparosAtivos(data.disparos_ativos); });
    const ch = supabase.channel("dash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_demands" }, () => refreshDemandas())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => refreshPropostas())
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => refreshAgenda())
      .subscribe();
    const id = setInterval(() => { refreshStats(); refreshDemandas(); refreshAgenda(); refreshPropostas(); }, 15_000);
    return () => { clearInterval(id); void supabase.removeChannel(ch); };
  }, [refreshStats, refreshDemandas, refreshAgenda, refreshPropostas]);

  async function moverDemanda(id: string, status: DemandStatus) {
    setDemandas((p) => p.map((d) => (d.id === id ? { ...d, status } : d)));
    const { error } = await supabase.from("alfred_demands").update({ status }).eq("id", id);
    if (error) alert("Não foi possível mover a demanda: " + error.message);
  }

  async function toggleDisparos() {
    const novo = !disparosAtivos;
    setDisparosAtivos(novo);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { error } = await supabase.from("dispatch_settings").upsert(
      { user_id: u.user.id, disparos_ativos: novo, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { setDisparosAtivos(!novo); alert("Não foi possível salvar: " + error.message); }
  }

  const conectados = instances.filter((i) => i.status === "conectado").length;
  const kpis = [
    { label: "Disparos", value: stats.disparos.toLocaleString("pt-BR"), icon: Send, hint: "hoje" },
    { label: "Leads", value: stats.leads.toLocaleString("pt-BR"), icon: Users, hint: "base total" },
    { label: "Na fila", value: stats.pendentes.toLocaleString("pt-BR"), icon: Clock, hint: "aguardando" },
    { label: "Reuniões", value: String(stats.reunioesHoje), icon: CalendarDays, hint: "hoje" },
  ];

  return (
    <div className="-m-4 min-h-full bg-[#0a0b10] p-4 text-[#f4f5f7] sm:-m-6 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#0a84ff]/30 bg-[#0a84ff]/15 text-[#4da3ff]"><Rocket size={18} /></span>
            <div>
              <div className="text-[15px] font-semibold">Disparo Lotérica</div>
              <div className="text-xs text-white/40">{new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-right text-xs leading-tight text-white/55">Disparos<br />ativos</span>
            <button onClick={toggleDisparos} aria-label="Disparos ativos" role="switch" aria-checked={disparosAtivos}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${disparosAtivos ? "bg-[#30d158]" : "bg-white/15"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${disparosAtivos ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/45">{k.label}</span>
                <k.icon size={15} className="text-white/45" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">{k.value}</div>
              <div className="text-xs text-white/40">{k.hint}</div>
            </div>
          ))}
        </div>

        <section className="mb-6">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Agenda de hoje</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
            {agenda.length === 0 ? (
              <p className="px-4 py-7 text-center text-sm text-white/40">Nenhuma reunião marcada para hoje.</p>
            ) : agenda.map((m, i) => (
              <button key={m.id} disabled={!m.conversation_id}
                onClick={() => m.conversation_id && setChat({ conversationId: m.conversation_id, nome: m.nome, sub: m.titulo || "Reunião de hoje" })}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${i > 0 ? "border-t border-white/[0.07]" : ""} ${m.conversation_id ? "hover:bg-white/[0.04]" : "cursor-default"}`}>
                <span className="w-12 shrink-0 text-[15px] font-semibold">{horaDe(m.scheduled_for, m.quando_texto)}</span>
                <span className="h-7 w-[3px] shrink-0 rounded-full bg-[#30d158]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.nome}</span>
                  <span className="block truncate text-xs text-white/45">{m.titulo || "Reunião"}</span>
                </span>
                {m.conversation_id
                  ? <MessageCircle size={17} className="shrink-0 text-[#4da3ff]" />
                  : <span className="text-[11px] text-white/30">sem chat</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Demandas dos clientes</h2>
          {demandas.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-white/40">As demandas aparecem aqui quando o Alfred capta um pedido no chat.</p>
          ) : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DEMAND_COLS.map((col) => {
                const itens = demandas.filter((d) => d.status === col.key).sort((a, b) => a.prazo.localeCompare(b.prazo));
                return (
                  <div key={col.key} className="w-[200px] shrink-0">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                      <span className="text-sm font-medium">{col.label}</span>
                      <span className="text-xs text-white/40">{itens.length}</span>
                    </div>
                    <div className="space-y-2.5">
                      {itens.map((d) => <DemandCard key={d.id} d={d} onMover={moverDemanda} />)}
                      {itens.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 py-4 text-center text-xs text-white/30">Vazio</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Propostas recentes</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
            {propostas.length === 0 ? (
              <p className="px-4 py-7 text-center text-sm text-white/40">Nenhuma conversa ainda.</p>
            ) : propostas.map((p, i) => {
              const st = STAGE_PROP[p.stage] ?? STAGE_PROP.proposta_enviada;
              return (
                <button key={p.conversation_id}
                  onClick={() => setChat({ conversationId: p.conversation_id, nome: p.nome, sub: st.label })}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${i > 0 ? "border-t border-white/[0.07]" : ""}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0a84ff]/20 text-xs font-medium text-[#4da3ff]">{p.nome.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.nome}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]" style={{ background: st.tone + "22", color: st.tone }}>
                      <FileCheck size={11} /> {st.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] text-white/40">{p.last_at ? new Date(p.last_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : ""}</span>
                    {p.unread > 0 && <span className="ml-auto mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0a84ff] px-1 text-[10px] font-medium text-white">{p.unread}</span>}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-white/30" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="pb-2">
          <div className="mb-2.5 flex items-center gap-2 text-sm">
            <span className="font-medium text-white/70">Instâncias ativas</span>
            <span className="text-xs text-white/40">· {conectados} de {instances.length} online</span>
          </div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {instances.length === 0 && <span className="text-sm text-white/40">Nenhum chip conectado.</span>}
            {instances.map((i) => (
              <span key={i.id} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-[13px] text-white">
                <span className="h-2 w-2 rounded-full" style={{ background: i.status === "conectado" ? C.gr : i.status === "conectando" ? C.am : C.rd }} />
                {i.nome}
              </span>
            ))}
          </div>
        </section>
      </div>

      {chat && <ChatDrawer target={chat} onClose={() => setChat(null)} />}
    </div>
  );
}
