import { useEffect, useState } from "react";
import { Bot, Save, Power, AlertTriangle, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PLAYBOOK } from "@/lib/aiPlaybook";

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — rápido e econômico (recomendado)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — mais inteligente" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite — o mais barato" },
];

interface Meeting {
  id: string;
  quando_texto: string;
  titulo: string | null;
  status: string;
  created_at: string;
}

export default function AiSdr() {
  const [ativo, setAtivo] = useState(false);
  const [persona, setPersona] = useState("Pedro");
  const [empresa, setEmpresa] = useState("Chamada Beacons");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [playbook, setPlaybook] = useState(DEFAULT_PLAYBOOK);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("ai_config").select("*").maybeSingle();
      if (data) {
        setAtivo(data.ativo);
        setPersona(data.persona_nome);
        setEmpresa(data.empresa);
        setModel(data.model);
        setPlaybook(data.playbook);
      }
      const { data: m } = await supabase
        .from("meetings").select("id, quando_texto, titulo, status, created_at")
        .order("created_at", { ascending: false }).limit(20);
      setMeetings((m as any) ?? []);
    })();
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) { setBusy(false); return setMsg("Sessão expirada."); }
    const { error } = await supabase.from("ai_config").upsert(
      { user_id: userId, ativo, persona_nome: persona.trim(), empresa: empresa.trim(), model, playbook },
      { onConflict: "user_id" },
    );
    setBusy(false);
    setMsg(error ? "Erro ao salvar: " + error.message : "Configuração salva ✅");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SDR com IA</h1>
          <p className="text-sm text-ink-muted">A IA responde, qualifica e agenda reuniões seguindo a sua copy.</p>
        </div>
        <button
          onClick={() => setAtivo((a) => !a)}
          className={`chip ${ativo ? "bg-success/15 text-[#1b7a35]" : "bg-black/10 text-ink-muted"}`}
        >
          <Power size={14} /> {ativo ? "IA ligada" : "IA desligada"}
        </button>
      </header>

      {msg && <div className="mb-4 rounded-xl bg-black/5 px-4 py-2.5 text-sm">{msg}</div>}

      {ativo && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning/10 px-4 py-3 text-sm text-[#9a6200]">
          <AlertTriangle size={16} />
          Com a IA ligada, toda resposta recebida será respondida automaticamente. Você pode assumir qualquer conversa no Inbox.
        </div>
      )}

      <div className="bento-card mb-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Seu nome (como a IA se apresenta)</label>
          <input className="input" value={persona} onChange={(e) => setPersona(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Sua empresa</label>
          <input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Modelo de IA</label>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bento-card mb-4">
        <div className="mb-1 flex items-center gap-2">
          <Bot size={16} className="text-accent" />
          <h2 className="font-medium">Roteiro / Copy (o que a IA deve seguir)</h2>
        </div>
        <p className="mb-3 text-sm text-ink-muted">
          Use <code className="rounded bg-black/5 px-1">{"{{Nome}}"}</code> e{" "}
          <code className="rounded bg-black/5 px-1">{"{{Empresa}}"}</code>. A IA personaliza com os dados do lead.
        </p>
        <textarea
          className="input min-h-[320px] font-mono text-xs leading-relaxed"
          value={playbook}
          onChange={(e) => setPlaybook(e.target.value)}
        />
      </div>

      <div className="mb-6 flex justify-end">
        <button className="btn-accent" disabled={busy} onClick={save}>
          <Save size={16} /> {busy ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>

      {/* Reuniões agendadas pela IA */}
      <div className="bento-card">
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={16} className="text-accent" />
          <h2 className="font-medium">Reuniões agendadas</h2>
        </div>
        {meetings.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma reunião agendada ainda.</p>
        ) : (
          <div className="space-y-2">
            {meetings.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{m.titulo ?? "Reunião"}</div>
                  <div className="text-xs text-ink-muted">{m.quando_texto}</div>
                </div>
                <span className="chip bg-success/15 text-[#1b7a35]">{m.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
