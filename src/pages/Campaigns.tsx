import { useEffect, useMemo, useState } from "react";
import { Plus, Pause, Play, Ban, RefreshCw, Search, UserPlus, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizePhoneBR, maskPhoneBR } from "@/lib/phone";
import { DEFAULT_TEMPLATE } from "@/lib/templates";
import { QUEUE_STATUS_LABEL, type QueueStatus } from "@/lib/types";

interface QueueItem {
  id: string;
  status: QueueStatus;
  scheduled_for: string;
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
  leads: { nome: string; telefone: string; empresa: string | null; status: string } | null;
}

const badge: Record<QueueStatus, string> = {
  pendente: "bg-accent/10 text-accent",
  enviando: "bg-warning/15 text-[#9a6200]",
  enviado: "bg-success/15 text-[#1b7a35]",
  falha: "bg-danger/15 text-[#b4231b]",
  pausado: "bg-black/10 text-ink-soft",
  cancelado: "bg-black/5 text-ink-muted line-through",
};

const ALL_STATUS: QueueStatus[] = ["pendente", "pausado", "enviado", "enviando", "falha", "cancelado"];

export default function Campaigns() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<QueueStatus, number>>({
    pendente: 0, enviando: 0, enviado: 0, falha: 0, pausado: 0, cancelado: 0,
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueStatus | "todos">("todos");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("message_queue")
      .select("id, status, scheduled_for, sent_at, attempts, last_error, leads(nome, telefone, empresa, status)")
      .order("created_at", { ascending: false })
      .limit(500);
    setItems((data as any) ?? []);

    const entries = await Promise.all(
      ALL_STATUS.map(async (s) => {
        const { count } = await supabase
          .from("message_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", s);
        return [s, count ?? 0] as const;
      }),
    );
    setCounts(Object.fromEntries(entries) as Record<QueueStatus, number>);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("campaigns")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_queue" }, load)
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, []);

  // ---- Ações de controle ----
  async function setStatus(id: string, status: QueueStatus) {
    setBusy(true);
    await supabase.from("message_queue").update({ status }).eq("id", id);
    await load();
    setBusy(false);
  }

  async function bulk(from: QueueStatus[], to: QueueStatus, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    await supabase.from("message_queue").update({ status: to }).in("status", from);
    await load();
    setBusy(false);
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter !== "todos" && it.status !== filter) return false;
      const q = query.toLowerCase();
      return !q || (it.leads?.nome ?? "").toLowerCase().includes(q) || (it.leads?.telefone ?? "").includes(q);
    });
  }, [items, query, filter]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
          <p className="text-sm text-ink-muted">Contatos da campanha e controle dos disparos</p>
        </div>
        <button className="btn-accent" onClick={() => setModal(true)}>
          <UserPlus size={16} /> Adicionar contato
        </button>
      </header>

      {/* Resumo + filtros clicáveis */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <button
          onClick={() => setFilter("todos")}
          className={`bento-card !p-3 text-left ${filter === "todos" ? "ring-2 ring-accent" : ""}`}
        >
          <div className="text-xs text-ink-muted">Total</div>
          <div className="text-xl font-semibold">{ALL_STATUS.reduce((a, s) => a + counts[s], 0)}</div>
        </button>
        {ALL_STATUS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`bento-card !p-3 text-left ${filter === s ? "ring-2 ring-accent" : ""}`}
          >
            <div className="text-xs text-ink-muted">{QUEUE_STATUS_LABEL[s]}</div>
            <div className="text-xl font-semibold">{counts[s]}</div>
          </button>
        ))}
      </div>

      {/* Ações em massa */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" disabled={busy || counts.pendente === 0}
          onClick={() => bulk(["pendente"], "pausado")}>
          <Pause size={15} /> Pausar fila ({counts.pendente})
        </button>
        <button className="btn-ghost" disabled={busy || counts.pausado === 0}
          onClick={() => bulk(["pausado"], "pendente")}>
          <Play size={15} /> Retomar ({counts.pausado})
        </button>
        <button className="btn-ghost text-[#b4231b]" disabled={busy || counts.pendente + counts.pausado === 0}
          onClick={() => bulk(["pendente", "pausado"], "cancelado",
            "Cancelar todos os disparos na fila e pausados? Isso não pode ser desfeito.")}>
          <Ban size={15} /> Cancelar pendentes
        </button>
        <button className="btn-ghost ml-auto" onClick={load} disabled={busy}>
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-3 text-ink-muted" />
        <input className="input pl-9" placeholder="Buscar por nome ou telefone…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {/* Lista de contatos / disparos */}
      <div className="bento-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-left text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2.5">Contato</th>
              <th className="px-4 py-2.5">Telefone</th>
              <th className="px-4 py-2.5">Disparo</th>
              <th className="px-4 py-2.5">Quando</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} className="border-t border-black/5">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{it.leads?.nome ?? "—"}</div>
                  {it.leads?.empresa && <div className="text-xs text-ink-muted">{it.leads.empresa}</div>}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {it.leads?.telefone ? maskPhoneBR(it.leads.telefone) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`chip ${badge[it.status]}`}>{QUEUE_STATUS_LABEL[it.status]}</span>
                  {it.status === "falha" && it.last_error && (
                    <div className="mt-0.5 max-w-[200px] truncate text-[10px] text-danger" title={it.last_error}>
                      {it.last_error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-muted">
                  {it.sent_at
                    ? `enviado ${new Date(it.sent_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : new Date(it.scheduled_for).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {it.status === "pendente" && (
                      <button className="btn-ghost !px-2 !py-1" disabled={busy} title="Pausar"
                        onClick={() => setStatus(it.id, "pausado")}><Pause size={14} /></button>
                    )}
                    {it.status === "pausado" && (
                      <button className="btn-ghost !px-2 !py-1" disabled={busy} title="Retomar"
                        onClick={() => setStatus(it.id, "pendente")}><Play size={14} /></button>
                    )}
                    {(it.status === "pendente" || it.status === "pausado") && (
                      <button className="btn-ghost !px-2 !py-1 text-[#b4231b]" disabled={busy} title="Cancelar"
                        onClick={() => setStatus(it.id, "cancelado")}><Ban size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">
                Nenhum contato nesse filtro.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && <AddContactModal onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------
function AddContactModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [enfileirar, setEnfileirar] = useState(true);
  const [cadences, setCadences] = useState<{ id: string; nome: string }[]>([]);
  const [cadenceId, setCadenceId] = useState(""); // "" = mensagem única
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("cadences").select("id, nome").eq("ativo", true).order("nome")
      .then(({ data }) => setCadences((data as any) ?? []));
  }, []);

  async function save() {
    setError(null);
    const tel = normalizePhoneBR(telefone);
    if (!nome.trim()) return setError("Informe o nome.");
    if (!tel) return setError("Telefone inválido. Use DDD + número (ex: 62 99999-8888).");

    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sessão expirada. Entre novamente.");

      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .upsert(
          { user_id: userId, nome: nome.trim(), telefone: tel, empresa: empresa.trim() || null,
            status: enfileirar ? "na_fila" : "novo", origem: "manual" },
          { onConflict: "user_id,telefone" },
        )
        .select("id")
        .single();
      if (leadErr) throw leadErr;

      if (enfileirar && lead) {
        // Se escolheu uma cadência, enfileira o passo 1 dela (tagueado);
        // senão, disparo único com a mensagem padrão.
        let template = DEFAULT_TEMPLATE;
        let cadenceFields: Record<string, unknown> = {};
        if (cadenceId) {
          const { data: step1 } = await supabase
            .from("cadence_steps").select("spintax_template")
            .eq("cadence_id", cadenceId).eq("ordem", 1).maybeSingle();
          if (!step1) throw new Error("A cadência escolhida não tem 1ª mensagem.");
          template = step1.spintax_template;
          cadenceFields = { cadence_id: cadenceId, cadence_step: 1 };
        }
        const { error: qErr } = await supabase.from("message_queue").insert({
          user_id: userId, lead_id: lead.id, spintax_template: template, status: "pendente",
          ...cadenceFields,
        });
        if (qErr) throw qErr;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="glass-strong w-full max-w-md rounded-xl2 p-6">
        <h2 className="mb-1 text-lg font-semibold">Adicionar contato</h2>
        <p className="mb-4 text-sm text-ink-muted">Cadastre um lead manualmente.</p>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-[#b4231b]">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-ink-soft">Nome *</label>
        <input className="input mb-3" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="João da Silva" />

        <label className="mb-1 block text-xs font-medium text-ink-soft">Telefone *</label>
        <input className="input mb-3" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(62) 99999-8888" />

        <label className="mb-1 block text-xs font-medium text-ink-soft">Empresa (opcional)</label>
        <input className="input mb-3" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Lotérica Sorte Grande" />

        <label className="mb-1 block text-xs font-medium text-ink-soft">Disparo</label>
        <select className="input mb-3" value={cadenceId} onChange={(e) => setCadenceId(e.target.value)} disabled={!enfileirar}>
          <option value="">Mensagem única (padrão)</option>
          {cadences.map((c) => (
            <option key={c.id} value={c.id}>Cadência: {c.nome}</option>
          ))}
        </select>

        <label className="mb-4 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={enfileirar} onChange={(e) => setEnfileirar(e.target.checked)} />
          Já enfileirar para disparo
        </label>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-accent" onClick={save} disabled={busy}>
            <Plus size={16} /> {busy ? "Salvando…" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
