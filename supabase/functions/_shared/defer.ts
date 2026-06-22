// =====================================================================
// Detecta quando o cliente PEDE PARA RETORNAR DEPOIS (semana corrida,
// imprevisível, "te retorno pra agendar"…). Nesse caso o bot não cutuca
// em 30 min: espera ~2 dias e retoma em tom compreensivo.
// =====================================================================

// Texto já normalizado (minúsculo, sem acento).
const FRASES: RegExp[] = [
  /\bte (retorno|dou um retorno|chamo|aviso|falo|procuro)\b/,
  /\b(retorno|volto a falar|falo com voce|entro em contato) (depois|mais (pra|para) frente|quando|assim que)/,
  /semana (ta|esta|anda|segue) (corrida|imprevisivel|complicada|apertada|tumultuada|cheia|punk)/,
  /(ta|esta|anda) (meio )?(corrid[oa]|imprevisivel|complicad[oa]|apertad[oa])/,
  /\bmais (pra|para) frente\b/,
  /quando (acalmar|der|sobrar (um )?tempo|tiver (um )?tempo|as coisas (acalmar|melhorar))/,
  /agora (nao da|ta dificil|nao consigo|nao tenho como)( pra| para)? (marcar|agendar|ver isso)/,
  /me organizo e te (falo|chamo|retorno|aviso)/,
  /deixa eu (ver|olhar|conferir) (minha |a )?agenda/,
  /\bdepois (eu )?(vejo|te falo|marco|agendo|retorno|te chamo|confirmo)\b/,
  /\bqualquer (coisa|hora) (eu )?(te )?(chamo|falo|aviso|retorno)\b/,
];

/** True se a mensagem é um pedido de "retorno depois / agora não dá". */
export function isDeferral(raw: string): boolean {
  const t = (raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return false;
  return FRASES.some((re) => re.test(t));
}

/** Daqui a N dias, no mesmo horário (timestamp ISO). */
export function emDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}
