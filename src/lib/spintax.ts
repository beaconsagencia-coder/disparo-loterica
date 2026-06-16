// Versão browser do spintax — usada para PRÉVIA ao escrever o template.
// (O envio real renderiza no servidor, em _shared/spintax.ts.)
function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

export function spin(template: string): string {
  const re = /\{([^{}]*)\}/;
  let out = template;
  let guard = 0;
  while (re.test(out) && guard < 1000) {
    out = out.replace(re, (_m, opts: string) => pick(opts.split("|")));
    guard++;
  }
  return out;
}

export function saudacao(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function previewMessage(template: string, nome = "João", empresa = "Lotérica Sorte"): string {
  const first = nome.trim().split(/\s+/)[0] ?? "";
  const replaced = template
    .replace(/\{\{\s*Saudacao\s*\}\}/gi, saudacao())
    .replace(/\{\{\s*Nome\s*\}\}/gi, first)
    .replace(/\{\{\s*Empresa\s*\}\}/gi, empresa);
  return spin(replaced).replace(/\s{2,}/g, " ").trim();
}
