import { useEffect, useRef, useState } from "react";
import { Send, Search, Bot, Trash2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Conversation, Message } from "@/lib/types";
import { maskPhoneBR } from "@/lib/phone";

export default function Inbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

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
          if (curr === msg.conversation_id) setMessages((m) => [...m, msg]);
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
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
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-6xl gap-4 md:h-[calc(100vh-3rem)]">
      {/* Lista de conversas — no mobile some quando uma conversa está aberta */}
      <div className={`glass w-full flex-col rounded-xl2 p-3 md:flex md:w-80 ${activeId ? "hidden md:flex" : "flex"}`}>
        <h1 className="px-2 pb-2 text-lg font-semibold tracking-tight">Inbox</h1>
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-2.5 text-ink-muted" />
          <input
            className="input pl-9 py-2"
            placeholder="Buscar lead…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-1 overflow-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors ${
                activeId === c.id ? "bg-accent text-white" : "hover:bg-black/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{c.leads?.nome ?? "—"}</span>
                {c.unread_count > 0 && activeId !== c.id && (
                  <span className="ml-2 rounded-full bg-accent px-1.5 text-xs text-white">{c.unread_count}</span>
                )}
              </div>
              <span className={`truncate text-xs ${activeId === c.id ? "text-white/80" : "text-ink-muted"}`}>
                {c.last_message_preview ?? "Sem mensagens"}
              </span>
              <span className={`mt-0.5 text-[10px] ${activeId === c.id ? "text-white/70" : "text-ink-muted"}`}>
                via {c.whatsapp_instances?.nome ?? "—"}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-4 text-sm text-ink-muted">Nenhuma conversa.</p>}
        </div>
      </div>

      {/* Painel de chat — no mobile só aparece com uma conversa aberta */}
      <div className={`glass flex-1 flex-col rounded-xl2 md:flex ${active ? "flex" : "hidden md:flex"}`}>
        {active ? (
          <>
            <header className="flex items-center justify-between border-b border-black/5 px-4 py-3 md:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  onClick={() => setActiveId(null)}
                  className="-ml-1 rounded-full p-2 text-ink-muted hover:bg-black/5 md:hidden"
                  title="Voltar para as conversas"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <div className="truncate font-medium">{active.leads?.nome}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {active.leads?.telefone && maskPhoneBR(active.leads.telefone)} · responde via{" "}
                    {active.whatsapp_instances?.nome}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAi(active.id, !active.ai_enabled)}
                  className={`chip ${active.ai_enabled ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}
                  title={active.ai_enabled ? "IA está respondendo — clique para assumir" : "Você está respondendo — clique para devolver à IA"}
                >
                  <Bot size={14} /> {active.ai_enabled ? "IA respondendo" : "Manual"}
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

            <div className="flex-1 space-y-2 overflow-auto px-3 py-4 md:px-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm md:max-w-[70%] ${
                    m.direction === "outbound"
                      ? "ml-auto rounded-br-sm bg-accent text-white"
                      : "rounded-bl-sm bg-white/80"
                  }`}
                >
                  {m.body}
                  <div className={`mt-0.5 text-[10px] ${m.direction === "outbound" ? "text-white/70" : "text-ink-muted"}`}>
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="flex items-center gap-2 border-t border-black/5 p-3">
              <input
                className="input"
                placeholder="Escreva uma resposta…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              />
              <button className="btn-accent !px-3" disabled={sending || !draft.trim()} onClick={send}>
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
            Selecione uma conversa para ver o histórico unificado.
          </div>
        )}
      </div>
    </div>
  );
}
