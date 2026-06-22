import { Fragment, useEffect, useRef, useState } from "react";
import { Send, Search, Bot, Trash2, ArrowLeft, Paperclip, Mic, Square, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Conversation, Message } from "@/lib/types";
import { maskPhoneBR } from "@/lib/phone";

type MediaKind = "image" | "audio" | "video" | "document";
function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

/** Renderiza o anexo de uma mensagem (imagem/áudio/vídeo/documento). */
function MediaContent({ m }: { m: Message }) {
  const u = m.media_url!;
  if (m.media_kind === "image") {
    return <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="imagem" className="max-h-64 max-w-full rounded-lg" /></a>;
  }
  if (m.media_kind === "video") return <video src={u} controls className="max-h-64 max-w-full rounded-lg" />;
  if (m.media_kind === "audio") return <audio src={u} controls className="w-52 max-w-full" />;
  return (
    <a href={u} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline underline-offset-2">
      <FileText size={16} className="shrink-0" /> {m.media_name || "documento"}
    </a>
  );
}

// --- helpers de apresentação ---------------------------------------------
function initials(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || /^\d+$/.test(n)) return "#";
  const p = n.split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-[#0a84ff]", "bg-[#34c759]", "bg-[#ff9f0a]", "bg-[#ff453a]",
  "bg-[#5e5ce6]", "bg-[#bf5af2]", "bg-[#64d2ff]", "bg-[#ff375f]",
];
function avatarColor(seed?: string | null): string {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColor(name)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </div>
  );
}

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Hora (hoje), "Ontem" ou data — para a lista de conversas. */
function relTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (isSameDay(d, now)) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (isSameDay(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Rótulo do separador de dia dentro do histórico. */
function dayLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  if (isSameDay(d, now)) return "Hoje";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (isSameDay(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export default function Inbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevActive = useRef<string | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Carrega conversas (Inbox unificado: todas as instâncias num só painel)
  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("*, leads(nome, telefone), whatsapp_instances(nome)")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    setConversations((data as any) ?? []);
  }

  useEffect(() => {
    loadConversations();
    // Realtime: novas mensagens atualizam a lista e o chat aberto
    const channel = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        loadConversations();
        setActiveId((curr) => {
          if (curr === msg.conversation_id) {
            setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
          }
          return curr;
        });
      })
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, []);

  // Carrega mensagens da conversa ativa + zera não-lidas
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("created_at");
      setMessages((data as any) ?? []);
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId);
    })();
  }, [activeId]);

  // Rola para o fim: instantâneo ao abrir a conversa, suave em mensagens novas.
  useEffect(() => {
    const behavior = prevActive.current === activeId ? "smooth" : "auto";
    prevActive.current = activeId;
    endRef.current?.scrollIntoView({ behavior });
  }, [messages, activeId]);

  function resizeTextarea() {
    const t = taRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 128) + "px";
  }

  async function send() {
    if (!draft.trim() || !activeId) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    // Roteia pela MESMA instância da conversa (Edge Function send-reply)
    const { error } = await supabase.functions.invoke("send-reply", {
      body: { conversation_id: activeId, body },
    });
    if (error) {
      setDraft(body); // restaura em caso de falha
      alert("Falha ao enviar: " + error.message);
    }
    setSending(false);
  }

  // Sobe um arquivo ao Storage e devolve a URL pública.
  async function uploadToStorage(file: File): Promise<{ url: string; mime: string; name: string } | null> {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? "anon";
    const ext = file.name.includes(".") ? file.name.split(".").pop() : (file.type.split("/")[1] || "bin");
    const path = `${uid}/outbound/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) { alert("Falha no upload: " + error.message); return null; }
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    return { url: data.publicUrl, mime: file.type || "application/octet-stream", name: file.name };
  }

  // Envia um arquivo (imagem/áudio/vídeo/documento) pela conversa ativa.
  async function sendFile(file: File) {
    if (!activeId) return;
    setSending(true);
    const up = await uploadToStorage(file);
    if (!up) { setSending(false); return; }
    const kind = kindFromMime(up.mime);
    const caption = draft.trim();
    const { error } = await supabase.functions.invoke("send-reply", {
      body: { conversation_id: activeId, body: caption || undefined, media: { url: up.url, kind, mime: up.mime, name: up.name } },
    });
    if (error) alert("Falha ao enviar: " + error.message);
    else { setDraft(""); if (taRef.current) taRef.current.style.height = "auto"; }
    setSending(false);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (f) sendFile(f);
  }

  // Grava uma nota de voz pelo microfone e envia ao parar.
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
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
    } catch {
      alert("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  async function toggleAi(id: string, value: boolean) {
    await supabase.from("conversations").update({ ai_enabled: value }).eq("id", id);
    loadConversations();
  }

  async function deleteConversation(id: string) {
    if (!confirm("Apagar todo o histórico desta conversa? As mensagens serão removidas (o contato continua na base). Isso não pode ser desfeito.")) return;
    // Apaga as mensagens e a conversa (as mensagens caem por cascade ao remover a conversa).
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return alert("Falha ao apagar: " + error.message);
    setActiveId(null);
    setMessages([]);
    loadConversations();
  }

  const active = conversations.find((c) => c.id === activeId);
  const filtered = conversations.filter((c) =>
    (c.leads?.nome ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-6xl gap-4 md:h-[calc(100vh-3rem)]">
      {/* Lista de conversas — no mobile some quando uma conversa está aberta */}
      <div className={`glass w-full flex-col rounded-xl2 p-3 md:flex md:w-80 ${activeId ? "hidden md:flex" : "flex"}`}>
        <h1 className="px-2 pb-2 text-lg font-semibold tracking-tight">Inbox</h1>
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-2.5 text-ink-muted" />
          <input
            className="input py-2 pl-9"
            placeholder="Buscar lead…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-0.5 overflow-auto">
          {filtered.map((c) => {
            const selected = activeId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                  selected ? "bg-accent text-white" : "hover:bg-black/5"
                }`}
              >
                <Avatar name={c.leads?.nome} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.leads?.nome ?? "—"}</span>
                    <span className={`shrink-0 text-[10px] ${selected ? "text-white/70" : "text-ink-muted"}`}>
                      {relTime(c.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${selected ? "text-white/80" : "text-ink-muted"}`}>
                      {c.last_message_preview ?? "Sem mensagens"}
                    </span>
                    {c.unread_count > 0 && !selected && (
                      <span className="ml-1 shrink-0 rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <span className={`mt-0.5 block text-[10px] ${selected ? "text-white/60" : "text-ink-muted"}`}>
                    via {c.whatsapp_instances?.nome ?? "—"}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="px-3 py-4 text-sm text-ink-muted">Nenhuma conversa.</p>}
        </div>
      </div>

      {/* Painel de chat — no mobile só aparece com uma conversa aberta */}
      <div className={`glass flex-1 flex-col rounded-xl2 md:flex ${active ? "flex" : "hidden md:flex"}`}>
        {active ? (
          <>
            <header className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2.5 md:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  onClick={() => setActiveId(null)}
                  className="-ml-1 rounded-full p-1.5 text-ink-muted hover:bg-black/5 md:hidden"
                  title="Voltar para as conversas"
                >
                  <ArrowLeft size={20} />
                </button>
                <Avatar name={active.leads?.nome} size={38} />
                <div className="min-w-0">
                  <div className="truncate font-medium leading-tight">{active.leads?.nome}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {active.leads?.telefone && maskPhoneBR(active.leads.telefone)} · via {active.whatsapp_instances?.nome}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => toggleAi(active.id, !active.ai_enabled)}
                  className={`chip ${active.ai_enabled ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}
                  title={active.ai_enabled ? "IA está respondendo — clique para assumir" : "Você está respondendo — clique para devolver à IA"}
                >
                  <Bot size={14} />
                  <span className="hidden sm:inline">{active.ai_enabled ? "IA respondendo" : "Manual"}</span>
                </button>
                <button
                  onClick={() => deleteConversation(active.id)}
                  className="rounded-full p-2 text-ink-muted transition-colors hover:bg-danger/10 hover:text-[#b4231b]"
                  title="Apagar histórico desta conversa"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-1.5 overflow-auto px-3 py-4 md:px-5">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const showSep = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
                const out = m.direction === "outbound";
                return (
                  <Fragment key={m.id}>
                    {showSep && (
                      <div className="my-2 flex justify-center">
                        <span className="rounded-full bg-black/5 px-3 py-0.5 text-[11px] text-ink-muted">
                          {dayLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div
                      className={`w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm md:max-w-[70%] ${
                        out ? "ml-auto rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-white/80"
                      }`}
                    >
                      {m.media_url && <div className="mb-1"><MediaContent m={m} /></div>}
                      {/* Não repete o rótulo de placeholder quando a mídia já é exibida. */}
                      {(!m.media_url || !/^(📷|🎤|🎥|📄|📇)\s?\[/.test(m.body ?? "")) && m.body}
                      <span className={`ml-2 inline-block align-bottom text-[10px] ${out ? "text-white/70" : "text-ink-muted"}`}>
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
              <div ref={endRef} />
            </div>

            <div
              className="flex items-end gap-2 border-t border-black/5 p-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                onChange={onPickFile}
              />
              <button
                className="shrink-0 rounded-full p-2.5 text-ink-muted transition-colors hover:bg-black/5 disabled:opacity-50"
                disabled={sending || recording}
                onClick={() => fileRef.current?.click()}
                aria-label="Anexar arquivo"
                title="Anexar imagem, áudio ou documento"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
              </button>
              <textarea
                ref={taRef}
                rows={1}
                className="input max-h-32 flex-1 resize-none leading-snug"
                placeholder={recording ? "Gravando áudio…" : "Escreva uma resposta…"}
                value={draft}
                disabled={recording}
                onChange={(e) => setDraft(e.target.value)}
                onInput={resizeTextarea}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
              />
              {draft.trim() ? (
                <button
                  className="btn-accent shrink-0 !px-3 !py-2.5"
                  disabled={sending}
                  onClick={send}
                  aria-label="Enviar"
                >
                  <Send size={16} />
                </button>
              ) : (
                <button
                  className={`shrink-0 rounded-full !px-3 !py-2.5 transition-colors ${
                    recording ? "bg-danger text-white" : "btn-accent"
                  }`}
                  disabled={sending}
                  onClick={toggleRecord}
                  aria-label={recording ? "Parar e enviar" : "Gravar áudio"}
                  title={recording ? "Parar e enviar" : "Gravar nota de voz"}
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-muted">
            Selecione uma conversa para ver o histórico unificado.
          </div>
        )}
      </div>
    </div>
  );
}
