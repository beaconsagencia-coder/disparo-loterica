// =====================================================================
// Janela de disparo permitida (horário comercial), fuso de São Paulo.
// Vale para mensagens proativas (prospecção/cadência e follow-ups).
// Respostas a quem escreveu para nós NÃO usam esta janela.
// =====================================================================
export const DISPARO_INICIO_H = 7;  // começa a enviar às 07:00
export const DISPARO_FIM_H = 21;    // para de enviar às 21:00 (não envia 21h em diante)

/** Hora (0–23) no fuso de São Paulo. */
export function horaSP(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo",
    }).format(now),
  );
}

/** True se agora está dentro da janela de disparo (07h–21h, horário de Brasília). */
export function dentroDaJanela(now = new Date()): boolean {
  const h = horaSP(now);
  return h >= DISPARO_INICIO_H && h < DISPARO_FIM_H;
}
