// Normaliza um telefone brasileiro para o formato esperado pela Evolution
// (apenas dígitos, com DDI 55). Aceita máscaras variadas vindas do CSV.
export function normalizePhoneBR(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  // remove zeros à esquerda
  d = d.replace(/^0+/, "");
  // adiciona DDI 55 se faltar (assumindo número nacional com DDD)
  if (d.length === 10 || d.length === 11) d = "55" + d;
  // valida tamanho final (55 + DDD(2) + 8/9 dígitos)
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

export function maskPhoneBR(d: string): string {
  // 55 62 99999 8888  -> +55 (62) 99999-8888
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return d;
  return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
}
