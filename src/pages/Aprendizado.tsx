import { useEffect, useState } from "react";
import { Brain, Sparkles, Check, X, Plus, Trash2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Licao {
  id: string;
  texto: string;
  categoria: string;
  evidencia: string | null;
  status: "sugerido" | "aprovado" | "descartado";
  origem: string;
  created_at: string;
}

interface Impacto {
  ativas: number;
  geradas: number;
  descartadas: number;
  inicio: string | null;
  antes: { enviadas: number; respostas: number };
  depois: { enviadas: number; respostas: number };
}

const taxa = (r: number, e: number) => (e > 0 ? Math.round((r / e) * 100) : null);

const CAT_COR: Record<string, string> = {
  abertura: "bg-accent/15 text-accent",
  objecao: "bg-danger/15 text-[#b4231b]",
  agendamento: "bg-warning/15 text-[#9a6500]",
  tom: "bg-[#5e5ce6]/15 text-[#5e5ce6]",
  timing: "bg-[#bf5af2]/15 text-[#8e3fc0]",
  qualificacao: "bg-success/15 text-[#1b7a35]",
  geral: "bg-black/10 text-ink-soft",
};

export default function Aprendizado() {
  const [licoes, setLicoes] = useState<Licao[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nova, setNova] = useState("");
  const [imp, setImp] = useState<Impacto | null>(null);

  async function load() {
    const [{ data }, { data: impData }] = await Promise.all([
      supabase.from("sdr_aprendizados").select("*").neq("status", "descartado").order("created_at", { ascending: false }),
      supabase.rpc("aprendizado_impacto"),
    ]);
    setLicoes((data as Licao[]) ?? []);
    setImp((impData as Impacto) ?? null);
  }
  useEffect(() => { load(); }, []);

  async function analisar() {
    setAnalisando(true); setErro(null); setMsg(null);
    const { data, error } = await supabase.functions.invoke("self-reflect", { body: {} });
    setAnalisando(false);
    if (error) {
      // Extrai o motivo real do corpo da resposta (a Edge Function devolve { error }).
      let detalhe = error.message;
      try {
        const ctx = (error as any).context;
        const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
        if (body?.error) detalhe = body.error;
        else if (body?.motivo) detalhe = body.motivo;
      } catch { /* mantém a mensagem genérica */ }
      return setErro(detalhe);
    }
    const n = data?.sugeridos ?? 0;
    setMsg(n > 0
      ? `${n} nova(s) lição(ões) sugerida(s) a partir de ${data?.analisadas ?? 0} conversa(s).`
      : `Nenhuma lição nova (${data?.motivo ?? "sem novidades"}).`);
    load();
  }

  async function setStatus(id: string, status: Licao["status"]) {
    await supabase.from("sdr_aprendizados").update({ status }).eq("id", id);
    load();
  }

  async function addManual() {
    const texto = nova.trim();
    if (!texto) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("sdr_aprendizados").insert({
      user_id: auth.user.id, texto, categoria: "geral", status: "aprovado", origem: "manual",
    });
    if (error) return setErro(error.message);
    setNova("");
    load();
  }

  const sugeridos = licoes.filter((l) => l.status === "sugerido");
  const aprovados = licoes.filter((l) => l.status === "aprovado");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <Brain size={22} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Aprendizado</h1>
            <p className="text-sm text-ink-muted">O bot analisa as conversas e sugere lições. Você aprova o que entra no SDR.</p>
          </div>
        </div>
        <button className="btn-accent" onClick={analisar} disabled={analisando}>
          <Sparkles size={16} /> {analisando ? "Analisando…" : "Analisar conversas"}
        </button>
      </header>

      {erro && (
        <div className="bento-card mb-4 flex items-start gap-2 border-danger/30 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}
      {msg && <div className="bento-card mb-4 text-sm text-ink-soft">{msg}</div>}

      {/* Impacto do loop */}
      {imp && (() => {
        const tAntes = taxa(imp.antes.respostas, imp.antes.enviadas);
        const tDepois = taxa(imp.depois.respostas, imp.depois.enviadas);
        const temComparacao = imp.inicio && tAntes !== null && tDepois !== null;
        const delta = temComparacao ? (tDepois as number) - (tAntes as number) : null;
        return (
          <div className="bento-card mb-4">
            <h2 className="mb-3 font-medium">Impacto</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-2xl font-semibold tracking-tight text-accent">{imp.ativas}</div>
                <div className="text-xs text-ink-muted">lições ativas</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">{imp.geradas}</div>
                <div className="text-xs text-ink-muted">geradas pelo loop</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight text-ink-soft">{imp.descartadas}</div>
                <div className="text-xs text-ink-muted">descartadas</div>
              </div>
            </div>

            <div className="mt-4 border-t border-black/5 pt-3">
              <div className="mb-1 text-xs font-medium text-ink-soft">Taxa de resposta (indicativa)</div>
              {temComparacao ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-ink-muted">Antes: <strong className="text-ink">{tAntes}%</strong></span>
                  <span className="text-ink-muted">→</span>
                  <span className="text-ink-muted">Depois: <strong className="text-ink">{tDepois}%</strong></span>
                  {delta !== null && delta !== 0 && (
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${delta > 0 ? "text-[#1b7a35]" : "text-danger"}`}>
                      {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {delta > 0 ? "+" : ""}{delta} p.p.
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  {imp.inicio
                    ? "Ainda sem dados suficientes para comparar (poucos disparos antes/depois)."
                    : "Aprove a primeira lição para começar a medir o impacto."}
                </p>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">
                Compara a taxa de resposta desde a 1ª lição aprovada com o mesmo período imediatamente anterior.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Sugestões pendentes de revisão */}
      <div className="bento-card mb-4">
        <h2 className="mb-1 font-medium">Sugestões para revisar ({sugeridos.length})</h2>
        <p className="mb-3 text-sm text-ink-muted">Aprove para o bot passar a aplicar, ou descarte.</p>
        {sugeridos.length === 0 ? (
          <p className="text-sm text-ink-muted">Nada pendente. Clique em “Analisar conversas” para gerar sugestões.</p>
        ) : (
          <div className="space-y-2">
            {sugeridos.map((l) => (
              <div key={l.id} className="rounded-xl bg-white/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`chip mb-1 ${CAT_COR[l.categoria] ?? CAT_COR.geral}`}>{l.categoria}</span>
                    <p className="text-sm">{l.texto}</p>
                    {l.evidencia && <p className="mt-1 text-xs text-ink-muted">Por quê: {l.evidencia}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-ghost !px-2 !py-1 text-[#1b7a35]" title="Aprovar" onClick={() => setStatus(l.id, "aprovado")}>
                      <Check size={16} />
                    </button>
                    <button className="btn-ghost !px-2 !py-1 text-danger" title="Descartar" onClick={() => setStatus(l.id, "descartado")}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lições ativas (entram no prompt do SDR) */}
      <div className="bento-card">
        <h2 className="mb-1 font-medium">Lições ativas ({aprovados.length})</h2>
        <p className="mb-3 text-sm text-ink-muted">Estas estão sendo aplicadas pelo bot agora.</p>

        <div className="mb-3 space-y-2">
          {aprovados.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-2 rounded-xl bg-white/60 p-3">
              <div className="min-w-0">
                <span className={`chip mb-1 ${CAT_COR[l.categoria] ?? CAT_COR.geral}`}>{l.categoria}</span>
                <p className="text-sm">{l.texto}</p>
              </div>
              <button className="btn-ghost !px-2 !py-1 text-danger" title="Remover (deixa de aplicar)" onClick={() => setStatus(l.id, "descartado")}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {aprovados.length === 0 && <p className="text-sm text-ink-muted">Nenhuma lição ativa ainda.</p>}
        </div>

        {/* Adicionar manualmente */}
        <div className="flex items-end gap-2">
          <input
            className="input flex-1"
            placeholder="Adicionar uma lição manualmente…"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
          />
          <button className="btn-accent shrink-0" onClick={addManual} disabled={!nova.trim()}>
            <Plus size={16} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
