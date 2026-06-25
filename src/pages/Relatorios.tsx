import { useEffect, useState } from "react";
import { BarChart3, Send, MessageSquare, CalendarCheck, UserCheck, UserX, Trophy, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ChipStat {
  instance_id: string;
  nome: string;
  persona_nome: string | null;
  enviadas: number;
  respostas: number;
  reunioes: number;
  realizadas: number;
  no_show: number;
  vendas: number;
}
interface Stats {
  funil: { enviadas: number; responderam: number; reunioes: number; realizadas: number; no_show: number; ganhos: number };
  chips: ChipStat[];
}

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
] as const;

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function Relatorios() {
  const [periodo, setPeriodo] = useState<number>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErro(null);
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - (periodo - 1));
      inicio.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.rpc("prospeccao_stats", { p_inicio: inicio.toISOString() });
      if (error) setErro(error.message);
      else setStats(data as Stats);
      setLoading(false);
    })();
  }, [periodo]);

  const f = stats?.funil;
  const topo = Math.max(1, f?.enviadas ?? 0);
  const etapas = f
    ? [
        { label: "Disparos enviados", value: f.enviadas, icon: Send, color: "bg-accent", taxa: null as number | null, base: "" },
        { label: "Responderam", value: f.responderam, icon: MessageSquare, color: "bg-[#5e5ce6]", taxa: pct(f.responderam, f.enviadas), base: "dos disparos" },
        { label: "Reuniões agendadas", value: f.reunioes, icon: CalendarCheck, color: "bg-warning", taxa: pct(f.reunioes, f.responderam), base: "das respostas" },
        { label: "Compareceram", value: f.realizadas, icon: UserCheck, color: "bg-[#0aa2c0]", taxa: pct(f.realizadas, f.reunioes), base: "das reuniões" },
        { label: "Vendas", value: f.ganhos, icon: Trophy, color: "bg-success", taxa: pct(f.ganhos, f.realizadas), base: "das realizadas" },
      ]
    : [];

  // Melhor chip por taxa de resposta (com pelo menos 1 envio), para destacar no A/B.
  const chips = stats?.chips ?? [];
  const elegiveis = chips.filter((c) => c.enviadas > 0);
  const melhorId = elegiveis.length
    ? elegiveis.reduce((a, b) => (pct(b.respostas, b.enviadas) > pct(a.respostas, a.enviadas) ? b : a)).instance_id
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
            <p className="text-sm text-ink-muted">Funil de conversão e desempenho por chip (teste A/B de persona).</p>
          </div>
        </div>
        <div className="inline-flex self-start rounded-xl bg-black/5 p-1 sm:self-auto">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setPeriodo(p.dias)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                periodo === p.dias ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {erro && (
        <div className="bento-card mb-4 border-danger/30 text-sm text-danger">
          Não consegui carregar os relatórios: {erro}. Verifique se o banco foi atualizado (db push da migration 0014).
        </div>
      )}

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      {!loading && f && (
        <>
          {/* Funil */}
          <div className="bento-card mb-4">
            <h2 className="mb-4 font-medium">Funil de conversão</h2>
            <div className="space-y-3">
              {etapas.map((e) => {
                const w = Math.max(6, Math.round((e.value / topo) * 100)); // largura mínima visível
                return (
                  <div key={e.label} className="flex items-center gap-3">
                    <div className="flex w-44 shrink-0 items-center gap-2 text-sm">
                      <e.icon size={15} className="text-ink-muted" />
                      <span className="truncate">{e.label}</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-7 overflow-hidden rounded-lg bg-black/[0.04]">
                        <div className={`flex h-full items-center rounded-lg ${e.color} px-2 text-xs font-semibold text-white`} style={{ width: `${w}%` }}>
                          {e.value}
                        </div>
                      </div>
                    </div>
                    <div className="w-28 shrink-0 text-right text-xs text-ink-muted">
                      {e.taxa !== null ? <><span className="font-semibold text-ink-soft">{e.taxa}%</span> {e.base}</> : "topo do funil"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparecimento, no-show e vendas (desfecho das reuniões) */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="bento-card flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0aa2c0]/15 text-[#0aa2c0]"><UserCheck size={18} /></div>
              <div>
                <div className="text-xl font-semibold tabular-nums">{f.realizadas}<span className="ml-1 text-sm font-normal text-ink-muted">/ {f.reunioes}</span></div>
                <div className="text-xs text-ink-muted">Compareceram · {pct(f.realizadas, f.reunioes)}% das reuniões</div>
              </div>
            </div>
            <div className="bento-card flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"><UserX size={18} /></div>
              <div>
                <div className="text-xl font-semibold tabular-nums text-danger">{f.no_show}</div>
                <div className="text-xs text-ink-muted">No-show · {pct(f.no_show, f.reunioes)}% das reuniões</div>
              </div>
            </div>
            <div className="bento-card flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-[#1b7a35]"><Trophy size={18} /></div>
              <div>
                <div className="text-xl font-semibold tabular-nums text-[#1b7a35]">{f.ganhos}</div>
                <div className="text-xs text-ink-muted">Vendas · {pct(f.ganhos, f.realizadas)}% das realizadas</div>
              </div>
            </div>
          </div>

          {/* Comparativo por chip */}
          <div className="bento-card">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-medium">Desempenho por chip</h2>
              <span className="text-xs text-ink-muted">★ melhor taxa de resposta</span>
            </div>
            <p className="mb-3 text-sm text-ink-muted">Compare as personas: qual nome/abordagem converte mais.</p>

            {chips.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum chip cadastrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-left text-xs text-ink-muted">
                      <th className="py-2 pr-2 font-medium">Chip / persona</th>
                      <th className="py-2 px-2 text-right font-medium">Enviadas</th>
                      <th className="py-2 px-2 text-right font-medium">Respostas</th>
                      <th className="py-2 px-2 text-right font-medium">Taxa resp.</th>
                      <th className="py-2 px-2 text-right font-medium">Reuniões</th>
                      <th className="py-2 px-2 text-right font-medium">No-show</th>
                      <th className="py-2 pl-2 text-right font-medium">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chips.map((c) => {
                      const melhor = c.instance_id === melhorId;
                      return (
                        <tr key={c.instance_id} className="border-b border-black/5 last:border-0">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1.5 font-medium">
                              {melhor && <Star size={13} className="fill-warning text-warning" />}
                              {c.persona_nome?.trim() || c.nome}
                            </div>
                            {c.persona_nome?.trim() && <div className="text-xs text-ink-muted">{c.nome}</div>}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.enviadas}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.respostas}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold text-accent">{pct(c.respostas, c.enviadas)}%</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.reunioes}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold text-danger">{c.no_show}</td>
                          <td className="py-2 pl-2 text-right tabular-nums font-semibold text-[#1b7a35]">{c.vendas}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Reuniões, no-show e vendas são atribuídos ao chip da reunião (ou ao chip atual da conversa). Registre o desfecho na Agenda ou no CRM. Vendas no funil usam a data da última atualização do lead.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
