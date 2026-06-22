// =====================================================================
// Detecta "aqui NÃO é lotérica / número errado / é farmácia" → encerrar.
// IMPORTANTE: NÃO encerra se a pessoa diz que vai REPASSAR ao responsável
// (mesmo que diga "não sou o dono") — isso é um lead vivo.
// =====================================================================

// Intenção de repassar/encaminhar ao responsável → mantém o contato.
const REPASSE =
  /(repass|encaminh|\bpass(o|ar|are)\b|\bav(iso|isar)\b|\bfal(o|ar|are)\b|\bmand(o|ar|are)\b|\benvi(o|ar)\b|deixa comigo|mostro|vou ver com|vou falar)/i;
const RESPONSAVEL = /(dono|propriet|respons|gerent|patr[aã]o|chefe|encarregad|administrad|titular|ele|ela)/i;

// Afirmações de que o local NÃO é lotérica (texto já sem acento, minúsculo).
const NAO_LOTERICA: RegExp[] = [
  /n[aã]o (e|eh) (uma |um |aqui )?(lot[eé]rica|loteria)/,
  /aqui n[aã]o (e|eh|tem|funciona)\s*(lot|loteria)/,
  /isso (aqui )?n[aã]o (e|eh) (lot|loteria)/,
  /n[uú]mero errado/,
  /(voce|vc|se) (enganou|equivocou|confundiu)/,
  /engano\b/,
  /n[aã]o (trabalho|trabalhamos|mexo|mexemos|lido|lidamos|trabalha) com (loteria|bol[aã]o|jogo|aposta)/,
  /(aqui (e|eh)|isso (e|eh)|somos|aqui (e|eh) uma|aqui funciona)( uma| um)? (farm[aá]cia|supermerc|mercad|a[cç]ougue|padaria|restaurante|posto|loja|drogaria)/,
  /n[aã]o (e|eh) (esse|o nosso|nosso) (o )?(ramo|segmento|neg[oó]cio|tipo)/,
  /nada a ver/,
];

/** True se a pessoa indicou que o local NÃO é lotérica (e não vai repassar). */
export function isNotLoteria(raw: string): boolean {
  const t = (raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return false;
  if (REPASSE.test(t) && RESPONSAVEL.test(t)) return false; // "vou repassar ao responsável" → mantém
  return NAO_LOTERICA.some((re) => re.test(t));
}
