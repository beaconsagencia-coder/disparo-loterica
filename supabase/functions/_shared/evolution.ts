// =====================================================================
// Cliente fino para a Evolution API
// Docs: https://doc.evolution-api.com
// =====================================================================

const BASE = Deno.env.get("EVOLUTION_API_URL")!;
const KEY = Deno.env.get("EVOLUTION_API_KEY")!;

function headers() {
  return { "Content-Type": "application/json", apikey: KEY };
}

/** Envia texto simples por uma instância. Lança em caso de erro HTTP. */
export async function sendText(
  instance: string,
  numero: string,
  text: string,
): Promise<{ messageId?: string }> {
  const res = await fetch(`${BASE}/message/sendText/${instance}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      number: numero,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Evolution sendText ${res.status}: ${detail}`);
  }
  const data = await res.json().catch(() => ({}));
  return { messageId: data?.key?.id ?? data?.messageId };
}

/** Verifica se um número possui WhatsApp. Retorna true/false (ou null se indisponível). */
export async function hasWhatsApp(
  instance: string,
  numero: string,
): Promise<boolean | null> {
  try {
    const res = await fetch(`${BASE}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ numbers: [numero] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : data?.[0];
    return entry?.exists ?? null;
  } catch {
    return null;
  }
}

/** Gera/recupera o QR Code de conexão de uma instância. */
export async function connectInstance(instance: string): Promise<unknown> {
  const res = await fetch(`${BASE}/instance/connect/${instance}`, {
    method: "GET",
    headers: headers(),
  });
  return res.json();
}
