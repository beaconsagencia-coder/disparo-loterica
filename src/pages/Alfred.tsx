import { useEffect, useRef, useState } from "react";
import {
  Bot, Smartphone, Sparkles, Plus, Trash2, Power, PowerOff, ChevronDown,
  Save, Loader2, QrCode, Users, FolderOpen, CalendarRange, Wallet, StickyNote, RefreshCw,
  Building2, ScrollText, Search, Square, CheckSquare, ListChecks, MessageSquare, Eraser, X, Brain, UserPlus,
  KanbanSquare, CalendarClock, AlertTriangle, Megaphone, Layers, Rocket,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  useAlfred, faseEfetiva, type AlfredConfig, type AlfredConnection, type AlfredGroup, type AlfredContext, type AlfredTask,
  type AlfredMessage, type AlfredMemory, type AlfredMember, type AlfredDemand, type DemandStatus,
  type AlfredAsset, type AssetStatus, type AssetTipo, type Fase,
} from "@/lib/useAlfred";

// =====================================================================
// /alfred — CRUD do agente Alfred (grupos de WhatsApp de clientes).
// Lógica 100% preservada; visual no design system do app (Bento + Apple-like).
// =====================================================================
export default function Alfred() {
  const { config, connection, groups, contexts, tasks, memory, members, demands, assets, loading, saveConfig, connectWhatsapp, checkStatus, listarGruposWhatsapp, addGroup, toggleGroup, removeGroup, setFase, saveContext, toggleTask, clearHistory, deleteMemory, addMember, removeMember, addDemand, updateDemand, deleteDemand, addAsset, updateAsset, deleteAsset } = useAlfred();
  const [conversa, setConversa] = useState<AlfredGroup | null>(null);
  const [view, setView] = useState<"grupos" | "demandas">("grupos");

  if (loading) {
    return <p className="mx-auto max-w-6xl text-sm text-ink-muted">Carregando…</p>;
  }

  const ativos = groups.filter((g) => g.active).length;
  const totalDemandas = Object.values(demands).reduce((n, arr) => n + arr.filter((d) => d.status !== "concluida").length, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Bot size={20} /></span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Alfred</h1>
            <p className="text-sm text-ink-muted">Agente de IA para os grupos de WhatsApp dos seus clientes.</p>
          </div>
        </div>
        <div className="inline-flex self-start rounded-xl bg-black/5 p-1 sm:self-auto">
          <button onClick={() => setView("grupos")} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${view === "grupos" ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"}`}>
            <Users size={14} className="mr-1 inline" /> Grupos
          </button>
          <button onClick={() => setView("demandas")} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${view === "demandas" ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"}`}>
            <KanbanSquare size={14} className="mr-1 inline" /> Demandas{totalDemandas > 0 ? ` (${totalDemandas})` : ""}
          </button>
        </div>
      </header>

      {view === "demandas" ? (
        <DemandasBoard groups={groups.filter((g) => g.active)} demands={demands} onAdd={addDemand} onUpdate={updateDemand} onDelete={deleteDemand} />
      ) : (
      <>
      {/* Bento: conexão + configurações globais */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ConexaoWhatsapp connection={connection} onConnect={connectWhatsapp} onCheckStatus={checkStatus} />
        <ConfigForm config={config} onSave={saveConfig} />
      </div>

      {/* Cadastro de grupo */}
      <NovoGrupoForm onAdd={addGroup} onListGroups={listarGruposWhatsapp} jaCadastrados={groups.map((g) => g.remote_jid)} />

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
              tasks={tasks[g.id] ?? []}
              memory={memory[g.id] ?? []}
              members={members[g.id] ?? []}
              assets={assets[g.id] ?? []}
              onToggle={toggleGroup}
              onRemove={removeGroup}
              onSetFase={setFase}
              onSaveContext={saveContext}
              onToggleTask={toggleTask}
              onVerConversa={() => setConversa(g)}
              onDeleteMemory={deleteMemory}
              onAddMember={addMember}
              onRemoveMember={removeMember}
              onAddAsset={addAsset}
              onUpdateAsset={updateAsset}
              onDeleteAsset={deleteAsset}
            />
          ))}
        </div>
      )}
      </>
      )}

      {conversa && <ConversaModal group={conversa} onClose={() => setConversa(null)} onClear={clearHistory} />}
    </div>
  );
}

// ---- Quadro Kanban de demandas (coluna por cliente) ----------------
const DEMAND_STATUS: { key: DemandStatus; label: string; chip: string; dot: string }[] = [
  { key: "pendente", label: "Pendente", chip: "bg-warning/20 text-[#9a6400]", dot: "bg-warning" },
  { key: "em_andamento", label: "Em andamento", chip: "bg-accent/15 text-accent", dot: "bg-accent" },
  { key: "concluida", label: "Concluída", chip: "bg-success/15 text-[#1b7a35]", dot: "bg-success" },
];
const statusInfoDemanda = (s: DemandStatus) => DEMAND_STATUS.find((x) => x.key === s) ?? DEMAND_STATUS[0];

function prazoBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function diasAteHoje(iso: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - hoje.getTime()) / 86_400_000);
}

function DemandasBoard({
  groups, demands, onAdd, onUpdate, onDelete,
}: {
  groups: AlfredGroup[];
  demands: Record<string, AlfredDemand[]>;
  onAdd: (groupId: string, titulo: string, prazo: string, descricao?: string) => Promise<void>;
  onUpdate: (id: string, groupId: string, patch: Partial<Pick<AlfredDemand, "status" | "prazo" | "titulo">>) => Promise<void>;
  onDelete: (id: string, groupId: string) => Promise<void>;
}) {
  if (groups.length === 0) {
    return <div className="bento-card text-center text-sm text-ink-muted">Nenhum grupo ativo. Ative um grupo para acompanhar suas demandas aqui.</div>;
  }
  // Ordena as demandas de cada coluna: abertas primeiro, depois por prazo.
  const ordem: Record<DemandStatus, number> = { pendente: 0, em_andamento: 1, concluida: 2 };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {groups.map((g) => {
        const lista = [...(demands[g.id] ?? [])].sort((a, b) => (ordem[a.status] - ordem[b.status]) || a.prazo.localeCompare(b.prazo));
        const abertas = lista.filter((d) => d.status !== "concluida").length;
        return (
          <section key={g.id} className="flex w-72 shrink-0 flex-col rounded-xl2 bg-black/[0.03]">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="truncate text-[13px] font-semibold text-ink-soft">{g.client_name}</span>
              <span className="ml-auto rounded-full bg-black/5 px-1.5 text-xs text-ink-muted">{abertas}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
              {lista.map((d) => (
                <DemandCard key={d.id} demand={d} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
              {lista.length === 0 && <div className="px-1 py-4 text-center text-xs text-ink-muted/60">Sem demandas</div>}
              <NovaDemandaForm groupId={g.id} onAdd={onAdd} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DemandCard({
  demand, onUpdate, onDelete,
}: {
  demand: AlfredDemand;
  onUpdate: (id: string, groupId: string, patch: Partial<Pick<AlfredDemand, "status" | "prazo" | "titulo">>) => Promise<void>;
  onDelete: (id: string, groupId: string) => Promise<void>;
}) {
  const st = statusInfoDemanda(demand.status);
  const dias = diasAteHoje(demand.prazo);
  const atrasado = demand.status !== "concluida" && dias < 0;
  const hoje = demand.status !== "concluida" && dias === 0;
  return (
    <div className="rounded-xl border border-black/5 bg-white p-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
        <span className="flex-1 text-[13px] font-medium leading-tight">{demand.titulo}</span>
        <button onClick={() => onDelete(demand.id, demand.group_id)} title="Remover demanda" className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger">
          <X size={13} />
        </button>
      </div>
      {demand.descricao && <p className="mt-1 line-clamp-2 text-[11.5px] text-ink-muted">{demand.descricao}</p>}

      <div className="mt-2 flex items-center gap-1.5">
        <span className={`chip ${atrasado ? "bg-danger/15 text-danger" : "bg-black/5 text-ink-muted"}`} title="Prazo de entrega">
          {atrasado ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}
          {prazoBR(demand.prazo)}{atrasado ? " · atrasada" : hoje ? " · hoje" : ""}
        </span>
        <input
          type="date" value={demand.prazo} onChange={(e) => onUpdate(demand.id, demand.group_id, { prazo: e.target.value })}
          className="ml-auto rounded-md border border-black/10 bg-white px-1 py-0.5 text-[11px] text-ink-muted" title="Alterar prazo"
        />
      </div>

      <div className="mt-2 inline-flex w-full rounded-lg bg-black/5 p-0.5">
        {DEMAND_STATUS.map((s) => (
          <button key={s.key} onClick={() => onUpdate(demand.id, demand.group_id, { status: s.key })}
            className={`flex-1 rounded-md px-1 py-1 text-[10.5px] font-medium transition-colors ${demand.status === s.key ? "bg-white shadow-sm " + s.chip.split(" ").slice(1).join(" ") : "text-ink-muted hover:text-ink-soft"}`}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NovaDemandaForm({ groupId, onAdd }: { groupId: string; onAdd: (groupId: string, titulo: string, prazo: string, descricao?: string) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const prazoDefault = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState(prazoDefault);
  const [salvando, setSalvando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSalvando(true);
    try { await onAdd(groupId, titulo, prazo); setTitulo(""); setPrazo(prazoDefault); setAberto(false); }
    catch (err) { alert(err instanceof Error ? err.message : String(err)); }
    finally { setSalvando(false); }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-black/15 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-accent">
        <Plus size={14} /> Nova demanda
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-black/10 bg-white p-2 shadow-sm">
      <input autoFocus className="input !py-1.5 text-sm" placeholder="Ex.: Arte do bolão da Mega" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <input type="date" className="input !py-1.5 text-xs" value={prazo} onChange={(e) => setPrazo(e.target.value)} title="Prazo de entrega (obrigatório)" />
        <button type="submit" className="btn-accent !py-1.5 text-xs" disabled={salvando}>{salvando ? "…" : "Adicionar"}</button>
        <button type="button" onClick={() => setAberto(false)} className="btn-ghost !py-1.5 text-xs">Cancelar</button>
      </div>
    </form>
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

// ---- Comportamento global (prompt) — sem chaves (herdadas do SDR) --
function ConfigForm({ config, onSave }: { config: AlfredConfig; onSave: (c: AlfredConfig) => Promise<void> }) {
  const [prompt, setPrompt] = useState(config.system_prompt ?? "");
  const [handoff, setHandoff] = useState(config.handoff_ativo);
  const [intervir, setIntervir] = useState(String(config.intervene_after_min));
  const [cooldown, setCooldown] = useState(String(config.team_cooldown_min));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setPrompt(config.system_prompt ?? "");
    setHandoff(config.handoff_ativo);
    setIntervir(String(config.intervene_after_min));
    setCooldown(String(config.team_cooldown_min));
  }, [config]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg("");
    try {
      await onSave({
        system_prompt: prompt,
        handoff_ativo: handoff,
        intervene_after_min: Math.max(1, Math.floor(Number(intervir) || 30)),
        team_cooldown_min: Math.max(1, Math.floor(Number(cooldown) || 5)),
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
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Sparkles size={17} /></span>
        <div>
          <h2 className="font-medium">Comportamento do Alfred</h2>
          <p className="text-xs text-ink-muted">Prompt global + regras de espera (handoff com a equipe).</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <label className="mb-1 block text-xs font-medium text-ink-soft">Prompt de sistema global</label>
        <textarea rows={5} className="input flex-1 resize-none text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <p className="mt-1.5 text-xs text-ink-muted">A chave de IA é a mesma do <strong>Agente SDR</strong> — não precisa configurar aqui.</p>
      </div>

      {/* Handoff: aguardar a equipe vs responder na hora */}
      <div className="mt-3 rounded-xl border border-black/10 bg-white/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Aguardar a equipe (handoff)</div>
            <div className="text-xs text-ink-muted">
              {handoff ? "A equipe responde primeiro; o Alfred só intervém após o prazo." : "Desligado: o Alfred responde na hora (mas nunca à equipe)."}
            </div>
          </div>
          <button type="button" onClick={() => setHandoff((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${handoff ? "bg-accent" : "bg-black/15"}`}
            title={handoff ? "Desligar (responder na hora)" : "Ligar (aguardar a equipe)"}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${handoff ? "left-6" : "left-1"}`} />
          </button>
        </div>

        {handoff && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Intervir após (min)</label>
              <input type="number" min={1} className="input tabular-nums" value={intervir} onChange={(e) => setIntervir(e.target.value)} title="Tempo sem resposta da equipe até o Alfred intervir" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Pausa após equipe (min)</label>
              <input type="number" min={1} className="input tabular-nums" value={cooldown} onChange={(e) => setCooldown(e.target.value)} title="Tempo que o Alfred espera depois da equipe falar" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn-accent" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {salvando ? "Salvando…" : "Salvar"}
        </button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}

// ---- Cadastro de grupo ---------------------------------------------
function NovoGrupoForm({
  onAdd, onListGroups, jaCadastrados,
}: {
  onAdd: (jid: string, cliente: string, instance?: string) => Promise<void>;
  onListGroups: () => Promise<{ id: string; subject: string }[]>;
  jaCadastrados: string[];
}) {
  const [jid, setJid] = useState("");
  const [cliente, setCliente] = useState("");
  const [instance, setInstance] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  // Descoberta automática de grupos do chip do Alfred.
  const [grupos, setGrupos] = useState<{ id: string; subject: string }[]>([]);
  const [buscando, setBuscando] = useState(false);

  const jaSet = new Set(jaCadastrados);

  async function buscarGrupos() {
    setBuscando(true); setMsg("");
    try {
      const lista = await onListGroups();
      setGrupos(lista);
      if (lista.length === 0) setMsg("Nenhum grupo encontrado. O número do Alfred já está nos grupos?");
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBuscando(false);
    }
  }

  function escolher(id: string) {
    const g = grupos.find((x) => x.id === id);
    setJid(id);
    if (g && !cliente.trim()) setCliente(g.subject); // sugere o nome do grupo como cliente
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jid.trim() || !cliente.trim()) { setMsg("Erro: informe o grupo e o cliente."); return; }
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Plus size={17} /></span>
          <h2 className="font-medium">Novo grupo</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={buscarGrupos} disabled={buscando} title="Listar os grupos em que o chip do Alfred já está">
          {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar grupos do WhatsApp
        </button>
      </div>

      {/* Seletor dos grupos descobertos (preenche o remoteJid automaticamente) */}
      {grupos.length > 0 && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-ink-soft">Escolha o grupo</label>
          <select className="input" value={jid} onChange={(e) => escolher(e.target.value)}>
            <option value="">Selecione um grupo…</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id} disabled={jaSet.has(g.id)}>
                {g.subject || "(sem nome)"}{jaSet.has(g.id) ? " — já cadastrado" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">remoteJid do grupo</label>
          <input className="input font-mono text-xs" placeholder="120363…@g.us" value={jid} onChange={(e) => setJid(e.target.value)} />
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

// ---- Checklist do cronograma (por cliente) -------------------------
function Checklist({ tasks, onToggle, fase = "onboarding" }: { tasks: AlfredTask[]; onToggle: (t: AlfredTask) => Promise<void>; fase?: Fase }) {
  if (tasks.length === 0) return null;
  const feitas = tasks.filter((t) => t.done).length;
  const pct = Math.round((feitas / tasks.length) * 100);
  const semanas = [...new Set(tasks.map((t) => t.semana))].sort((a, b) => a - b);
  const manut = fase === "manutencao";

  async function alternar(t: AlfredTask) {
    try { await onToggle(t); } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <div className={`mb-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm ${manut ? "opacity-80" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ListChecks size={15} className={manut ? "text-ink-muted" : "text-accent"} />
          {manut ? "Implantação (histórico)" : "Checklist do cronograma"}
        </div>
        <span className="text-xs text-ink-muted tabular-nums">{feitas}/{tasks.length} · {pct}%</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-3">
        {semanas.map((s) => (
          <div key={s}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Semana {s}</div>
            <div className="space-y-0.5">
              {tasks.filter((t) => t.semana === s).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => alternar(t)}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition-colors hover:bg-black/[0.03]"
                >
                  {t.done
                    ? <CheckSquare size={16} className="shrink-0 text-success" />
                    : <Square size={16} className="shrink-0 text-ink-muted" />}
                  <span className={t.done ? "text-ink-muted line-through" : "text-ink-soft"}>{t.titulo}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Modal: conversa do grupo (somente leitura) + limpar histórico --
function ConversaModal({ group, onClose, onClear }: { group: AlfredGroup; onClose: () => void; onClear: (groupId: string) => Promise<void> }) {
  const [messages, setMessages] = useState<AlfredMessage[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [limpando, setLimpando] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("alfred_messages")
        .select("id, role, sender_name, body, created_at")
        .eq("group_id", group.id).order("created_at");
      if (active) { setMessages((data as AlfredMessage[]) ?? []); setCarregando(false); }
    })();
    // Tempo real: novas mensagens (recebidas e respostas do Alfred) aparecem sozinhas.
    const ch = supabase.channel("alfred-conv-" + group.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alfred_messages", filter: `group_id=eq.${group.id}` },
        (p) => setMessages((m) => (m.some((x) => x.id === (p.new as AlfredMessage).id) ? m : [...m, p.new as AlfredMessage])))
      .subscribe();
    return () => { active = false; void supabase.removeChannel(ch); };
  }, [group.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function limpar() {
    if (!confirm(`Limpar todo o histórico de mensagens de "${group.client_name}"? Esta ação não pode ser desfeita.`)) return;
    setLimpando(true);
    try { await onClear(group.id); setMessages([]); }
    catch (e) { alert("Erro ao limpar: " + (e instanceof Error ? e.message : String(e))); }
    finally { setLimpando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="glass-strong flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl2" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{group.client_name}</div>
            <div className="truncate font-mono text-[11px] text-ink-muted">{group.remote_jid}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={limpar} disabled={limpando || messages.length === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              title="Apagar todo o histórico deste grupo">
              {limpando ? <Loader2 size={14} className="animate-spin" /> : <Eraser size={14} />} Limpar histórico
            </button>
            <button onClick={onClose} className="rounded-full p-1.5 text-ink-muted hover:bg-black/5"><X size={18} /></button>
          </div>
        </header>

        <div className="flex-1 space-y-1.5 overflow-auto bg-black/[0.02] px-4 py-3">
          {carregando ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">Carregando…</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">Sem mensagens ainda.</div>
          ) : (
            messages.map((m) => {
              const out = m.role === "model"; // Alfred
              return (
                <div key={m.id} className={`max-w-[80%] ${out ? "ml-auto" : ""}`}>
                  {!out && m.sender_name && <div className="mb-0.5 pl-1 text-[10px] font-medium text-ink-muted">{m.sender_name}</div>}
                  <div className={`w-fit whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${out ? "ml-auto rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-white"}`}>
                    {m.body}
                    <span className={`ml-2 inline-block align-bottom text-[10px] ${out ? "text-white/70" : "text-ink-muted"}`}>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-black/5 px-4 py-2 text-center text-[11px] text-ink-muted">
          Visualização do grupo — o Alfred responde automaticamente no WhatsApp.
        </div>
      </div>
    </div>
  );
}

// ---- Conhecimento aprendido pelo Alfred (resumo + dados salvos) ----
function Conhecimento({ resumo, memory, onDelete }: { resumo?: string | null; memory: AlfredMemory[]; onDelete: (id: string) => Promise<void> }) {
  if (!resumo && memory.length === 0) return null;

  async function remover(id: string) {
    if (!confirm("Remover este dado salvo da memória do Alfred?")) return;
    try { await onDelete(id); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="mb-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Brain size={15} className="text-accent" /> Conhecimento do Alfred
        <span className="text-[11px] font-normal text-ink-muted">(aprendido automaticamente)</span>
      </div>

      {resumo && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Resumo do cliente</div>
          <p className="whitespace-pre-wrap rounded-lg bg-black/[0.02] p-2 text-sm text-ink-soft">{resumo}</p>
        </div>
      )}

      {memory.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Dados salvos</div>
          <div className="space-y-1">
            {memory.map((m) => (
              <div key={m.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-black/[0.02]">
                <span className="shrink-0 font-medium text-ink-soft">{m.chave}:</span>
                <span className="min-w-0 flex-1 break-words text-ink-soft">{m.valor}</span>
                <button onClick={() => remover(m.id)} title="Remover dado" className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Equipe do grupo (quem é membro x cliente) ---------------------
function Equipe({ groupId, members, onAdd, onRemove }: {
  groupId: string;
  members: AlfredMember[];
  onAdd: (groupId: string, numero: string, nome?: string) => Promise<void>;
  onRemove: (id: string, groupId: string) => Promise<void>;
}) {
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState("");

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try { await onAdd(groupId, numero, nome); setNumero(""); setNome(""); }
    catch (err) { setMsg("Erro: " + (err instanceof Error ? err.message : String(err))); }
  }

  return (
    <div className="mb-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <UserPlus size={15} className="text-accent" /> Equipe no grupo
        <span className="text-[11px] font-normal text-ink-muted">(o Alfred nunca responde a estes números)</span>
      </div>

      {members.length > 0 && (
        <div className="mb-2 space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-black/[0.02]">
              <span className="font-medium text-ink-soft">{m.nome || "—"}</span>
              <span className="font-mono text-xs text-ink-muted">{m.numero}</span>
              <button onClick={() => onRemove(m.id, groupId)} title="Remover da equipe" className="ml-auto shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-[11px] font-medium text-ink-soft">Número (com DDD)</label>
          <input className="input !py-1.5 font-mono text-sm" placeholder="5598999998888" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="mb-1 block text-[11px] font-medium text-ink-soft">Nome (opcional)</label>
          <input className="input !py-1.5 text-sm" placeholder="Bruna" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <button type="submit" className="btn-accent !py-2"><Plus size={15} /> Adicionar</button>
      </form>
      {msg && <div className="mt-1.5"><Feedback msg={msg} /></div>}
    </div>
  );
}

// ---- Fase do contrato (Onboarding × Manutenção) --------------------
const FASE_INFO: Record<Fase, { label: string; chip: string }> = {
  onboarding: { label: "Onboarding", chip: "bg-accent/15 text-accent" },
  manutencao: { label: "Manutenção", chip: "bg-[#5b53c6]/12 text-[#5b53c6]" },
};

function PhaseControl({ group, onSetFase }: { group: AlfredGroup; onSetFase: (id: string, fase: Fase | null) => Promise<void> }) {
  const efetiva = faseEfetiva(group);
  const atual: Fase | "auto" = group.fase_override ?? "auto";
  const opcoes: { key: Fase | "auto"; label: string }[] = [
    { key: "auto", label: "Automático" },
    { key: "onboarding", label: "Onboarding" },
    { key: "manutencao", label: "Manutenção" },
  ];
  async function escolher(k: Fase | "auto") {
    try { await onSetFase(group.id, k === "auto" ? null : k); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <div className="mb-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Layers size={15} className="text-accent" /> Fase do contrato
        <span className={`ml-auto chip ${FASE_INFO[efetiva].chip}`}>{efetiva === "manutencao" ? <Rocket size={11} /> : <ListChecks size={11} />}{FASE_INFO[efetiva].label}</span>
      </div>
      <div className="inline-flex w-full rounded-lg bg-black/5 p-0.5">
        {opcoes.map((o) => (
          <button key={o.key} type="button" onClick={() => escolher(o.key)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${atual === o.key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        {atual === "auto"
          ? `Automático: vira Manutenção após 30 dias de grupo (hoje: ${FASE_INFO[efetiva].label}).`
          : "Fase travada manualmente."}{" "}
        Na Manutenção o Alfred prioriza campanhas e demandas; o cronograma vira histórico.
      </p>
    </div>
  );
}

// ---- Campanhas / ativos do cliente (estado vivo da operação) -------
const ASSET_STATUS: { key: AssetStatus; label: string; dot: string }[] = [
  { key: "ativa", label: "Ativa", dot: "bg-success" },
  { key: "pausada", label: "Pausada", dot: "bg-warning" },
  { key: "substituida", label: "Substituída", dot: "bg-ink-muted/50" },
  { key: "encerrada", label: "Encerrada", dot: "bg-danger/60" },
];
const assetStatusDot = (s: AssetStatus) => ASSET_STATUS.find((x) => x.key === s)?.dot ?? "bg-ink-muted";
const ASSET_TIPOS: { key: AssetTipo; label: string }[] = [
  { key: "campanha", label: "Campanha" }, { key: "criativo", label: "Criativo" },
  { key: "anuncio", label: "Anúncio" }, { key: "outro", label: "Outro" },
];

function Campanhas({ groupId, assets, onAdd, onUpdate, onDelete }: {
  groupId: string;
  assets: AlfredAsset[];
  onAdd: (groupId: string, titulo: string, tipo: AssetTipo, descricao?: string) => Promise<void>;
  onUpdate: (id: string, groupId: string, patch: Partial<Pick<AlfredAsset, "status" | "titulo" | "tipo" | "descricao">>) => Promise<void>;
  onDelete: (id: string, groupId: string) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<AssetTipo>("campanha");
  const [msg, setMsg] = useState("");
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordem: Record<AssetStatus, number> = { ativa: 0, pausada: 1, substituida: 2, encerrada: 3 };
  const lista = [...assets].sort((a, b) => (ordem[a.status] - ordem[b.status]) || a.titulo.localeCompare(b.titulo));
  const ativas = assets.filter((a) => a.status === "ativa").length;

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try { await onAdd(groupId, titulo, tipo); setTitulo(""); setTipo("campanha"); }
    catch (err) { setMsg("Erro: " + (err instanceof Error ? err.message : String(err))); }
  }

  return (
    <div className="mb-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Megaphone size={15} className="text-accent" /> Campanhas e ativos
        <span className="text-[11px] font-normal text-ink-muted">(o que está no ar — o Alfred aprende sozinho)</span>
        <span className="ml-auto rounded-full bg-success/15 px-1.5 text-xs text-[#1b7a35]">{ativas} no ar</span>
      </div>

      {lista.length > 0 && (
        <div className="mb-2 space-y-1">
          {lista.map((a) => {
            const novo = a.substituida_por ? byId.get(a.substituida_por) : null;
            const fim = a.status === "substituida" || a.status === "encerrada";
            return (
              <div key={a.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-black/[0.02]">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${assetStatusDot(a.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-sm font-medium ${fim ? "text-ink-muted line-through" : "text-ink-soft"}`}>{a.titulo}</span>
                    {a.tipo !== "campanha" && <span className="chip bg-black/5 text-ink-muted">{ASSET_TIPOS.find((t) => t.key === a.tipo)?.label}</span>}
                  </div>
                  {a.descricao && <p className="text-[11.5px] text-ink-muted">{a.descricao}</p>}
                  {novo && <p className="text-[11px] text-ink-muted">→ substituída por “{novo.titulo}”</p>}
                </div>
                <select value={a.status} onChange={(e) => onUpdate(a.id, groupId, { status: e.target.value as AssetStatus })}
                  className="shrink-0 rounded-md border border-black/10 bg-white px-1 py-0.5 text-[11px] text-ink-soft" title="Status da campanha">
                  {ASSET_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button onClick={() => onDelete(a.id, groupId)} title="Remover" className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-ink-soft">Nova campanha/ativo</label>
          <input className="input !py-1.5 text-sm" placeholder="Ex.: Campanha Dia das Mães" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <select className="input !py-1.5 !w-auto text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as AssetTipo)}>
          {ASSET_TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button type="submit" className="btn-accent !py-2"><Plus size={15} /> Adicionar</button>
      </form>
      {msg && <div className="mt-1.5"><Feedback msg={msg} /></div>}
    </div>
  );
}

// ---- Card de grupo: status + on/off + equipe + checklist + contexto
function GroupItem({
  group, context, tasks, memory, members, assets, onToggle, onRemove, onSetFase, onSaveContext, onToggleTask, onVerConversa, onDeleteMemory, onAddMember, onRemoveMember, onAddAsset, onUpdateAsset, onDeleteAsset,
}: {
  group: AlfredGroup;
  context?: AlfredContext;
  tasks: AlfredTask[];
  memory: AlfredMemory[];
  members: AlfredMember[];
  assets: AlfredAsset[];
  onToggle: (id: string, active: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSetFase: (id: string, fase: Fase | null) => Promise<void>;
  onSaveContext: (groupId: string, patch: Omit<AlfredContext, "group_id">) => Promise<void>;
  onToggleTask: (t: AlfredTask) => Promise<void>;
  onVerConversa: () => void;
  onDeleteMemory: (id: string, groupId: string) => Promise<void>;
  onAddMember: (groupId: string, numero: string, nome?: string) => Promise<void>;
  onRemoveMember: (id: string, groupId: string) => Promise<void>;
  onAddAsset: (groupId: string, titulo: string, tipo: AssetTipo, descricao?: string) => Promise<void>;
  onUpdateAsset: (id: string, groupId: string, patch: Partial<Pick<AlfredAsset, "status" | "titulo" | "tipo" | "descricao">>) => Promise<void>;
  onDeleteAsset: (id: string, groupId: string) => Promise<void>;
}) {
  const fase = faseEfetiva(group);
  const [aberto, setAberto] = useState(false);
  const [empresa, setEmpresa] = useState(context?.empresa_dados ?? "");
  const [regras, setRegras] = useState(context?.regras_atendimento ?? "");
  const [drive, setDrive] = useState(context?.drive_link ?? "");
  const [crono, setCrono] = useState(context?.cronograma ?? "");
  const [fin, setFin] = useState(context?.financeiro ?? "");
  const [obs, setObs] = useState(context?.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setEmpresa(context?.empresa_dados ?? "");
    setRegras(context?.regras_atendimento ?? "");
    setDrive(context?.drive_link ?? "");
    setCrono(context?.cronograma ?? "");
    setFin(context?.financeiro ?? "");
    setObs(context?.observacoes ?? "");
  }, [context]);

  // Indica, no card, se a empresa já tem algum contexto preenchido.
  const temContexto = !!(context && (
    context.empresa_dados || context.regras_atendimento || context.cronograma ||
    context.financeiro || context.drive_link || context.observacoes
  ));
  const feitas = tasks.filter((t) => t.done).length;

  async function salvarContexto(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setMsg("");
    try {
      await onSaveContext(group.id, {
        empresa_dados: empresa.trim() || null,
        regras_atendimento: regras.trim() || null,
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{group.client_name}</span>
            <span className={`chip ${group.active ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${group.active ? "bg-success" : "bg-ink-muted/60"}`} />
              {group.active ? "Ativo" : "Inativo"}
            </span>
            <span className={`chip ${FASE_INFO[fase].chip}`} title="Fase do contrato">
              {fase === "manutencao" ? <Rocket size={11} /> : <ListChecks size={11} />}{FASE_INFO[fase].label}
            </span>
            {tasks.length > 0 && (
              <span className="chip bg-black/5 text-ink-muted" title="Checklist do cronograma concluído">
                <ListChecks size={11} /> {feitas}/{tasks.length}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-ink-muted">{group.remote_jid}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onVerConversa}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-black/5"
            title="Ver a conversa do grupo"
          >
            <MessageSquare size={14} />
            <span className="hidden sm:inline">Conversa</span>
          </button>
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
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              aberto ? "bg-accent/10 text-accent" : "text-ink-soft hover:bg-black/5"
            }`}
            title="Abrir o contexto desta empresa"
          >
            <Building2 size={14} />
            <span className="hidden sm:inline">Contexto</span>
            <span className={`h-1.5 w-1.5 rounded-full ${temContexto ? "bg-success" : "bg-ink-muted/40"}`} title={temContexto ? "Contexto preenchido" : "Sem contexto"} />
            <ChevronDown size={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
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

      {/* Área dedicada: checklist do cronograma + contexto da empresa */}
      {aberto && (
        <div className="border-t border-black/5 bg-black/[0.015] p-4">
        <PhaseControl group={group} onSetFase={onSetFase} />
        <Equipe groupId={group.id} members={members} onAdd={onAddMember} onRemove={onRemoveMember} />
        {/* Manutenção: campanhas em primeiro plano; Onboarding: cronograma primeiro. */}
        {fase === "manutencao" ? (
          <>
            <Campanhas groupId={group.id} assets={assets} onAdd={onAddAsset} onUpdate={onUpdateAsset} onDelete={onDeleteAsset} />
            <Checklist tasks={tasks} onToggle={onToggleTask} fase={fase} />
          </>
        ) : (
          <>
            <Checklist tasks={tasks} onToggle={onToggleTask} fase={fase} />
            <Campanhas groupId={group.id} assets={assets} onAdd={onAddAsset} onUpdate={onUpdateAsset} onDelete={onDeleteAsset} />
          </>
        )}
        <Conhecimento resumo={context?.resumo} memory={memory} onDelete={(id) => onDeleteMemory(id, group.id)} />
        <form onSubmit={salvarContexto}>
          <p className="mb-3 text-xs text-ink-muted">
            Contexto exclusivo de <strong className="text-ink-soft">{group.client_name}</strong>. O Alfred usa estes dados ao responder neste grupo.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><Building2 size={13} className="text-ink-muted" /> Dados da empresa</label>
              <textarea rows={2} className="input resize-none text-sm" placeholder="Segmento, responsáveis, produtos, particularidades…" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><ScrollText size={13} className="text-ink-muted" /> Regras de atendimento</label>
              <textarea rows={2} className="input resize-none text-sm" placeholder="O que pode/não pode responder, tom, horários, encaminhamentos…" value={regras} onChange={(e) => setRegras(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><CalendarRange size={13} className="text-ink-muted" /> Cronograma atual</label>
              <textarea rows={2} className="input resize-none text-sm" value={crono} onChange={(e) => setCrono(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><Wallet size={13} className="text-ink-muted" /> Status financeiro</label>
              <input className="input" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><FolderOpen size={13} className="text-ink-muted" /> Link do Drive</label>
              <input className="input" value={drive} onChange={(e) => setDrive(e.target.value)} />
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
        </div>
      )}
    </div>
  );
}
