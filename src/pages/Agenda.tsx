import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Save, Plus, Trash2, Link2, Ban, Check, ChevronLeft, ChevronRight, Settings2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOUR_PX = 44; // altura de 1 hora na grade
const GUTTER_PX = 48; // largura da coluna das horas
const SNAP_MIN = 15; // arraste “gruda” em múltiplos de 15 min

// Estado de um item sendo arrastado na grade (reunião ou compromisso fixo).
interface DragState {
  kind: "meeting" | "block";
  id: string;
  startX: number; startY: number; // ponto onde o arraste começou
  dx: number; dy: number;         // deslocamento atual (para o “fantasma”)
  moved: boolean;                 // passou do limiar => é arraste, não clique
  durationMin: number;            // duração a preservar ao soltar
}

interface Block { id: string; dia_semana: number; hora_inicio: string; hora_fim: string; titulo: string | null; }
interface Meeting {
  id: string; titulo: string | null; quando_texto: string; scheduled_for: string | null;
  duracao_min: number | null; status: string; instance_id: string | null; leads?: { nome: string | null } | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmmToMin = (s: string) => { const [h, m] = String(s).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const minToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // volta para domingo
  return x;
}
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDM = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Partes de uma data no fuso de São Paulo — igual ao backend (o bot agenda em -03:00).
// Posicionar a reunião com o fuso do navegador desalinhava/escondia os horários.
function spPartsClient(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return { y: g("year"), mo: g("month"), da: g("day"), min: g("hour") * 60 + g("minute") };
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
  const [showCfg, setShowCfg] = useState(false);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  // Formulário de bloco (prefill ao clicar na grade)
  const blockFormRef = useRef<HTMLDivElement>(null);
  const [bDia, setBDia] = useState(1);
  const [bHi, setBHi] = useState("12:00");
  const [bHf, setBHf] = useState("13:00");
  const [bTitulo, setBTitulo] = useState("");
  const [bErr, setBErr] = useState<string | null>(null);
  const [bSaving, setBSaving] = useState(false);

  // Arraste na grade (remarcar reuniões / mover compromissos)
  const gridBodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const suppressClickRef = useRef(false); // evita que o "soltar" crie um bloco

  async function loadAll() {
    setLoadErr(null);
    const { data: cfg, error: cfgErr } = await supabase.from("agenda_settings").select("*").maybeSingle();
    if (cfgErr) setLoadErr("Não consegui carregar a agenda: " + cfgErr.message + ". Verifique se o banco foi atualizado (db push).");
    if (cfg) {
      setMeetLink(cfg.meet_link ?? "");
      setDias(cfg.dias ?? [0, 1, 2, 3, 4, 5, 6]);
      setInicio(cfg.inicio ?? "08:00");
      setFim(cfg.fim ?? "22:00");
      setDuracao(cfg.duracao_min ?? 30);
    }
    const { data: b, error: bErr2 } = await supabase.from("agenda_blocks").select("*").order("dia_semana").order("hora_inicio");
    if (bErr2 && !loadErr) setLoadErr("Não consegui carregar os compromissos: " + bErr2.message);
    setBlocks((b as Block[]) ?? []);
    const { data: m, error: mErr } = await supabase.from("meetings")
      .select("id, titulo, quando_texto, scheduled_for, duracao_min, status, instance_id, leads(nome)")
      .order("scheduled_for", { ascending: true, nullsFirst: false });
    if (mErr) setLoadErr((p) => p ?? "Não consegui carregar as reuniões: " + mErr.message);
    setMeetings((m as unknown as Meeting[]) ?? []);
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
    if (!error) loadAll();
  }

  function toggleDia(d: number) {
    setDias((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort());
  }

  // ---- grade ----
  const dayStartH = Math.floor(hhmmToMin(inicio) / 60);
  const dayEndH = Math.ceil(hhmmToMin(fim) / 60);
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = dayStartH; h <= dayEndH; h++) out.push(h);
    return out;
  }, [dayStartH, dayEndH]);
  const gridHeight = (dayEndH - dayStartH) * HOUR_PX;
  const today = new Date();

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Reuniões da semana visível, posicionadas pelo fuso de SP (mesmo do bot).
  // Casa a data SP da reunião com a coluna do dia correspondente.
  const meetingsByDay = useMemo(() => {
    const map: Record<number, { m: Meeting; min: number }[]> = {};
    for (const m of meetings) {
      if (!m.scheduled_for || m.status === "cancelada") continue;
      const sp = spPartsClient(new Date(m.scheduled_for));
      const idx = weekDates.findIndex(
        (d) => d.getFullYear() === sp.y && d.getMonth() + 1 === sp.mo && d.getDate() === sp.da,
      );
      if (idx === -1) continue;
      (map[idx] ??= []).push({ m, min: sp.min });
    }
    return map;
  }, [meetings, weekDates]);

  function topFor(min: number) { return ((min - dayStartH * 60) / 60) * HOUR_PX; }

  function onCellClick(wd: number, e: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; } // veio de um arraste
    if (!dias.includes(wd)) return; // dia não atendido
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = dayStartH * 60 + Math.floor(y / HOUR_PX) * 60; // arredonda p/ hora cheia
    setBDia(wd);
    setBHi(minToHHMM(min));
    setBHf(minToHHMM(Math.min(dayEndH * 60, min + 60)));
    setBErr(null);
    blockFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function addBlock() {
    setBErr(null);
    const uid = await userId();
    if (!uid) return setBErr("Sessão expirada, faça login de novo.");
    if (hhmmToMin(bHf) <= hhmmToMin(bHi)) return setBErr("O fim precisa ser depois do início.");
    setBSaving(true);
    const { error } = await supabase.from("agenda_blocks").insert({
      user_id: uid, dia_semana: bDia, hora_inicio: bHi, hora_fim: bHf, titulo: bTitulo.trim() || null,
    });
    setBSaving(false);
    if (error) return setBErr("Não foi possível salvar: " + error.message);
    setBTitulo("");
    loadAll();
  }
  async function removeBlock(id: string) {
    const { error } = await supabase.from("agenda_blocks").delete().eq("id", id);
    if (error) return setBErr("Erro ao remover: " + error.message);
    loadAll();
  }

  // ---- arraste (drag) na grade ----
  const labelQuando = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // Remarca uma reunião para o dia (data da coluna) e minuto soltos.
  async function moveMeeting(id: string, dateCol: Date, min: number) {
    const iso = `${dateCol.getFullYear()}-${pad(dateCol.getMonth() + 1)}-${pad(dateCol.getDate())}T${minToHHMM(min)}:00-03:00`;
    const { error } = await supabase.from("meetings")
      .update({ scheduled_for: iso, quando_texto: labelQuando(iso) }).eq("id", id);
    if (error) setLoadErr("Não consegui remarcar a reunião: " + error.message);
    loadAll();
  }

  // Move um compromisso fixo para outro dia/horário (mantém a duração).
  async function moveBlock(id: string, wd: number, min: number, durationMin: number) {
    const endMin = Math.min(dayEndH * 60, min + durationMin);
    const { error } = await supabase.from("agenda_blocks")
      .update({ dia_semana: wd, hora_inicio: minToHHMM(min), hora_fim: minToHHMM(endMin) }).eq("id", id);
    if (error) setBErr("Não consegui mover o compromisso: " + error.message);
    loadAll();
  }

  function startDrag(kind: DragState["kind"], id: string, durationMin: number, e: React.PointerEvent) {
    e.stopPropagation();
    setDrag({ kind, id, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false, durationMin });
  }

  // Listeners globais enquanto há item sendo arrastado.
  useEffect(() => {
    if (!drag) return;
    function onMove(ev: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX, dy = ev.clientY - d.startY;
      const moved = d.moved || Math.hypot(dx, dy) > 4;
      setDrag({ ...d, dx, dy, moved });
    }
    function onUp(ev: PointerEvent) {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !d.moved) return;                 // clique simples: ignora
      const body = gridBodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const colW = (rect.width - GUTTER_PX) / 7;
      const col = Math.max(0, Math.min(6, Math.floor((ev.clientX - rect.left - GUTTER_PX) / colW)));
      const minutesFromStart = ((ev.clientY - rect.top) / HOUR_PX) * 60;
      let min = dayStartH * 60 + Math.round(minutesFromStart / SNAP_MIN) * SNAP_MIN;
      min = Math.max(dayStartH * 60, Math.min(dayEndH * 60 - d.durationMin, min));
      suppressClickRef.current = true;            // o clique-fantasma não cria bloco
      if (d.kind === "meeting") moveMeeting(d.id, weekDates[col], min);
      else moveBlock(d.id, col, min, d.durationMin);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag != null]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={22} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
            <p className="text-sm text-ink-muted">O bot consulta esta agenda em tempo real e só marca em horários livres.</p>
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setShowCfg((v) => !v)}>
          <Settings2 size={16} /> Configurações
        </button>
      </header>

      {loadErr && (
        <div className="bento-card mb-4 flex items-start gap-2 border-danger/30 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {loadErr}
        </div>
      )}

      {/* Configurações (recolhível) */}
      {showCfg && (
        <div className="bento-card mb-4">
          <h2 className="mb-3 font-medium">Disponibilidade & link</h2>
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
      )}

      {/* Cronograma semanal */}
      <div className="bento-card mb-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button className="btn-ghost !px-2 !py-1" onClick={() => setWeekStart((w) => addDays(w, -7))}><ChevronLeft size={18} /></button>
            <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</button>
            <button className="btn-ghost !px-2 !py-1" onClick={() => setWeekStart((w) => addDays(w, 7))}><ChevronRight size={18} /></button>
          </div>
          <div className="text-sm font-medium text-ink-soft">
            {fmtDM(weekStart)} – {fmtDM(addDays(weekStart, 6))}
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-ink-muted/40" /> Compromisso fixo</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-accent" /> Reunião</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* Cabeçalho dos dias */}
            <div className="grid" style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}>
              <div />
              {DIAS.map((d, i) => {
                const date = addDays(weekStart, i);
                const isToday = sameDay(date, today);
                const off = !dias.includes(i);
                return (
                  <div key={i} className={`px-1 pb-2 text-center ${off ? "opacity-40" : ""}`}>
                    <div className="text-xs font-medium text-ink-soft">{d}</div>
                    <div className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-accent font-semibold text-white" : "text-ink-muted"}`}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Corpo da grade */}
            <div ref={gridBodyRef} className="grid border-t border-black/5" style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(7, 1fr)` }}>
              {/* Gutter de horas */}
              <div className="relative" style={{ height: gridHeight }}>
                {hours.slice(0, -1).map((h) => (
                  <div key={h} className="absolute -translate-y-1/2 pr-1 text-right text-[10px] text-ink-muted" style={{ top: topFor(h * 60), right: 0, left: 0 }}>
                    {pad(h)}:00
                  </div>
                ))}
              </div>

              {/* Colunas dos dias */}
              {DIAS.map((_, wd) => {
                const off = !dias.includes(wd);
                return (
                  <div
                    key={wd}
                    onClick={(e) => onCellClick(wd, e)}
                    className={`relative border-l border-black/5 ${off ? "bg-black/[0.03]" : "cursor-pointer hover:bg-accent/[0.03]"}`}
                    style={{ height: gridHeight }}
                    title={off ? "Dia fora do atendimento" : "Clique para adicionar um compromisso fixo"}
                  >
                    {/* linhas de hora */}
                    {hours.slice(0, -1).map((h) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-black/5" style={{ top: topFor(h * 60) }} />
                    ))}

                    {/* compromissos fixos (toda semana) — arraste para mover */}
                    {blocks.filter((b) => b.dia_semana === wd).map((b) => {
                      const top = topFor(hhmmToMin(b.hora_inicio));
                      const h = Math.max(18, ((hhmmToMin(b.hora_fim) - hhmmToMin(b.hora_inicio)) / 60) * HOUR_PX);
                      const dur = hhmmToMin(b.hora_fim) - hhmmToMin(b.hora_inicio);
                      const dragging = drag?.kind === "block" && drag.id === b.id && drag.moved;
                      return (
                        <div key={b.id}
                          onPointerDown={(e) => startDrag("block", b.id, dur, e)}
                          onClick={(e) => e.stopPropagation()}
                          title={`${b.titulo ?? "Compromisso"} · arraste para mover`}
                          className={`group absolute left-0.5 right-0.5 cursor-grab touch-none select-none overflow-hidden rounded-md border border-ink-muted/20 bg-ink-muted/15 px-1 py-0.5 text-[10px] leading-tight text-ink-soft ${dragging ? "z-50 cursor-grabbing opacity-80 shadow-lg" : ""}`}
                          style={{ top, height: h, transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined }}>
                          <div className="font-medium truncate">{b.titulo ?? "Bloqueado"}</div>
                          <div className="text-ink-muted">{b.hora_inicio}–{b.hora_fim}</div>
                        </div>
                      );
                    })}

                    {/* reuniões desta semana — arraste para remarcar */}
                    {(meetingsByDay[wd] ?? []).map(({ m, min }) => {
                      const top = topFor(min);
                      const h = Math.max(18, ((m.duracao_min ?? duracao) / 60) * HOUR_PX);
                      const nome = m.leads?.nome && !/^\d+$/.test(m.leads.nome) ? m.leads.nome : null;
                      const hhmm = `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
                      const dragging = drag?.kind === "meeting" && drag.id === m.id && drag.moved;
                      return (
                        <div key={m.id}
                          onPointerDown={(e) => startDrag("meeting", m.id, m.duracao_min ?? duracao, e)}
                          onClick={(e) => e.stopPropagation()}
                          title={`${m.titulo ?? "Reunião"} · ${hhmm} · arraste para remarcar`}
                          className={`absolute left-0.5 right-0.5 cursor-grab touch-none select-none overflow-hidden rounded-md border border-accent/30 bg-accent/20 px-1 py-0.5 text-[10px] leading-tight text-accent ${dragging ? "z-50 cursor-grabbing opacity-80 shadow-lg" : ""}`}
                          style={{ top, height: h, transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined }}>
                          <div className="font-medium truncate">{nome ?? m.titulo ?? "Reunião"}</div>
                          <div className="opacity-70">{hhmm}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Clique num espaço livre para criar um compromisso fixo. Arraste reuniões e blocos para remarcar. Remova um item pela lista abaixo.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Compromissos fixos */}
        <div ref={blockFormRef} className="bento-card">
          <h2 className="mb-1 font-medium">Compromissos fixos (semanais)</h2>
          <p className="mb-3 text-sm text-ink-muted">Repetem toda semana e ficam bloqueados para o bot.</p>

          <div className="mb-3 space-y-2">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
                <span><strong>{DIAS[b.dia_semana]}</strong> {b.hora_inicio}–{b.hora_fim}{b.titulo ? ` · ${b.titulo}` : ""}</span>
                <button className="btn-ghost !px-2 !py-1 text-danger" onClick={() => removeBlock(b.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {blocks.length === 0 && <p className="text-sm text-ink-muted">Nenhum compromisso fixo.</p>}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <select className="input !w-20" value={bDia} onChange={(e) => setBDia(Number(e.target.value))}>
              {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
            <input type="time" className="input !w-28" value={bHi} onChange={(e) => setBHi(e.target.value)} />
            <input type="time" className="input !w-28" value={bHf} onChange={(e) => setBHf(e.target.value)} />
            <input className="input flex-1 !min-w-[120px]" placeholder="Título (opcional)" value={bTitulo} onChange={(e) => setBTitulo(e.target.value)} />
            <button className="btn-accent" onClick={addBlock} disabled={bSaving}><Plus size={16} /> {bSaving ? "…" : "Adicionar"}</button>
          </div>
          {bErr && <p className="mt-2 flex items-center gap-1 text-sm text-danger"><AlertCircle size={14} /> {bErr}</p>}
        </div>

        {/* Reuniões */}
        <MeetingsCard
          meetings={meetings}
          reload={loadAll}
          userId={userId}
          duracao={duracao}
          onJump={(iso) => { if (iso) setWeekStart(startOfWeek(new Date(iso))); }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function MeetingsCard(
  { meetings, reload, userId, duracao, onJump }:
  { meetings: Meeting[]; reload: () => void; userId: () => Promise<string | null>; duracao: number; onJump: (iso: string | null) => void },
) {
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("15:00");
  const [titulo, setTitulo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [instancias, setInstancias] = useState<{ id: string; nome: string; persona_nome: string | null }[]>([]);
  const [instanciaId, setInstanciaId] = useState("");

  useEffect(() => {
    supabase.from("whatsapp_instances").select("id, nome, persona_nome").order("nome")
      .then(({ data }) => setInstancias((data as any) ?? []));
  }, []);

  async function add() {
    setErr(null);
    const uid = await userId();
    if (!uid || !data || !hora) return setErr("Preencha data e hora.");
    const iso = `${data}T${hora}:00-03:00`;
    const quando = new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const { error } = await supabase.from("meetings").insert({
      user_id: uid, titulo: titulo.trim() || (nome ? `Reunião com ${nome}` : "Reunião"),
      quando_texto: quando, scheduled_for: iso, duracao_min: duracao, status: "agendada",
      instance_id: instanciaId || null,
    });
    if (error) return setErr("Não foi possível salvar: " + error.message);
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
  async function setInstance(id: string, instanceId: string) {
    await supabase.from("meetings").update({ instance_id: instanceId || null }).eq("id", id);
    reload();
  }

  const cor: Record<string, string> = {
    agendada: "bg-accent/15 text-accent", realizada: "bg-success/15 text-[#1b7a35]", cancelada: "bg-black/10 text-ink-muted line-through",
  };

  return (
    <div className="bento-card">
      <h2 className="mb-1 font-medium">Reuniões</h2>
      <p className="mb-3 text-sm text-ink-muted">Agendadas pela IA ou por você. Contam na disponibilidade.</p>

      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
        {meetings.map((m) => (
          <div
            key={m.id}
            onClick={() => onJump(m.scheduled_for)}
            title={m.scheduled_for ? "Ver na agenda (vai para a semana da reunião)" : undefined}
            className={`flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm ${m.scheduled_for ? "cursor-pointer hover:bg-white" : ""}`}
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{m.titulo ?? (m.leads?.nome ? `Reunião com ${m.leads.nome}` : "Reunião")}</div>
              <div className="text-xs text-ink-muted">
                {m.scheduled_for
                  ? new Date(m.scheduled_for).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : m.quando_texto}
              </div>
              <select
                className="input mt-1 !w-44 !py-0.5 text-xs"
                value={m.instance_id ?? ""}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setInstance(m.id, e.target.value)}
                title="Chip responsável (conta no relatório)"
              >
                <option value="">Sem chip</option>
                {instancias.map((i) => (
                  <option key={i.id} value={i.id}>{i.persona_nome?.trim() ? `${i.nome} · ${i.persona_nome}` : i.nome}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <span className={`chip ${cor[m.status] ?? ""}`}>{m.status}</span>
              {m.status === "agendada" && (
                <>
                  <button className="btn-ghost !px-2 !py-1" title="Marcar como realizada" onClick={() => setStatus(m.id, "realizada")}><Check size={14} /></button>
                  <button className="btn-ghost !px-2 !py-1" title="Cancelar" onClick={() => setStatus(m.id, "cancelada")}><Ban size={14} /></button>
                </>
              )}
              <button className="btn-ghost !px-2 !py-1 text-danger" title="Remover" onClick={() => remove(m.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {meetings.length === 0 && <p className="text-sm text-ink-muted">Nenhuma reunião.</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input className="input flex-1 !min-w-[120px]" placeholder="Nome (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input type="date" className="input !w-40" value={data} onChange={(e) => setData(e.target.value)} />
        <input type="time" className="input !w-28" value={hora} onChange={(e) => setHora(e.target.value)} />
        <select className="input !w-44" value={instanciaId} onChange={(e) => setInstanciaId(e.target.value)} title="Chip responsável (para contar no relatório)">
          <option value="">Chip (responsável)…</option>
          {instancias.map((i) => (
            <option key={i.id} value={i.id}>{i.persona_nome?.trim() ? `${i.nome} · ${i.persona_nome}` : i.nome}</option>
          ))}
        </select>
        <button className="btn-accent" onClick={add}><Plus size={16} /> Adicionar</button>
      </div>
      {err && <p className="mt-2 flex items-center gap-1 text-sm text-danger"><AlertCircle size={14} /> {err}</p>}
    </div>
  );
}
