import { useEffect, useState } from "react";
import { Plus, Trash2, GitBranch, ArrowDown, Clock, Save, Power } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_TEMPLATE } from "@/lib/templates";
import { previewMessage } from "@/lib/spintax";
import type { Cadence } from "@/lib/types";

type Unit = "minutos" | "horas" | "dias";
interface StepDraft {
  ordem: number;
  spintax_template: string;
  value: number; // valor da espera (só passos > 1)
  unit: Unit;
}

function fromMinutes(min: number): { value: number; unit: Unit } {
  if (min > 0 && min % 1440 === 0) return { value: min / 1440, unit: "dias" };
  if (min > 0 && min % 60 === 0) return { value: min / 60, unit: "horas" };
  return { value: min, unit: "minutos" };
}
function toMinutes(value: number, unit: Unit): number {
  return unit === "dias" ? value * 1440 : unit === "horas" ? value * 60 : value;
}

export default function Cadences() {
  const [list, setList] = useState<Cadence[]>([]);
  const [selected, setSelected] = useState<string | "new" | null>(null);

  async function load() {
    const { data } = await supabase.from("cadences").select("*").order("created_at", { ascending: false });
    setList((data as any) ?? []);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cadências</h1>
          <p className="text-sm text-ink-muted">Fluxos de follow-up: continua se ignoram, para se respondem.</p>
        </div>
        <button className="btn-accent" onClick={() => setSelected("new")}>
          <Plus size={16} /> Nova cadência
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {list.map((c) => (
          <button key={c.id} onClick={() => setSelected(c.id)}
            className="bento-card flex flex-col gap-2 text-left hover:ring-2 hover:ring-accent/40">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <GitBranch size={18} />
              </div>
              <span className={`chip ${c.ativo ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}>
                {c.ativo ? "ativa" : "inativa"}
              </span>
            </div>
            <div className="font-medium">{c.nome}</div>
          </button>
        ))}
        {list.length === 0 && (
          <p className="col-span-full text-sm text-ink-muted">
            Nenhuma cadência ainda. Crie a primeira para automatizar os follow-ups.
          </p>
        )}
      </div>

      {selected && (
        <CadenceEditor
          cadenceId={selected === "new" ? null : selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function CadenceEditor({
  cadenceId, onClose, onSaved,
}: { cadenceId: string | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([
    { ordem: 1, spintax_template: DEFAULT_TEMPLATE, value: 0, unit: "horas" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cadenceId) return;
    (async () => {
      const { data: c } = await supabase.from("cadences").select("*").eq("id", cadenceId).single();
      if (c) { setNome(c.nome); setAtivo(c.ativo); }
      const { data: st } = await supabase
        .from("cadence_steps").select("*").eq("cadence_id", cadenceId).order("ordem");
      if (st && st.length) {
        setSteps(st.map((s: any) => ({
          ordem: s.ordem,
          spintax_template: s.spintax_template,
          ...fromMinutes(s.aguardar_minutos),
        })));
      }
    })();
  }, [cadenceId]);

  function addStep() {
    setSteps((s) => [...s, { ordem: s.length + 1, spintax_template: "", value: 24, unit: "horas" }]);
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, ordem: idx + 1 })));
  }
  function patch(i: number, p: Partial<StepDraft>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...p } : st)));
  }

  async function save() {
    setError(null);
    if (!nome.trim()) return setError("Dê um nome à cadência.");
    if (steps.some((s) => !s.spintax_template.trim())) return setError("Há um passo sem mensagem.");

    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sessão expirada.");

      // upsert da cadência
      let id = cadenceId;
      if (!id) {
        const { data, error } = await supabase.from("cadences")
          .insert({ user_id: userId, nome: nome.trim(), ativo }).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabase.from("cadences")
          .update({ nome: nome.trim(), ativo }).eq("id", id);
        if (error) throw error;
      }

      // substitui os passos
      await supabase.from("cadence_steps").delete().eq("cadence_id", id);
      const rows = steps.map((s, idx) => ({
        user_id: userId,
        cadence_id: id,
        ordem: idx + 1,
        spintax_template: s.spintax_template,
        aguardar_minutos: idx === 0 ? 0 : Math.max(1, toMinutes(s.value, s.unit)),
      }));
      const { error: stErr } = await supabase.from("cadence_steps").insert(rows);
      if (stErr) throw stErr;

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/20 p-4">
      <div className="glass-strong my-6 w-full max-w-2xl rounded-xl2 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <input
            className="input !text-lg font-semibold"
            placeholder="Nome da cadência (ex: Prospecção lotéricas)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <button
            onClick={() => setAtivo((a) => !a)}
            className={`chip shrink-0 ${ativo ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}
          >
            <Power size={13} /> {ativo ? "ativa" : "inativa"}
          </button>
        </div>

        {error && <div className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-[#b4231b]">{error}</div>}

        {/* Fluxo */}
        <div className="space-y-1">
          {steps.map((s, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-2 pl-4 text-xs text-ink-muted">
                  <ArrowDown size={14} />
                  <Clock size={13} />
                  <span>Se <strong>não responder</strong>, aguardar</span>
                  <input
                    type="number" min={1}
                    className="input !w-16 !py-1"
                    value={s.value}
                    onChange={(e) => patch(i, { value: Number(e.target.value) })}
                  />
                  <select className="input !w-24 !py-1" value={s.unit}
                    onChange={(e) => patch(i, { unit: e.target.value as Unit })}>
                    <option value="minutos">minutos</option>
                    <option value="horas">horas</option>
                    <option value="dias">dias</option>
                  </select>
                  <span>e enviar:</span>
                </div>
              )}

              <div className="bento-card !p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-soft">
                    {i === 0 ? "1ª mensagem (imediata)" : `Follow-up ${i}`}
                  </span>
                  {steps.length > 1 && (
                    <button className="btn-ghost !px-2 !py-1 text-[#b4231b]" onClick={() => removeStep(i)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <textarea
                  className="input min-h-[80px] font-mono text-xs leading-relaxed"
                  placeholder="{{Saudacao}} {{Nome}}! ..."
                  value={s.spintax_template}
                  onChange={(e) => patch(i, { spintax_template: e.target.value })}
                />
                {s.spintax_template.trim() && (
                  <div className="mt-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs">
                    {previewMessage(s.spintax_template)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button className="btn-ghost mt-3" onClick={addStep}>
          <Plus size={15} /> Adicionar follow-up
        </button>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-accent" onClick={save} disabled={busy}>
            <Save size={16} /> {busy ? "Salvando…" : "Salvar cadência"}
          </button>
        </div>
      </div>
    </div>
  );
}
