// =====================================================================
// Agenda / disponibilidade — checagem em tempo real e sugestão de slots.
// Tudo no fuso America/Sao_Paulo (Brasil não usa horário de verão).
// =====================================================================
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AgendaSettings {
  meetLink: string;
  dias: number[];   // 0=domingo ... 6=sábado
  inicio: string;   // "08:00"
  fim: string;      // "22:00"
  duracao: number;  // minutos
}

const DIAS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const pad = (n: number) => String(n).padStart(2, "0");
const hhmmToMin = (s: string) => { const [h, m] = String(s).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Partes de uma data no fuso de SP.
function spParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  const y = g("year"), mo = g("month"), da = g("day"), h = g("hour"), mi = g("minute");
  const weekday = new Date(Date.UTC(y, mo - 1, da)).getUTCDay();
  return { y, mo, da, h, mi, weekday, minutesOfDay: h * 60 + mi };
}

// Constrói uma data a partir de Y-M-D H:M no fuso de SP (UTC-3 fixo).
function spDate(y: number, mo: number, da: number, min: number): Date {
  return new Date(`${y}-${pad(mo)}-${pad(da)}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00-03:00`);
}

export async function loadAgenda(supabase: SupabaseClient, userId: string): Promise<AgendaSettings> {
  const { data } = await supabase.from("agenda_settings")
    .select("meet_link, dias, inicio, fim, duracao_min").eq("user_id", userId).maybeSingle();
  return {
    meetLink: data?.meet_link ?? "",
    dias: data?.dias ?? [0, 1, 2, 3, 4, 5, 6],
    inicio: data?.inicio ?? "08:00",
    fim: data?.fim ?? "22:00",
    duracao: data?.duracao_min ?? 30,
  };
}

interface Block { dia_semana: number; hora_inicio: string; hora_fim: string }
interface Meet { scheduled_for: string | null; duracao_min: number | null }

/** Retorna o motivo do conflito, ou null se o horário está livre. */
export function slotConflict(
  settings: AgendaSettings, blocks: Block[], meetings: Meet[], start: Date, duracaoMin: number,
): string | null {
  if (start.getTime() < Date.now() + 60_000) return "horário no passado";
  const sp = spParts(start);
  if (!settings.dias.includes(sp.weekday)) return "fora dos dias de atendimento";
  const startMin = sp.minutesOfDay;
  const endMin = startMin + duracaoMin;
  if (startMin < hhmmToMin(settings.inicio) || endMin > hhmmToMin(settings.fim)) return "fora do horário de atendimento";
  for (const b of blocks) {
    if (b.dia_semana !== sp.weekday) continue;
    if (startMin < hhmmToMin(b.hora_fim) && endMin > hhmmToMin(b.hora_inicio)) return "há um compromisso fixo nesse horário";
  }
  for (const m of meetings) {
    if (!m.scheduled_for) continue;
    const mp = spParts(new Date(m.scheduled_for));
    if (mp.y !== sp.y || mp.mo !== sp.mo || mp.da !== sp.da) continue;
    const mStart = mp.minutesOfDay, mEnd = mStart + (m.duracao_min ?? settings.duracao);
    if (startMin < mEnd && endMin > mStart) return "já existe uma reunião nesse horário";
  }
  return null;
}

export function labelSlot(d: Date): string {
  const sp = spParts(d);
  return `${DIAS_PT[sp.weekday]} ${pad(sp.da)}/${pad(sp.mo)} às ${pad(sp.h)}:${pad(sp.mi)}`;
}

async function fetchMeetings(supabase: SupabaseClient, userId: string): Promise<Meet[]> {
  const { data } = await supabase.from("meetings")
    .select("scheduled_for, duracao_min").eq("user_id", userId).eq("status", "agendada")
    .not("scheduled_for", "is", null);
  return data ?? [];
}

/** Valida um horário específico. */
export async function checkAvailability(
  supabase: SupabaseClient, userId: string, startISO: string, duracaoMin?: number,
): Promise<{ ok: boolean; motivo: string | null; settings: AgendaSettings }> {
  const settings = await loadAgenda(supabase, userId);
  const start = new Date(startISO);
  if (isNaN(start.getTime())) return { ok: false, motivo: "data inválida", settings };
  const { data: blocks } = await supabase.from("agenda_blocks")
    .select("dia_semana, hora_inicio, hora_fim").eq("user_id", userId);
  const meetings = await fetchMeetings(supabase, userId);
  const motivo = slotConflict(settings, blocks ?? [], meetings, start, duracaoMin ?? settings.duracao);
  return { ok: !motivo, motivo, settings };
}

/** Sugere os próximos N horários livres a partir de uma data. */
export async function suggestSlots(
  supabase: SupabaseClient, userId: string, fromISO?: string, count = 3,
): Promise<string[]> {
  const settings = await loadAgenda(supabase, userId);
  const { data: blocks } = await supabase.from("agenda_blocks")
    .select("dia_semana, hora_inicio, hora_fim").eq("user_id", userId);
  const meetings = await fetchMeetings(supabase, userId);
  const dur = settings.duracao;
  const startMinDay = hhmmToMin(settings.inicio);
  const endMinDay = hhmmToMin(settings.fim);
  const from = fromISO && !isNaN(new Date(fromISO).getTime()) ? new Date(fromISO) : new Date();

  const out: string[] = [];
  for (let dayOffset = 0; dayOffset < 14 && out.length < count; dayOffset++) {
    // Data-base (meio-dia UTC evita borda de fuso) + offset de dias.
    const base = spParts(new Date(Date.now() + dayOffset * 86_400_000 + 15 * 3_600_000));
    for (let min = startMinDay; min + dur <= endMinDay && out.length < count; min += dur) {
      const slot = spDate(base.y, base.mo, base.da, min);
      if (slot.getTime() < from.getTime()) continue;
      if (!slotConflict(settings, blocks ?? [], meetings, slot, dur)) out.push(labelSlot(slot));
    }
  }
  return out;
}
