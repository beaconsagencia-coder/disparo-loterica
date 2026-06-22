// =====================================================================
// Detecção de resposta AUTOMÁTICA de "fora do horário / fechado".
// Quando o cliente responde com um auto-reply de empresa fechada, o bot
// NÃO deve insistir — deve aguardar o próximo dia útil para retomar.
// =====================================================================

// Frases típicas de auto-reply de comércio fechado (texto já normalizado:
// minúsculo e sem acentos). Conservador para não silenciar lead de verdade
// (ex.: "Fechado!" como "negócio fechado" NÃO casa — exige contexto).
const FRASES: RegExp[] = [
  /fora do horario/,
  /horario de (atendimento|funcionamento|expediente)/,
  /estamos? fechad/, // "estamos fechados", "estamo fechado"
  /no momento.{0,25}(fechad|indispon|fora|ausente|nao estamos)/,
  /(mensagem|resposta) automatica/,
  /retornaremos|responderemos (assim que|o mais breve|em breve|no proximo)/,
  /(voltaremos|retornamos|voltamos|reabrimos|abrimos) (a atender|amanha|segunda|as \d|\dh)/,
  /fechad[oa]s?\b.{0,30}(almoco|feriado|expediente|atendimento|amanha|segunda|domingo|hoje|volt|horario|reabr)/,
  /nao estamos (disponivel|disponiveis|atendendo) no momento/,
  /estamos (ausentes|indisponiveis|offline)/,
  /atend(emos|imento)( de)? (segunda|seg)\b/,
];

/** True se a mensagem parece um auto-reply de empresa fechada / fora do horário. */
export function isAutoReply(raw: string): boolean {
  const t = (raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return false;
  return FRASES.some((re) => re.test(t));
}

function spYMD(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return { y: g("year"), mo: g("month"), da: g("day") };
}

/** Próximo dia útil às 09:00 (fuso de São Paulo, -03:00). Pula sábado/domingo. */
export function proximoDiaUtilSP(now = new Date()): Date {
  const { y, mo, da } = spYMD(now);
  let cursor = new Date(Date.UTC(y, mo - 1, da, 12)); // ~09h SP do dia atual
  for (let i = 0; i < 7; i++) {
    cursor = new Date(cursor.getTime() + 86_400_000); // +1 dia
    const wd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())).getUTCDay();
    if (wd !== 0 && wd !== 6) break; // 0=domingo, 6=sábado
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}T09:00:00-03:00`);
}
