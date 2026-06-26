import { useEffect, useState } from "react";
import {
  Bot, Smartphone, KeyRound, Plus, Trash2, Power, PowerOff, ChevronDown,
  Save, Loader2, QrCode, Users, FolderOpen, CalendarRange, Wallet, StickyNote, RefreshCw,
} from "lucide-react";
import { useAlfred, type AlfredConfig, type AlfredConnection, type AlfredGroup, type AlfredContext } from "@/lib/useAlfred";

// =====================================================================
// /alfred — CRUD do agente Alfred (grupos de WhatsApp de clientes).
// Lógica 100% preservada; visual no design system do app (Bento + Apple-like).
// =====================================================================
export default function Alfred() {
  const { config, connection, groups, contexts, loading, saveConfig, connectWhatsapp, checkStatus, addGroup, toggleGroup, removeGroup, saveContext } = useAlfred();

  if (loading) {
    return <p className="mx-auto max-w-6xl text-sm text-ink-muted">Carregando…</p>;
  }

  const ativos = groups.filter((g) => g.active).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Bot size={20} /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alfred</h1>
          <p className="text-sm text-ink-muted">Agente de IA para os grupos de WhatsApp dos seus clientes.</p>
        </div>
      </header>

      {/* Bento: conexão + configurações globais */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ConexaoWhatsapp connection={connection} onConnect={connectWhatsapp} onCheckStatus={checkStatus} />
        <ConfigForm config={config} onSave={saveConfig} />
      </div>

      {/* Cadastro de grupo */}
      <NovoGrupoForm onAdd={addGroup} />

      {/* Painel de grupos */}
      <div className="mb-2 mt-6 flex items-center gap-2">
        <Users size={18} className="text-ink-soft" />
        <h2 className="font-medium">Grupos gerenciados</h2>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink-muted">{ativos} ativo(s) de {groups.length}</span>
      </div>

      {groups.length === 0 ? (
        <div className="bento-card text-center text-sm text-ink-muted">Nenhum grupo cadastrado ainda.</div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupItem
              key={g.id}
              group={g}
              context={contexts[g.id]}
              onToggle={toggleGroup}
              onRemove={removeGroup}
              onSaveContext={saveContext}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Texto de feedback discreto (vermelho quando começa com "Erro"). */
function Feedback({ msg }: { msg: string }) {
  if (!msg) return null;
  const erro = msg.toLowerCase().startsWith("erro");
  return <span className={`text-xs ${erro ? "text-danger" : "text-ink-muted"}`}>{msg}</span>;
}

// ---- Conexão do chip DEDICADO do Alfred (isolado dos disparos) -----
function statusInfo(s: string) {
  if (s === "conectado") return { dot: "bg-success", label: "Conectado", chip: "bg-success/15 text-[#1b7a35]" };
  if (s === "conectando") return { dot: "bg-warning", label: "Conectando…", chip: "bg-warning/20 text-[#9a6400]" };
  return { dot: "bg-ink-muted/60", label: "Desconectado", chip: "bg-black/10 text-ink-muted" };
}

function ConexaoWhatsapp({ connection, onConnect, onCheckStatus }: {
  connection: AlfredConnection;
  onConnect: () => Promise<string | null>;
  onCheckStatus: () => Promise<string | null>;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [checando, setChecando] = useState(false);
  const [msg, setMsg] = useState("");
  const st = statusInfo(connection.connection_status);

  useEffect(() => { if (connection.connection_status === "conectado") setQr(null); }, [connection.connection_status]);

  // Enquanto "conectando", consulta o estado real na Evolution (não depende
  // só do webhook): a cada 3s, por até ~2 min, até conectar/desconectar.
  useEffect(() => {
    if (connection.connection_status !== "conectando") return;
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      const s = await onCheckStatus();
      if (s === "conectado" || s === "desconectado" || n >= 40) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [connection.connection_status, onCheckStatus]);

  async function conectar() {
    setCarregando(true); setMsg("");
    try {
      const code = await onConnect();
      setQr(code);
      setMsg(code ? "Escaneie o QR em Aparelhos conectados." : "Instância criada, mas sem QR — tente de novo.");
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCarregando(false);
    }
  }

  async function atualizar() {
    setChecando(true); setMsg("");
    try {
      const s = await onCheckStatus();
      setMsg(s === "conectado" ? "Conectado ✅" : s === "conectando" ? "Ainda conectando…" : "Desconectado.");
    } finally {
      setChecando(false);
    }
  }

  return (
    <section className="bento-card flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Smartphone size={17} /></span>
          <div>
            <h2 className="font-medium">WhatsApp do Alfred</h2>
            <p className="text-xs text-ink-muted">Chip dedicado, isolado dos disparos.</p>
          </div>
        </div>
        <span className={`chip ${st.chip}`}>
          <span className={`h-2 w-2 rounded-full ${st.dot}`} /> {st.label}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">Número</span>
          <span className="font-medium tabular-nums">{connection.numero ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">Instância</span>
          <span className="truncate pl-2 font-mono text-xs text-ink-soft">{connection.evolution_instance ?? "—"}</span>
        </div>
      </div>

      {qr && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="rounded-xl border border-black/5 bg-white p-2 shadow-sm">
            <img src={qr} alt="QR Code de conexão" className="h-48 w-48 rounded-lg" />
          </div>
          <p className="text-xs text-ink-muted">A tela atualiza sozinha ao conectar.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-accent" onClick={conectar} disabled={carregando}>
          {carregando ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
          {connection.connection_status === "conectado" ? "Reconectar" : "Conectar WhatsApp"}
        </button>
        <button className="btn-ghost" onClick={atualizar} disabled={checando} title="Conferir o status na Evolution">
          <RefreshCw size={15} className={checando ? "animate-spin" : ""} /> Atualizar status
        </button>
        <Feedback msg={msg} />
      </div>
    </section>
  );
}

// ---- Config global (chaves + prompt) -------------------------------
function ConfigForm({ config, onSave }: { config: AlfredConfig; onSave: (c: AlfredConfig) => Promise<void> }) {
  const [geminiKey, setGeminiKey] = useState(config.gemini_api_key ?? "");
  const [evoKey, setEvoKey] = useState(config.evolution_api_key ?? "");
  const [evoUrl, setEvoUrl] = useState(config.evolution_api_url ?? "");
  const [prompt, setPrompt] = useState(config.system_prompt ?? "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setGeminiKey(config.gemini_api_key ?? "");
    setEvoKey(config.evolution_api_key ?? "");
    setEvoUrl(config.evolution_api_url ?? "");
    setPrompt(config.system_prompt ?? "");
  }, [config]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg("");
    try {
      await onSave({
        gemini_api_key: geminiKey.trim() || null,
        evolution_api_key: evoKey.trim() || null,
        evolution_api_url: evoUrl.trim() || null,
        system_prompt: prompt,
      });
      setMsg("Configurações salvas ✅");
      setTimeout(() => setMsg(""), 2500);
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submit} className="bento-card flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><KeyRound size={17} /></span>
        <div>
          <h2 className="font-medium">Configurações globais</h2>
          <p className="text-xs text-ink-muted">Chaves e o prompt de sistema do agente.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Gemini API Key</label>
          <input type="password" className="input font-mono" placeholder="AIza…" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Evolution API URL <span className="text-ink-muted">(opcional)</span></label>
            <input className="input" placeholder="https://evolution…" value={evoUrl} onChange={(e) => setEvoUrl(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Evolution API Key <span className="text-ink-muted">(opcional)</span></label>
            <input type="password" className="input font-mono" value={evoKey} onChange={(e) => setEvoKey(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Prompt de sistema global</label>
          <textarea rows={4} className="input resize-none text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn-accent" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {salvando ? "Salvando…" : "Salvar configuração"}
        </button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}

// ---- Cadastro de grupo ---------------------------------------------
function NovoGrupoForm({ onAdd }: { onAdd: (jid: string, cliente: string, instance?: string) => Promise<void> }) {
  const [jid, setJid] = useState("");
  const [cliente, setCliente] = useState("");
  const [instance, setInstance] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jid.trim() || !cliente.trim()) { setMsg("Erro: informe o remoteJid e o cliente."); return; }
    setSalvando(true); setMsg("");
    try {
      await onAdd(jid, cliente, instance);
      setJid(""); setCliente(""); setInstance(""); setMsg("Grupo cadastrado ✅");
      setTimeout(() => setMsg(""), 2500);
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submit} className="bento-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Plus size={17} /></span>
        <h2 className="font-medium">Novo grupo</h2>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">remoteJid do grupo</label>
          <input className="input font-mono text-xs" placeholder="1203630…@g.us" value={jid} onChange={(e) => setJid(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Cliente</label>
          <input className="input" placeholder="Lotérica São José" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Instância <span className="text-ink-muted">(opcional)</span></label>
          <input className="input" placeholder="chip na Evolution" value={instance} onChange={(e) => setInstance(e.target.value)} />
        </div>
        <button type="submit" className="btn-accent h-[42px]" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar
        </button>
      </div>
      {msg && <div className="mt-2"><Feedback msg={msg} /></div>}
    </form>
  );
}

// ---- Card de grupo: status + on/off + editor de contexto -----------
function GroupItem({
  group, context, onToggle, onRemove, onSaveContext,
}: {
  group: AlfredGroup;
  context?: AlfredContext;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSaveContext: (groupId: string, patch: Omit<AlfredContext, "group_id">) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [drive, setDrive] = useState(context?.drive_link ?? "");
  const [crono, setCrono] = useState(context?.cronograma ?? "");
  const [fin, setFin] = useState(context?.financeiro ?? "");
  const [obs, setObs] = useState(context?.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setDrive(context?.drive_link ?? "");
    setCrono(context?.cronograma ?? "");
    setFin(context?.financeiro ?? "");
    setObs(context?.observacoes ?? "");
  }, [context]);

  async function salvarContexto(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg("");
    try {
      await onSaveContext(group.id, {
        drive_link: drive.trim() || null,
        cronograma: crono.trim() || null,
        financeiro: fin.trim() || null,
        observacoes: obs.trim() || null,
      });
      setMsg("Contexto salvo ✅");
      setTimeout(() => setMsg(""), 2500);
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  }

  async function alternar() {
    try { await onToggle(group.id, !group.active); } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  }
  async function excluir() {
    if (!confirm(`Remover o grupo "${group.client_name}"?`)) return;
    try { await onRemove(group.id); } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <div className="rounded-xl2 border border-black/5 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Linha principal — painel de controle */}
      <div className="flex items-center gap-3 p-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${group.active ? "bg-success/10 text-[#1b7a35]" : "bg-black/[0.04] text-ink-muted"}`}>
          <Users size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{group.client_name}</span>
            <span className={`chip ${group.active ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${group.active ? "bg-success" : "bg-ink-muted/60"}`} />
              {group.active ? "Ativo" : "Inativo"}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-ink-muted">{group.remote_jid}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={alternar}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              group.active ? "text-ink-soft hover:bg-black/5" : "bg-accent/10 text-accent hover:bg-accent/15"
            }`}
            title={group.active ? "Desligar o bot neste grupo" : "Ligar o bot neste grupo"}
          >
            {group.active ? <PowerOff size={14} /> : <Power size={14} />}
            <span className="hidden sm:inline">{group.active ? "Desligar" : "Ligar"}</span>
          </button>
          <button
            onClick={() => setAberto((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-black/5 hover:text-ink-soft"
            title="Editar contexto"
          >
            <ChevronDown size={16} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={excluir}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
            title="Remover grupo"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Editor de contexto (expansível) */}
      {aberto && (
        <form onSubmit={salvarContexto} className="border-t border-black/5 bg-black/[0.015] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><FolderOpen size={13} className="text-ink-muted" /> Link do Drive</label>
              <input className="input" value={drive} onChange={(e) => setDrive(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><Wallet size={13} className="text-ink-muted" /> Status financeiro</label>
              <input className="input" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><CalendarRange size={13} className="text-ink-muted" /> Cronograma atual</label>
              <textarea rows={2} className="input resize-none text-sm" value={crono} onChange={(e) => setCrono(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><StickyNote size={13} className="text-ink-muted" /> Observações</label>
              <textarea rows={2} className="input resize-none text-sm" value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className="btn-accent !py-2" disabled={salvando}>
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {salvando ? "Salvando…" : "Salvar contexto"}
            </button>
            <Feedback msg={msg} />
          </div>
        </form>
      )}
    </div>
  );
}
