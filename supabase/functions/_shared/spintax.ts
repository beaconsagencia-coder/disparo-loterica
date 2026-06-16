// =====================================================================
// Spintax + saudação dinâmica
// Suporta aninhamento: "{Oi|Olá|Opa} {{Nome}}, {tudo bem|como vai}?"
// e placeholders: {{Nome}}, {{Empresa}}, {{Saudacao}}
// =====================================================================

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Resolve o {a|b|c} mais interno repetidamente até não sobrar nenhum. */
export function spin(template: string): string {
  const re = /\{([^{}]*)\}/; // grupo sem chaves aninhadas = o mais interno
  let out = template;
  let guard = 0;
  while (re.test(out) && guard < 1000) {
    out = out.replace(re, (_m, options: string) => pick(options.split("|")));
    guard++;
  }
  return out;
}

/** Saudação baseada no horário de São Paulo. */
export function saudacao(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Pega só o primeiro nome, capitalizado. */
function firstName(nome: string): string {
  const n = (nome || "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}

export interface RenderVars {
  nome?: string;
  empresa?: string;
  now?: Date;
}

/** Substitui placeholders e depois aplica o spintax. */
export function renderMessage(template: string, vars: RenderVars = {}): string {
  const replaced = template
    .replace(/\{\{\s*Saudacao\s*\}\}/gi, saudacao(vars.now))
    .replace(/\{\{\s*Nome\s*\}\}/gi, firstName(vars.nome ?? ""))
    .replace(/\{\{\s*Empresa\s*\}\}/gi, vars.empresa ?? "");
  return spin(replaced).replace(/\s{2,}/g, " ").trim();
}

/** Intervalo anti-ban: 30 a 45 minutos em milissegundos. */
export function nextSendDelayMs(): number {
  const minMin = 30;
  const maxMin = 45;
  const minutes = minMin + Math.random() * (maxMin - minMin);
  return Math.round(minutes * 60_000);
}
