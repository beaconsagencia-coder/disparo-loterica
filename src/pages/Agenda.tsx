import { useEffect, useState } from "react";
import { CalendarDays, Save, Plus, Trash2, Link2, Ban, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Block { id: string; dia_semana: number; hora_inicio: string; hora_fim: string; titulo: string | null; }
interface Meeting {
  id: string; titulo: string | null; quando_texto: string; scheduled_for: string | null;
  status: string; leads?: { nome: string | null } | null;
}

export default function Agenda() {
  // Configurações
  const [meetLink, setMeetLink] = useState("");
  const [dias, setDias] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("22:00");
  const [duracao, setDuracao] = useState(30);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  async function loadAll() {
    const { data: cfg } = await supabase.from("agenda_settings").select("*").maybeSingle();
    if (cfg) {
      setMeetLink(cfg.meet_link ?? "");
      setDias(cfg.dias ?? [0, 1, 2, 3, 4, 5, 6]);
      setInicio(cfg.inicio ?? "08:00");
      setFim(cfg.fim ?? "22:00");
      setDuracao(cfg.duracao_min ?? 30);
    }
    const { data: b } = await supabase.from("agenda_blocks").select("*").order("dia_semana").order("hora_inicio");
    setBlocks((b as any) ?? []);
    const { data: m } = await supabase.from("meetings")
      .select("id, titulo, quando_texto, scheduled_for, status, leads(nome)")
      .order("scheduled_for", { ascending: true, nullsFirst: false });
    setMeetings((m as any) ?? []);
  }
  useEffect(() => { loadAll(); }, []);

  async function userId() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  async function saveCfg() {
    setSavingCfg(true); setCfgMsg(null);
    const uid = await userId();
    if (!uid) { setSavingCfg(false); return setCfgMsg("Sessão expirada."); }
    const { error } = await supabase.from("agenda_settings").upsert(
      { user_id: uid, meet_link: meetLink.trim(), dias, inicio, fim, duracao_min: duracao },
      { onConflict: "user_id" },
    );
    setSavingCfg(false);
    setCfgMsg(error ? "Erro: " + error.message : "Configurações salvas ✅");
  }

  function toggleDia(d: number) {
    setDias((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort());
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center gap-2">
        <CalendarDays size={22} className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-ink-muted">Disponibilidade, compromissos fixos e reuniões — o bot respeita tudo isso.</p>
        </div>
      </header>

      {/* Configurações */}
      <div className="bento-card mb-4">
        <h2 className="mb-3 font-medium">Disponibilidade</h2>
        <label className="mb-1 block text-xs font-medium text-ink-soft">Link fixo da reunião (Meet/Zoom/sala)</label>
        <div className="mb-3 flex items-center gap-2">
          <Link2 size={16} className="text-ink-muted" />
          <input className="input" placeholder="https://meet.google.com/abc-defg-hij"
            value={meetLink} onChange={(e) => setMeetLink(e.target.value)} />
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-soft">Dias de atendimento</label>
        <div className="mb-3 flex flex-wrap gap-2">
          {DIAS.map((d, i) => (
            <button key={i} onClick={() => toggleDia(i)}
              className={`chip ${dias.includes(i) ? "bg-accent text-white" : "bg-black/10 text-ink-muted"}`}>
              {d}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Início</label>
            <input type="time" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Fim</label>
            <input type="time" className="input" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Duração da reunião (min)</label>
            <input type="number" min={5} step={5} className="input" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className="btn-accent" onClick={saveCfg} disabled={savingCfg}>
            <Save size={16} /> {savingCfg ? "Salvando…" : "Salvar"}
          </button>
          {cfgMsg && <span className="text-sm text-ink-muted">{cfgMsg}</span>}
        </div>
      </div>

      {/* Compromissos fixos semanais */}
      <BlocksCard blocks={blocks} reload={loadAll} userId={userId} />

      {/* Reuniões */}
      <MeetingsCard meetings={meetings} reload={loadAll} userId={userId} duracao={duracao} />
    </div>
  );
}

// ---------------------------------------------------------------------
function BlocksCard({ blocks, reload, userId }: { blocks: Block[]; reload: () => void; userId: () => Promise<string | null> }) {
  const [dia, setDia] = useState(1);
  const [hi, setHi] = useState("12:00");
  const [hf, setHf] = useState("13:00");
  const [titulo, setTitulo] = useState("");

  async function add() {
    const uid = await userId();
    if (!uid || !hi || !hf) return;
    await supabase.from("agenda_blocks").insert({ user_id: uid, dia_semana: dia, hora_inicio: hi, hora_fim: hf, titulo: titulo.trim() || null });
    setTitulo("");
    reload();
  }
  async function remove(id: string) {
    await supabase.from("agenda_blocks").delete().eq("id", id);
    reload();
  }

  return (
    <div className="bento-card mb-4">
      <h2 className="mb-1 font-medium">Compromissos fixos (semanais)</h2>
      <p className="mb-3 text-sm text-ink-muted">Horários que se repetem toda semana e ficam bloqueados para o bot.</p>

      <div className="mb-3 space-y-2">
        {blocks.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
            <span><strong>{DIAS[b.dia_semana]}</strong> {b.hora_inicio}–{b.hora_fim}{b.titulo ? ` · ${b.titulo}` : ""}</span>
            <button className="btn-ghost !px-2 !py-1 text-[#b4231b]" onClick={() => remove(b.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        {blocks.length === 0 && <p className="text-sm text-ink-muted">Nenhum compromisso fixo.</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <select className="input !w-24" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
          {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        <input type="time" className="input !w-28" value={hi} onChange={(e) => setHi(e.target.value)} />
        <input type="time" className="input !w-28" value={hf} onChange={(e) => setHf(e.target.value)} />
        <input className="input flex-1 !min-w-[120px]" placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <button className="btn-accent" onClick={add}><Plus size={16} /> Adicionar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function MeetingsCard(
  { meetings, reload, userId, duracao }:
  { meetings: Meeting[]; reload: () => void; userId: () => Promise<string | null>; duracao: number },
) {
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("15:00");
  const [titulo, setTitulo] = useState("");

  async function add() {
    const uid = await userId();
    if (!uid || !data || !hora) return;
    const iso = `${data}T${hora}:00-03:00`;
    const quando = new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await supabase.from("meetings").insert({
      user_id: uid, titulo: titulo.trim() || (nome ? `Reunião com ${nome}` : "Reunião"),
      quando_texto: quando, scheduled_for: iso, duracao_min: duracao, status: "agendada",
    });
    setNome(""); setTitulo("");
    reload();
  }
  async function setStatus(id: string, status: string) {
    await supabase.from("meetings").update({ status }).eq("id", id);
    reload();
  }
  async function remove(id: string) {
    if (!confirm("Remover esta reunião?")) return;
    await supabase.from("meetings").delete().eq("id", id);
    reload();
  }

  const cor: Record<string, string> = {
    agendada: "bg-accent/15 text-accent", realizada: "bg-success/15 text-[#1b7a35]", cancelada: "bg-black/10 text-ink-muted line-through",
  };

  return (
    <div className="bento-card">
      <h2 className="mb-1 font-medium">Reuniões</h2>
      <p className="mb-3 text-sm text-ink-muted">Agendadas pela IA ou adicionadas por você. Contam na disponibilidade.</p>

      <div className="mb-3 space-y-2">
        {meetings.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{m.titulo ?? (m.leads?.nome ? `Reunião com ${m.leads.nome}` : "Reunião")}</div>
              <div className="text-xs text-ink-muted">
                {m.scheduled_for
                  ? new Date(m.scheduled_for).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : m.quando_texto}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={`chip ${cor[m.status] ?? ""}`}>{m.status}</span>
              {m.status === "agendada" && (
                <>
                  <button className="btn-ghost !px-2 !py-1" title="Marcar como realizada" onClick={() => setStatus(m.id, "realizada")}><Check size={14} /></button>
                  <button className="btn-ghost !px-2 !py-1" title="Cancelar" onClick={() => setStatus(m.id, "cancelada")}><Ban size={14} /></button>
                </>
              )}
              <button className="btn-ghost !px-2 !py-1 text-[#b4231b]" title="Remover" onClick={() => remove(m.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {meetings.length === 0 && <p className="text-sm text-ink-muted">Nenhuma reunião.</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input className="input flex-1 !min-w-[120px]" placeholder="Nome (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input type="date" className="input !w-40" value={data} onChange={(e) => setData(e.target.value)} />
        <input type="time" className="input !w-28" value={hora} onChange={(e) => setHora(e.target.value)} />
        <button className="btn-accent" onClick={add}><Plus size={16} /> Adicionar reunião</button>
      </div>
    </div>
  );
}
