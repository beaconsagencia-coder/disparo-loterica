import { useMemo, useState } from "react";
import {
  Wallet, Layers, CircleDollarSign, TrendingUp, LineChart, Plus, Ban,
  AlertCircle, Loader2, X, CheckCircle2, CalendarClock,
} from "lucide-react";
import { useContracts, endMonthIndex } from "@/lib/useContracts";
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

const STATUS_CHIP: Record<ContractStatus, string> = {
  active: "bg-success/15 text-[#1b7a35]",
  cancelled: "bg-danger/15 text-danger",
  completed: "bg-black/10 text-ink-muted",
};

export default function Financeiro() {
  const { contracts, loading, error, metrics, addContract, cancelContract } = useContracts();
  const [filtro, setFiltro] = useState<ContractStatus | "all">("active");
  const [aCancelar, setACancelar] = useState<Contract | null>(null);

  const lista = useMemo(
    () => contracts.filter((c) => (filtro === "all" ? true : c.status === filtro)),
    [contracts, filtro],
  );

  const cards = [
    { label: "Contratos ativos", value: String(metrics.volume), hint: "em vigência", icon: Layers, accent: "text-ink", bg: "bg-black/5 text-ink-soft" },
    { label: "MRR atual", value: brlCompact(metrics.mrr), hint: mesLabel(metrics.m0Idx), icon: CircleDollarSign, accent: "text-[#1b7a35]", bg: "bg-success/15 text-[#1b7a35]" },
    { label: "Previsão M+1", value: brlCompact(metrics.m1), hint: mesLabel(metrics.m1Idx), icon: TrendingUp, accent: "text-accent", bg: "bg-accent/15 text-accent" },
    { label: "Previsão M+2", value: brlCompact(metrics.m2), hint: mesLabel(metrics.m2Idx), icon: LineChart, accent: "text-[#5e5ce6]", bg: "bg-[#5e5ce6]/15 text-[#5e5ce6]" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center gap-2">
        <Wallet size={22} className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestão Financeira</h1>
          <p className="text-sm text-ink-muted">Contratos, MRR e previsibilidade de caixa. O cancelamento recalcula tudo na hora.</p>
        </div>
      </header>

      {error && (
        <div className="bento-card mb-4 flex items-start gap-2 border-danger/30 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error} — verifique se o banco foi atualizado (db push da migration 0030).
        </div>
      )}

      {/* Bento Grid — métricas */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="bento-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">{c.label}</span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${c.bg}`}><c.icon size={16} /></span>
            </div>
            <div className="mt-3">
              <div className={`text-2xl font-semibold tracking-tight tabular-nums sm:text-[26px] ${c.accent}`}>{c.value}</div>
              <div className="mt-0.5 text-xs capitalize text-ink-muted">{c.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <NovoContratoForm onAdd={addContract} />
        <ContratosCard
          lista={lista}
          loading={loading}
          filtro={filtro}
          setFiltro={setFiltro}
          totalAtivos={metrics.volume}
          onCancelar={setACancelar}
        />
      </div>

      {aCancelar && (
        <ConfirmarCancelamento
          contrato={aCancelar}
          onClose={() => setACancelar(null)}
          onConfirm={cancelContract}
        />
      )}
    </div>
  );
}

// =====================================================================
// Formulário de cadastro
// =====================================================================
function NovoContratoForm({ onAdd }: { onAdd: (c: ContractInput) => Promise<void> }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [clientName, setClientName] = useState("");
  const [valor, setValor] = useState("");
  const [duracao, setDuracao] = useState("12");
  const [inicio, setInicio] = useState(hoje);
  const [diaVenc, setDiaVenc] = useState("5");
  const [contato, setContato] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setOk(false);
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
      setClientName(""); setValor(""); setDuracao("12"); setInicio(hoje); setDiaVenc("5"); setContato("");
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e) {
      setErro("Não foi possível salvar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submit} className="bento-card h-fit">
      <h2 className="mb-1 font-medium">Novo contrato</h2>
      <p className="mb-4 text-sm text-ink-muted">Cadastre um cliente para entrar na projeção de caixa.</p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Cliente</label>
          <input className="input" placeholder="Lotérica São José" value={clientName} onChange={(e) => setClientName(e.target.value)} />
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

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn-accent" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {salvando ? "Salvando…" : "Adicionar contrato"}
        </button>
        {ok && <span className="flex items-center gap-1 text-sm text-[#1b7a35]"><CheckCircle2 size={15} /> Contrato cadastrado</span>}
      </div>
    </form>
  );
}

// =====================================================================
// Lista de contratos + churn
// =====================================================================
const FILTROS: { key: ContractStatus | "all"; label: string }[] = [
  { key: "active", label: "Ativos" },
  { key: "cancelled", label: "Cancelados" },
  { key: "all", label: "Todos" },
];

function ContratosCard({
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
    <div className="bento-card">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <p className="py-8 text-center text-sm text-ink-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">Nenhum contrato neste filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-ink-muted">
                <th className="py-2 pr-2 font-medium">Cliente</th>
                <th className="py-2 px-2 text-right font-medium">Valor/mês</th>
                <th className="py-2 px-2 font-medium">Início</th>
                <th className="py-2 px-2 text-center font-medium">Venc.</th>
                <th className="py-2 px-2 font-medium">Vigência até</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 pl-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-b border-black/5 last:border-0 align-middle">
                  <td className="py-2.5 pr-2">
                    <div className="font-medium">{c.client_name}</div>
                    {c.payer_contact && <div className="text-xs text-ink-muted">{c.payer_contact}</div>}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{brl(Number(c.contract_value))}</td>
                  <td className="py-2.5 px-2 tabular-nums text-ink-soft">{dataBR(c.start_date)}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-ink-soft">dia {c.due_date_day}</td>
                  <td className="py-2.5 px-2 text-ink-soft">
                    <span className="flex items-center gap-1 capitalize"><CalendarClock size={13} className="text-ink-muted" /> {mesLabel(endMonthIndex(c))}</span>
                    <span className="text-xs text-ink-muted">{c.duration_months} meses</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`chip ${STATUS_CHIP[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    {c.status === "active" ? (
                      <button
                        onClick={() => onCancelar(c)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                        title="Cancelar contrato"
                      >
                        <Ban size={13} /> Cancelar
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-muted">
        M+1 e M+2 somam apenas contratos ativos ainda vigentes naquele mês (início ≤ mês ≤ início + duração − 1). Contratos que encerram antes saem da projeção.
      </p>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
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
        <p className="mt-1 text-sm text-ink-muted">
          O contrato sai da carteira ativa e as projeções de MRR, M+1 e M+2 são recalculadas imediatamente.
        </p>

        {erro && <p className="mt-3 flex items-center gap-1 text-sm text-danger"><AlertCircle size={14} /> {erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={processando}>Voltar</button>
          <button
            onClick={confirmar}
            disabled={processando}
            className="inline-flex items-center gap-1.5 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {processando ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {processando ? "Cancelando…" : "Cancelar contrato"}
          </button>
        </div>
      </div>
    </div>
  );
}
