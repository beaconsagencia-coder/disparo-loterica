import { useEffect, useState } from "react";
import { useAlfred, type AlfredConfig, type AlfredConnection, type AlfredGroup, type AlfredContext } from "@/lib/useAlfred";

// =====================================================================
// /alfred — CRUD do agente Alfred (grupos de WhatsApp de clientes).
// Foco estritamente na LÓGICA (hooks + fetch ao Supabase). Sem estilos:
// elementos semânticos simples, prontos para você estilizar depois.
// Módulo isolado: não importa nada do design system do app.
// =====================================================================
export default function Alfred() {
  const { config, connection, groups, contexts, loading, saveConfig, connectWhatsapp, addGroup, toggleGroup, removeGroup, saveContext } = useAlfred();

  if (loading) return <p>Carregando…</p>;

  return (
    <div>
      <h1>Alfred — Agente de grupos</h1>
      <ConexaoWhatsapp connection={connection} onConnect={connectWhatsapp} />
      <hr />
      <ConfigForm config={config} onSave={saveConfig} />
      <hr />
      <NovoGrupoForm onAdd={addGroup} />
      <hr />
      <h2>Grupos ({groups.length})</h2>
      {groups.length === 0 && <p>Nenhum grupo cadastrado.</p>}
      <ul>
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
      </ul>
    </div>
  );
}

// ---- Conexão do chip DEDICADO do Alfred (isolado dos disparos) -----
function ConexaoWhatsapp({ connection, onConnect }: { connection: AlfredConnection; onConnect: () => Promise<string | null> }) {
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // Quando a conexão fica "conectado" (via realtime), some o QR.
  useEffect(() => { if (connection.connection_status === "conectado") setQr(null); }, [connection.connection_status]);

  async function conectar() {
    setMsg("Gerando QR…");
    try {
      const code = await onConnect();
      setQr(code);
      setMsg(code ? "Escaneie o QR no WhatsApp (Aparelhos conectados)." : "Instância criada, mas sem QR — tente novamente.");
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div>
      <h2>WhatsApp do Alfred (chip dedicado)</h2>
      <p>Status: {connection.connection_status}{connection.numero ? ` — ${connection.numero}` : ""}</p>
      <p>Instância: {connection.evolution_instance ?? "—"}</p>
      <button type="button" onClick={conectar}>
        {connection.connection_status === "conectado" ? "Reconectar" : "Conectar WhatsApp"}
      </button>
      {msg && <span>{msg}</span>}
      {qr && (
        <div>
          <img src={qr} alt="QR Code de conexão" width={240} height={240} />
        </div>
      )}
    </div>
  );
}

// ---- Config global (chaves + prompt) -------------------------------
function ConfigForm({ config, onSave }: { config: AlfredConfig; onSave: (c: AlfredConfig) => Promise<void> }) {
  const [geminiKey, setGeminiKey] = useState(config.gemini_api_key ?? "");
  const [evoKey, setEvoKey] = useState(config.evolution_api_key ?? "");
  const [evoUrl, setEvoUrl] = useState(config.evolution_api_url ?? "");
  const [prompt, setPrompt] = useState(config.system_prompt ?? "");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setGeminiKey(config.gemini_api_key ?? "");
    setEvoKey(config.evolution_api_key ?? "");
    setEvoUrl(config.evolution_api_url ?? "");
    setPrompt(config.system_prompt ?? "");
  }, [config]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Salvando…");
    try {
      await onSave({
        gemini_api_key: geminiKey.trim() || null,
        evolution_api_key: evoKey.trim() || null,
        evolution_api_url: evoUrl.trim() || null,
        system_prompt: prompt,
      });
      setMsg("Salvo.");
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Configuração</h2>
      <div>
        <label>Gemini API Key</label>
        <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza..." />
      </div>
      <div>
        <label>Evolution API URL (opcional)</label>
        <input value={evoUrl} onChange={(e) => setEvoUrl(e.target.value)} placeholder="https://evolution..." />
      </div>
      <div>
        <label>Evolution API Key (opcional)</label>
        <input type="password" value={evoKey} onChange={(e) => setEvoKey(e.target.value)} />
      </div>
      <div>
        <label>Prompt de sistema global</label>
        <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <button type="submit">Salvar configuração</button>
      {msg && <span>{msg}</span>}
    </form>
  );
}

// ---- Cadastro de grupo ---------------------------------------------
function NovoGrupoForm({ onAdd }: { onAdd: (jid: string, cliente: string, instance?: string) => Promise<void> }) {
  const [jid, setJid] = useState("");
  const [cliente, setCliente] = useState("");
  const [instance, setInstance] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jid.trim() || !cliente.trim()) { setMsg("Informe o remoteJid e o cliente."); return; }
    setMsg("Salvando…");
    try {
      await onAdd(jid, cliente, instance);
      setJid(""); setCliente(""); setInstance(""); setMsg("Grupo cadastrado.");
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Novo grupo</h2>
      <div>
        <label>remoteJid do grupo</label>
        <input value={jid} onChange={(e) => setJid(e.target.value)} placeholder="1203630...@g.us" />
      </div>
      <div>
        <label>Cliente</label>
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Lotérica São José" />
      </div>
      <div>
        <label>Instância (chip) — opcional</label>
        <input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="nome da instância na Evolution" />
      </div>
      <button type="submit">Adicionar grupo</button>
      {msg && <span>{msg}</span>}
    </form>
  );
}

// ---- Item de grupo: on/off + editor de contexto --------------------
function GroupItem({
  group, context, onToggle, onRemove, onSaveContext,
}: {
  group: AlfredGroup;
  context?: AlfredContext;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSaveContext: (groupId: string, patch: Omit<AlfredContext, "group_id">) => Promise<void>;
}) {
  const [drive, setDrive] = useState(context?.drive_link ?? "");
  const [crono, setCrono] = useState(context?.cronograma ?? "");
  const [fin, setFin] = useState(context?.financeiro ?? "");
  const [obs, setObs] = useState(context?.observacoes ?? "");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setDrive(context?.drive_link ?? "");
    setCrono(context?.cronograma ?? "");
    setFin(context?.financeiro ?? "");
    setObs(context?.observacoes ?? "");
  }, [context]);

  async function salvarContexto(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Salvando…");
    try {
      await onSaveContext(group.id, {
        drive_link: drive.trim() || null,
        cronograma: crono.trim() || null,
        financeiro: fin.trim() || null,
        observacoes: obs.trim() || null,
      });
      setMsg("Contexto salvo.");
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
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
    <li>
      <div>
        <strong>{group.client_name}</strong> — {group.remote_jid} — {group.active ? "Ativo" : "Inativo"}
        <button type="button" onClick={alternar}>{group.active ? "Desligar" : "Ligar"}</button>
        <button type="button" onClick={excluir}>Excluir</button>
      </div>

      <form onSubmit={salvarContexto}>
        <div>
          <label>Link do Drive</label>
          <input value={drive} onChange={(e) => setDrive(e.target.value)} />
        </div>
        <div>
          <label>Cronograma atual</label>
          <textarea rows={2} value={crono} onChange={(e) => setCrono(e.target.value)} />
        </div>
        <div>
          <label>Status financeiro</label>
          <textarea rows={2} value={fin} onChange={(e) => setFin(e.target.value)} />
        </div>
        <div>
          <label>Observações</label>
          <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <button type="submit">Salvar contexto</button>
        {msg && <span>{msg}</span>}
      </form>
    </li>
  );
}
