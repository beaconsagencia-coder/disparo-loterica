import { useEffect, useMemo, useState } from "react";
import {
  Wallet, Layers, CircleDollarSign, TrendingUp, LineChart, Plus, Ban,
  AlertCircle, Loader2, X, CheckCircle2, CalendarClock, CalendarDays,
} from "lucide-react";
import {
  useContracts, endMonthIndex, daysUntilDue, nextDueDate, vigenciaProgress,
} from "@/lib/useContracts";
import { CONTRACT_STATUS_LABEL, type Contract, type ContractInput, type ContractStatus } from "@/lib/types";

// --- formatadores ---
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = (n: number) =>
  n >= 1000 ? "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : brl(n);

/** Rótulo "mês/ano" a partir de um índice absoluto de mês (ano*12 + mês0). */
function mesLabel(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = ((idx % 12) + 12) % 12;
  return new Date(y, m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
const ddmm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const STATUS_CHIP: Record<ContractStatus, string> = {
  active: "bg-success/15 text-[#1b7a35]",
  cancelled: "bg-danger/15 text-danger",
  completed: "bg-black/10 text-ink-muted",
};

/** Tom do vencimento conforme a proximidade (dias até vencer). */
function dueTone(dias: number): { chip: string; box: string; label: string } {
  if (dias <= 0) return { chip: "bg-danger/15 text-danger", box: "bg-danger/10 text-danger", label: "Vence hoje" };
  if (dias <= 5) return { chip: "bg-warning/20 text-[#9a6400]", box: "bg-warning/15 text-[#9a6400]", label: `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}` };
  return { chip: "bg-accent/12 text-accent", box: "bg-accent/10 text-accent", label: `Vence em ${dias} dias` };
}

export default function Financeiro() {
  const { contracts, loading, error, metrics, addContract, cancelContract } = useContracts();
  const [filtro, setFiltro] = useState<ContractStatus | "all">("active");
  const [aCancelar, setACancelar] = useState<Contract | null>(null);
  const [drawer, setDrawer] = useState(false);

  const lista = useMemo(
    () => contracts.filter((c) => (filtro === "all" ? true : c.status === filtro)),
    [contracts, filtro],
  );

  // Próximos vencimentos: contratos ativos ordenados pela proximidade do
  // vencimento, exibindo a janela mais próxima (até ~12 dias à frente).
  const vencimentos = useMemo(() => {
    return contracts
      .filter((c) => c.status === "active")
      .map((c) => ({ c, dias: daysUntilDue(c.due_date_day), due: nextDueDate(c.due_date_day) }))
      .filter((v) => v.dias <= 12)
      .sort((a, b) => a.dias - b.dias);
  }, [contracts]);

  const cards = [
    { label: "Contratos ativos", value: String(metrics.volume), hint: "em vigência", icon: Layers, accent: "text-ink", bg: "bg-black/5 text-ink-soft" },
    { label: "MRR atual", value: brlCompact(metrics.mrr), hint: mesLabel(metrics.m0Idx), icon: CircleDollarSign, accent: "text-[#1b7a35]", bg: "bg-success/15 text-[#1b7a35]" },
    { label: "Previsão M+1", value: brlCompact(metrics.m1), hint: mesLabel(metrics.m1Idx), icon: TrendingUp, accent: "text-accent", bg: "bg-accent/15 text-accent" },
    { label: "Previsão M+2", value: brlCompact(metrics.m2), hint: mesLabel(metrics.m2Idx), icon: LineChart, accent: "text-[#5e5ce6]", bg: "bg-[#5e5ce6]/15 text-[#5e5ce6]" },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Cabeçalho + ação primária */}
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={22} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Gestão Financeira</h1>
            <p className="text-sm text-ink-muted">Carteira, fluxo de caixa e previsibilidade. Tudo recalcula em tempo real.</p>
          </div>
        </div>
        <button className="btn-accent shrink-0" onClick={() => setDrawer(true)}>
          <Plus size={16} /> <span className="hidden sm:inline">Novo contrato</span>
        </button>
      </header>

      {error && (
        <div className="bento-card mb-4 flex items-start gap-2 border-danger/30 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error} — verifique se o banco foi atualizado (db push da migration 0030).
        </div>
      )}

      {/* 1) KPIs — uma única linha (4 colunas), compactos */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="bento-card flex items-center gap-3 !p-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg}`}><c.icon size={18} /></span>
            <div className="min-w-0">
              <div className="truncate text-xs text-ink-muted">{c.label}</div>
              <div className={`truncate text-xl font-semibold tracking-tight tabular-nums ${c.accent}`}>{c.value}</div>
              <div className="truncate text-[11px] capitalize text-ink-muted">{c.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 2) Próximos vencimentos — fluxo de caixa do mês */}
      <ProximosVencimentos itens={vencimentos} loading={loading} />

      {/* 3) Tabela full-width */}
      <ContratosTabela
        lista={lista}
        loading={loading}
        filtro={filtro}
        setFiltro={setFiltro}
        totalAtivos={metrics.volume}
        onCancelar={setACancelar}
      />

      {/* Drawer lateral do formulário */}
      <NovoContratoDrawer open={drawer} onClose={() => setDrawer(false)} onAdd={addContract} />

      {/* Modal de confirmação do churn */}
      {aCancelar && (
        <ConfirmarCancelamento contrato={aCancelar} onClose={() => setACancelar(null)} onConfirm={cancelContract} />
      )}
    </div>
  );
}

// =====================================================================
// Seção: Próximos vencimentos (visão de precisão do caixa)
// =====================================================================
function ProximosVencimentos({
  itens, loading,
}: {
  itens: { c: Contract; dias: number; due: Date }[];
  loading: boolean;
}) {
  const total = itens.reduce((acc, v) => acc + Number(v.c.contract_value), 0);
  return (
    <section className="bento-card mb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={17} className="text-accent" />
          <h2 className="font-medium">Próximos vencimentos</h2>
        </div>
        {itens.length > 0 && (
          <span className="text-xs text-ink-muted">
            {itens.length} a receber · <span className="font-semibold text-ink-soft tabular-nums">{brl(total)}</span>
          </span>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nenhum vencimento nos próximos 12 dias.</p>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {itens.map(({ c, dias, due }) => {
            const tone = dueTone(dias);
            return (
              <div key={c.id} className="flex w-52 shrink-0 flex-col gap-2 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className={`chip ${tone.chip}`}>{tone.label}</span>
                  <span className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg text-center leading-none ${tone.box}`}>
                    <span className="text-sm font-bold tabular-nums">{c.due_date_day}</span>
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={c.client_name}>{c.client_name}</div>
                  <div className="text-[11px] text-ink-muted">vence {ddmm(due)}</div>
                </div>
                <div className="text-lg font-semibold tabular-nums">{brl(Number(c.contract_value))}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// =====================================================================
// Tabela de contratos (full-width) + filtros + churn
// =====================================================================
const FILTROS: { key: ContractStatus | "all"; label: string }[] = [
  { key: "active", label: "Ativos" },
  { key: "cancelled", label: "Cancelados" },
  { key: "all", label: "Todos" },
];

function ContratosTabela({
  lista, loading, filtro, setFiltro, totalAtivos, onCancelar,
}: {
  lista: Contract[];
  loading: boolean;
  filtro: ContractStatus | "all";
  setFiltro: (f: ContractStatus | "all") => void;
  totalAtivos: number;
  onCancelar: (c: Contract) => void;
}) {
  return (
    <div className="rounded-xl2 border border-black/5 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">Contratos</h2>
          <p className="text-sm text-ink-muted">{totalAtivos} ativo(s) na carteira</p>
        </div>
        <div className="inline-flex self-start rounded-xl bg-black/5 p-1">
          {FILTROS.map((f) => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === f.key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-ink-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-muted">Nenhum contrato neste filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-black/[0.015] text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 text-right font-medium">Valor/mês</th>
                <th className="px-4 py-3 text-center font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Tempo de vigência</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const prog = vigenciaProgress(c);
                const pctv = prog.total > 0 ? Math.round((prog.mes / prog.total) * 100) : 0;
                const dias = c.status === "active" ? daysUntilDue(c.due_date_day) : null;
                const tone = dias !== null ? dueTone(dias) : null;
                return (
                  <tr key={c.id} className="border-b border-black/5 last:border-0 transition-colors hover:bg-black/[0.015]">
                    {/* Cliente */}
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.client_name}</div>
                      <div className="text-xs text-ink-muted">
                        {c.payer_contact ? `${c.payer_contact} · ` : ""}início {dataBR(c.start_date)}
                      </div>
                    </td>
                    {/* Valor */}
                    <td className="px-4 py-3 text-right text-[15px] font-semibold tabular-nums">{brl(Number(c.contract_value))}</td>
                    {/* Vencimento — coluna de destaque */}
                    <td className="px-4 py-3">
                      <div className="mx-auto flex w-fit items-center gap-2">
                        <span className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl leading-none ${tone ? tone.box : "bg-black/5 text-ink-muted"}`}>
                          <span className="text-[9px] font-medium uppercase opacity-70">dia</span>
                          <span className="text-lg font-bold tabular-nums">{c.due_date_day}</span>
                        </span>
                        {tone && (
                          <span className="hidden lg:flex flex-col">
                            <span className={`chip ${tone.chip} !px-2`}>{tone.label}</span>
                            <span className="mt-0.5 pl-1 text-[11px] text-ink-muted">próx. {ddmm(nextDueDate(c.due_date_day))}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Tempo de vigência — barra de progresso */}
                    <td className="px-4 py-3">
                      <div className="w-40">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-ink-soft">Mês {prog.mes} de {prog.total}</span>
                          <span className="text-ink-muted">até {mesLabel(endMonthIndex(c))}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(4, pctv)}%` }} />
                        </div>
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`chip ${STATUS_CHIP[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
                    </td>
                    {/* Ação */}
                    <td className="px-4 py-3 text-right">
                      {c.status === "active" ? (
                        <button
                          onClick={() => onCancelar(c)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                          title="Cancelar contrato"
                        >
                          <Ban size={13} /> Cancelar
                        </button>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-black/5 px-4 py-3 text-xs text-ink-muted">
        M+1 e M+2 somam apenas contratos ativos ainda vigentes naquele mês (início ≤ mês ≤ início + duração − 1). Contratos que encerram antes saem da projeção.
      </p>
    </div>
  );
}

// =====================================================================
// Drawer lateral: formulário de novo contrato
// =====================================================================
function NovoContratoDrawer({
  open, onClose, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (c: ContractInput) => Promise<void>;
}) {
  // Fecha no ESC.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* painel */}
      <aside
        className={`glass-strong absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto p-5 shadow-glass transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent"><Plus size={18} /></span>
            <h2 className="text-lg font-semibold">Novo contrato</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-muted hover:bg-black/5"><X size={18} /></button>
        </div>
        <NovoContratoForm onAdd={onAdd} onDone={onClose} />
      </aside>
    </div>
  );
}

function NovoContratoForm({ onAdd, onDone }: { onAdd: (c: ContractInput) => Promise<void>; onDone: () => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [clientName, setClientName] = useState("");
  const [valor, setValor] = useState("");
  const [duracao, setDuracao] = useState("12");
  const [inicio, setInicio] = useState(hoje);
  const [diaVenc, setDiaVenc] = useState("5");
  const [contato, setContato] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const value = Number(String(valor).replace(",", "."));
    const dur = Math.floor(Number(duracao));
    const dia = Math.floor(Number(diaVenc));
    if (!clientName.trim()) return setErro("Informe o nome do cliente.");
    if (!(value > 0)) return setErro("O valor do contrato deve ser maior que zero.");
    if (!(dur >= 1)) return setErro("A duração deve ser de pelo menos 1 mês.");
    if (!(dia >= 1 && dia <= 31)) return setErro("O dia do vencimento deve ser entre 1 e 31.");

    setSalvando(true);
    try {
      await onAdd({
        client_name: clientName.trim(),
        contract_value: value,
        duration_months: dur,
        start_date: inicio,
        due_date_day: dia,
        payer_contact: contato.trim() || null,
      });
      onDone(); // fecha o drawer; a lista atualiza via realtime
    } catch (e) {
      setErro("Não foi possível salvar: " + (e instanceof Error ? e.message : String(e)));
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <p className="mb-4 text-sm text-ink-muted">Cadastre um cliente para entrar na projeção de caixa.</p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Cliente</label>
          <input className="input" placeholder="Lotérica São José" value={clientName} onChange={(e) => setClientName(e.target.value)} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Valor mensal (R$)</label>
            <input className="input tabular-nums" inputMode="decimal" placeholder="1500,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Duração (meses)</label>
            <input type="number" min={1} className="input tabular-nums" value={duracao} onChange={(e) => setDuracao(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Início da vigência</label>
            <input type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Dia do vencimento</label>
            <input type="number" min={1} max={31} className="input tabular-nums" value={diaVenc} onChange={(e) => setDiaVenc(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Contato do pagador (WhatsApp/e-mail)</label>
          <input className="input" placeholder="(98) 99999-9999" value={contato} onChange={(e) => setContato(e.target.value)} />
        </div>
      </div>

      {erro && <p className="mt-3 flex items-center gap-1 text-sm text-danger"><AlertCircle size={14} /> {erro}</p>}

      <div className="mt-auto flex items-center gap-2 pt-5">
        <button type="submit" className="btn-accent flex-1" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {salvando ? "Salvando…" : "Salvar contrato"}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone} disabled={salvando}>Cancelar</button>
      </div>
    </form>
  );
}

// =====================================================================
// Modal de confirmação do cancelamento (churn)
// =====================================================================
function ConfirmarCancelamento({
  contrato, onClose, onConfirm,
}: {
  contrato: Contract;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setProcessando(true); setErro(null);
    try {
      await onConfirm(contrato.id);
      onClose();
    } catch (e) {
      setErro("Não foi possível cancelar: " + (e instanceof Error ? e.message : String(e)));
      setProcessando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="glass-strong w-full max-w-md rounded-xl2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/15 text-danger"><Ban size={18} /></span>
            <h3 className="text-lg font-semibold">Cancelar contrato</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-muted hover:bg-black/5"><X size={18} /></button>
        </div>

        <p className="text-sm text-ink-soft">
          Confirmar o cancelamento do contrato de <strong>{contrato.client_name}</strong> ({brl(Number(contrato.contract_value))}/mês)?
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
          <CalendarClock size={14} /> Sai da carteira ativa e as projeções de MRR, M+1 e M+2 recalculam na hora.
        </p>

        {erro && <p className="mt-3 flex items-center gap-1 text-sm text-danger"><AlertCircle size={14} /> {erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={processando}>Voltar</button>
          <button
            onClick={confirmar}
            disabled={processando}
            className="inline-flex items-center gap-1.5 rounded-full bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {processando ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {processando ? "Cancelando…" : "Cancelar contrato"}
          </button>
        </div>
      </div>
    </div>
  );
}
