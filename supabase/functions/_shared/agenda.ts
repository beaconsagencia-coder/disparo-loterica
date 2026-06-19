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
interface Meet { scheduled_for: string | null; duracao_min: number | null; conversation_id?: string | null }

export interface ActiveMeeting { id: string; quando_texto: string | null; scheduled_for: string | null }

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

async function fetchMeetings(
  supabase: SupabaseClient, userId: string, excludeConversationId?: string,
): Promise<Meet[]> {
  // Considera TODAS as reuniões do usuário que não foram canceladas — sejam
  // marcadas pelo bot ou manualmente na aba Agenda. (Reuniões passadas/realizadas
  // não conflitam porque o slotConflict casa data e rejeita horário no passado.)
  const { data } = await supabase.from("meetings")
    .select("scheduled_for, duracao_min, conversation_id").eq("user_id", userId).neq("status", "cancelada")
    .not("scheduled_for", "is", null);
  let rows = (data ?? []) as Meet[];
  // A reunião da PRÓPRIA conversa não conflita com ela mesma (senão o bot
  // remarca o horário que acabou de combinar). Reuniões manuais (sem conversa)
  // são preservadas — só removemos as desta conversa específica.
  if (excludeConversationId) rows = rows.filter((m) => m.conversation_id !== excludeConversationId);
  return rows;
}

/**
 * Reunião ativa (não cancelada, futura ou sem data) deste contato, se houver.
 * Casa por conversation_id OU lead_id — assim uma reunião MANUAL vinculada ao
 * lead (mesmo sem conversa ainda) também é reconhecida e evita duplicação.
 */
export async function activeMeetingFor(
  supabase: SupabaseClient, userId: string, conversationId: string, leadId?: string,
): Promise<ActiveMeeting | null> {
  const ors = [`conversation_id.eq.${conversationId}`];
  if (leadId) ors.push(`lead_id.eq.${leadId}`);
  const { data } = await supabase.from("meetings")
    .select("id, quando_texto, scheduled_for")
    .eq("user_id", userId).neq("status", "cancelada")
    .or(ors.join(","))
    .order("scheduled_for", { ascending: true });
  const corte = Date.now() - 3_600_000; // 1h de tolerância após o horário
  const m = (data ?? []).find((r) => !r.scheduled_for || new Date(r.scheduled_for).getTime() >= corte);
  return (m as ActiveMeeting) ?? null;
}

/** Valida um horário específico. */
export async function checkAvailability(
  supabase: SupabaseClient, userId: string, startISO: string, duracaoMin?: number, excludeConversationId?: string,
): Promise<{ ok: boolean; motivo: string | null; settings: AgendaSettings }> {
  const settings = await loadAgenda(supabase, userId);
  const start = new Date(startISO);
  if (isNaN(start.getTime())) return { ok: false, motivo: "data inválida", settings };
  const { data: blocks } = await supabase.from("agenda_blocks")
    .select("dia_semana, hora_inicio, hora_fim").eq("user_id", userId);
  const meetings = await fetchMeetings(supabase, userId, excludeConversationId);
  const motivo = slotConflict(settings, blocks ?? [], meetings, start, duracaoMin ?? settings.duracao);
  return { ok: !motivo, motivo, settings };
}

/** Resumo da agenda para injetar no contexto do SDR (validação sem depender de tool call). */
export async function agendaResumo(
  supabase: SupabaseClient, userId: string, excludeConversationId?: string,
): Promise<string> {
  const settings = await loadAgenda(supabase, userId);
  const { data: blocks } = await supabase.from("agenda_blocks")
    .select("dia_semana, hora_inicio, hora_fim, titulo").eq("user_id", userId).order("dia_semana");
  const dias = settings.dias.map((d) => DIAS_PT[d]).join(", ");
  const linhas = [
    `- Atendo: ${dias}, das ${settings.inicio} às ${settings.fim} (reuniões de ${settings.duracao} min).`,
  ];
  if (blocks?.length) {
    const fix = blocks.map((b) =>
      `${DIAS_PT[b.dia_semana]} ${b.hora_inicio}–${b.hora_fim}${b.titulo ? ` (${b.titulo})` : ""}`).join("; ");
    linhas.push(`- BLOQUEADO toda semana (nunca ofereça): ${fix}.`);
  }

  // Reuniões JÁ marcadas (bot OU manuais na aba Agenda) — o bot precisa saber
  // que esses horários estão ocupados para não oferecer nem confirmar neles.
  const { data: ocupadasRaw } = await supabase.from("meetings")
    .select("scheduled_for, conversation_id")
    .eq("user_id", userId).neq("status", "cancelada")
    .not("scheduled_for", "is", null)
    .gte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true }).limit(20);
  // Não lista a reunião da própria conversa como "ocupada" (senão o bot tenta
  // remarcar o horário que ele mesmo acabou de combinar com este cliente).
  const ocupadas = (ocupadasRaw ?? []).filter((m) => m.conversation_id !== excludeConversationId);
  if (ocupadas.length) {
    const lista = ocupadas.map((m) => labelSlot(new Date(m.scheduled_for as string))).join("; ");
    linhas.push(`- JÁ OCUPADO por reuniões marcadas (NUNCA ofereça nem confirme estes horários): ${lista}.`);
  }

  const livres = await suggestSlots(supabase, userId, undefined, 5, excludeConversationId);
  if (livres.length) linhas.push(`- Próximos horários LIVRES (ofereça só destes): ${livres.join("; ")}.`);
  return linhas.join("\n");
}

/** Sugere os próximos N horários livres a partir de uma data. */
export async function suggestSlots(
  supabase: SupabaseClient, userId: string, fromISO?: string, count = 3, excludeConversationId?: string,
): Promise<string[]> {
  const settings = await loadAgenda(supabase, userId);
  const { data: blocks } = await supabase.from("agenda_blocks")
    .select("dia_semana, hora_inicio, hora_fim").eq("user_id", userId);
  const meetings = await fetchMeetings(supabase, userId, excludeConversationId);
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
