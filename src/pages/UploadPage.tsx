import { useEffect, useMemo, useState } from "react";
import { UploadCloud, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseFile, type ParsedFile } from "@/components/upload/useFileParser";
import { normalizePhoneBR, maskPhoneBR } from "@/lib/phone";
import { previewMessage } from "@/lib/spintax";
import { supabase } from "@/lib/supabase";
import { DEFAULT_TEMPLATE } from "@/lib/templates";

type Field = "nome" | "telefone" | "empresa";
type Mapping = Record<Field, string>; // Field -> nome da coluna do arquivo

const STEPS = ["Arquivo", "Mapeamento", "Mensagem", "Concluído"] as const;

export default function UploadPage() {
  const [step, setStep] = useState(0);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping>({ nome: "", telefone: "", empresa: "" });
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [cadences, setCadences] = useState<{ id: string; nome: string }[]>([]);
  const [cadenceId, setCadenceId] = useState(""); // "" = mensagem única
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; invalid: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("cadences").select("id, nome").eq("ativo", true).order("nome")
      .then(({ data }) => setCadences((data as any) ?? []));
  }, []);

  async function handleFile(file: File) {
    setError(null);
    try {
      const data = await parseFile(file);
      setParsed(data);
      // auto-map por heurística de nomes de coluna
      const guess = (cands: string[]) =>
        data.headers.find((h) => cands.some((c) => h.toLowerCase().includes(c))) ?? "";
      setMapping({
        nome: guess(["nome", "name", "contato"]),
        telefone: guess(["tel", "fone", "phone", "whats", "celular"]),
        empresa: guess(["empresa", "loteric", "company", "estabelec"]),
      });
      setStep(1);
    } catch (e) {
      setError("Não consegui ler o arquivo. Confira se é CSV ou XLSX válido.");
    }
  }

  // Pré-visualização das linhas normalizadas
  const preview = useMemo(() => {
    if (!parsed || !mapping.telefone || !mapping.nome) return [];
    return parsed.rows.slice(0, 8).map((r) => {
      const tel = normalizePhoneBR(r[mapping.telefone]);
      return {
        nome: r[mapping.nome]?.trim() ?? "",
        empresa: mapping.empresa ? r[mapping.empresa]?.trim() ?? "" : "",
        telefone: tel,
      };
    });
  }, [parsed, mapping]);

  async function handleImport() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Faça login para importar.");

      // 1) Normaliza + deduplica em memória
      const seen = new Set<string>();
      let invalid = 0;
      const leadsToInsert = [];
      for (const row of parsed.rows) {
        const tel = normalizePhoneBR(row[mapping.telefone]);
        const nome = row[mapping.nome]?.trim();
        if (!tel || !nome) {
          invalid++;
          continue;
        }
        if (seen.has(tel)) continue;
        seen.add(tel);
        leadsToInsert.push({
          user_id: userId,
          nome,
          telefone: tel,
          empresa: mapping.empresa ? row[mapping.empresa]?.trim() || null : null,
          status: "na_fila" as const,
          origem: "import_csv",
        });
      }

      // 2) Upsert de leads (dedupe por user_id+telefone no banco)
      const { data: leads, error: leadErr } = await supabase
        .from("leads")
        .upsert(leadsToInsert, { onConflict: "user_id,telefone" })
        .select("id");
      if (leadErr) throw leadErr;

      // 3) Define a mensagem do passo 1: cadência escolhida ou mensagem única.
      let firstTemplate = template;
      let cadenceFields: Record<string, unknown> = {};
      if (cadenceId) {
        const { data: step1 } = await supabase
          .from("cadence_steps").select("spintax_template")
          .eq("cadence_id", cadenceId).eq("ordem", 1).maybeSingle();
        if (!step1) throw new Error("A cadência escolhida não tem 1ª mensagem.");
        firstTemplate = step1.spintax_template;
        cadenceFields = { cadence_id: cadenceId, cadence_step: 1 };
      }

      // 4) Enfileira uma mensagem por lead -> vai direto para a fila de disparo
      const queue = (leads ?? []).map((l) => ({
        user_id: userId,
        lead_id: l.id,
        spintax_template: firstTemplate,
        status: "pendente" as const,
        ...cadenceFields,
      }));
      if (queue.length) {
        const { error: qErr } = await supabase.from("message_queue").insert(queue);
        if (qErr) throw qErr;
      }

      setResult({ inserted: leads?.length ?? 0, invalid });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Importar Leads</h1>
        <p className="text-sm text-ink-muted">
          Suba um CSV ou Excel, mapeie as colunas e envie os contatos direto para a fila de disparo.
        </p>
      </header>

      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                i <= step ? "bg-accent text-white" : "bg-black/10 text-ink-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className={i <= step ? "text-ink" : "text-ink-muted"}>{s}</span>
            {i < STEPS.length - 1 && <ArrowRight size={14} className="text-ink-muted" />}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-[#b4231b]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* STEP 0 — Upload */}
      {step === 0 && (
        <label className="bento-card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-black/10 py-16 text-center hover:border-accent/50">
          <UploadCloud size={36} className="text-accent" />
          <div className="font-medium">Arraste ou clique para enviar</div>
          <div className="text-sm text-ink-muted">.csv, .xlsx ou .xls</div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {/* STEP 1 — Mapeamento */}
      {step === 1 && parsed && (
        <div className="bento-card">
          <h2 className="mb-1 font-medium">Mapeie as colunas</h2>
          <p className="mb-4 text-sm text-ink-muted">
            {parsed.rows.length} linhas detectadas. Diga qual coluna é cada campo.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["nome", "telefone", "empresa"] as Field[]).map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium capitalize text-ink-soft">
                  {field} {field !== "empresa" && <span className="text-danger">*</span>}
                </label>
                <select
                  className="input"
                  value={mapping[field]}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                >
                  <option value="">— selecione —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {preview.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-black/5">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.03] text-left text-xs text-ink-muted">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Telefone</th>
                    <th className="px-3 py-2">Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} className="border-t border-black/5">
                      <td className="px-3 py-2">{p.nome || <em className="text-danger">vazio</em>}</td>
                      <td className="px-3 py-2">
                        {p.telefone ? maskPhoneBR(p.telefone) : <em className="text-danger">inválido</em>}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{p.empresa || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>Voltar</button>
            <button
              className="btn-accent"
              disabled={!mapping.nome || !mapping.telefone}
              onClick={() => setStep(2)}
            >
              Continuar <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Mensagem (Spintax) ou Cadência */}
      {step === 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 bento-card">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Tipo de disparo</label>
            <select className="input" value={cadenceId} onChange={(e) => setCadenceId(e.target.value)}>
              <option value="">Mensagem única</option>
              {cadences.map((c) => (
                <option key={c.id} value={c.id}>Cadência (follow-up): {c.nome}</option>
              ))}
            </select>
            {cadenceId && (
              <p className="mt-2 text-xs text-ink-muted">
                Os leads entram na cadência escolhida: a 1ª mensagem sai agora e os follow-ups
                seguem automaticamente para quem não responder. Edite o fluxo na aba <strong>Cadências</strong>.
              </p>
            )}
          </div>

          {!cadenceId && (
            <>
              <div className="bento-card">
                <h2 className="mb-1 font-medium">Template Spintax</h2>
                <p className="mb-3 text-sm text-ink-muted">
                  Use <code className="rounded bg-black/5 px-1">{"{a|b|c}"}</code> para variações e{" "}
                  <code className="rounded bg-black/5 px-1">{"{{Nome}}"}</code>,{" "}
                  <code className="rounded bg-black/5 px-1">{"{{Empresa}}"}</code>,{" "}
                  <code className="rounded bg-black/5 px-1">{"{{Saudacao}}"}</code>.
                </p>
                <textarea
                  className="input min-h-[180px] font-mono text-xs leading-relaxed"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                />
              </div>
              <div className="bento-card">
                <h2 className="mb-3 font-medium">Prévia</h2>
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-2xl rounded-bl-sm bg-success/10 px-4 py-2.5 text-sm">
                      {previewMessage(template)}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-ink-muted">Cada lead recebe uma variação única.</p>
              </div>
            </>
          )}

          <div className="md:col-span-2 flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>Voltar</button>
            <button className="btn-accent" disabled={busy} onClick={handleImport}>
              {busy ? "Importando…" : "Importar e enfileirar"} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Concluído */}
      {step === 3 && result && (
        <div className="bento-card flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 size={40} className="text-success" />
          <h2 className="text-lg font-semibold">Importação concluída</h2>
          <p className="text-sm text-ink-muted">
            <strong>{result.inserted}</strong> leads enfileirados para disparo.
            {result.invalid > 0 && <> {result.invalid} linhas ignoradas (sem nome/telefone válido).</>}
          </p>
          <button
            className="btn-accent mt-2"
            onClick={() => {
              setStep(0);
              setParsed(null);
              setResult(null);
            }}
          >
            Importar outra lista
          </button>
        </div>
      )}
    </div>
  );
}
