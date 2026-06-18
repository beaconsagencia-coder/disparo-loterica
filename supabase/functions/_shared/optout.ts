// =====================================================================
// Detecção de opt-out ("pare", "sair", "não tenho interesse"...)
// Conservador de propósito: melhor deixar passar um caso duvidoso do que
// marcar como perdido quem só quer remarcar ("cancelar a reunião").
// =====================================================================

// Mensagens curtíssimas que SÃO só a palavra de recusa (ex.: "pare", "sair").
const EXATAS = new Set([
  "pare", "parar", "para", "sair", "sai", "stop",
  "remover", "cancelar", "descadastrar", "desinscrever", "bloquear",
]);

// Frases claras de recusa, em qualquer posição do texto.
const FRASES: RegExp[] = [
  /\bnao\s+(tenho|temos|ha)\s+interesse\b/,
  /\bsem\s+interesse\b/,
  /\bnao\s+(me\s+)?(mande|manda|mandem|mandar|envie|enviem|enviar|perturbe|perturbem|incomode)\b/,
  /\b(parar?|pare|pode\s+parar)\s+de\s+(mandar|enviar|me\s+mandar|encher)/,
  /\b(me\s+)?(tire|tira|retire|retira|remova|remove)\s+(meu\s+)?(numero|contato|da\s+lista|dessa\s+lista)/,
  /\bdescadastr/,
  /\bme\s+deixe?\s+em\s+paz\b/,
  /\bnao\s+perturbe?\b/,
  /\bnao\s+quero\s+(receber|mais|nada|contato|mensag)/,
  /\bvou\s+(te\s+)?(denunciar|bloquear)\b/,
  /\b(isso\s+e\s+|e\s+)?spam\b/,
  /\b(sair|me\s+tirar|me\s+remover)\s+d[ao]\s+(lista|disparo|cadastro)\b/,
  /\bnao\s+me\s+(ligue|liguem|chame|procure)\b/,
];

/** True se a mensagem indica que o cliente quer parar de receber contato. */
export function isOptOut(raw: string): boolean {
  // minúsculas + remove acentos (faixa de diacríticos combinantes U+0300–U+036F)
  const t = (raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return false;
  const exata = t.replace(/[\s.!?]+$/g, "");
  if (EXATAS.has(exata)) return true;
  return FRASES.some((re) => re.test(t));
}
