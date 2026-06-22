// =====================================================================
// Cliente fino para a Evolution API
// Docs: https://doc.evolution-api.com
// =====================================================================

const BASE = Deno.env.get("EVOLUTION_API_URL")!;
const KEY = Deno.env.get("EVOLUTION_API_KEY")!;

function headers() {
  return { "Content-Type": "application/json", apikey: KEY };
}

/**
 * Envia texto simples por uma instância. Lança em caso de erro HTTP.
 * `delayMs` faz a Evolution exibir "digitando…" por esse tempo antes de enviar
 * (efeito humano). `presence: composing` reforça o indicador de digitação.
 */
export async function sendText(
  instance: string,
  numero: string,
  text: string,
  delayMs = 0,
): Promise<{ messageId?: string }> {
  const res = await fetch(`${BASE}/message/sendText/${instance}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      number: numero,
      text,
      ...(delayMs > 0 ? { delay: delayMs, presence: "composing" } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Evolution sendText ${res.status}: ${detail}`);
  }
  const data = await res.json().catch(() => ({}));
  return { messageId: data?.key?.id ?? data?.messageId };
}

/** Envia imagem/vídeo/documento por URL. Lança em erro HTTP. */
export async function sendMedia(
  instance: string,
  numero: string,
  opts: { url: string; mediatype: "image" | "video" | "document"; mimetype?: string; fileName?: string; caption?: string },
): Promise<{ messageId?: string }> {
  const res = await fetch(`${BASE}/message/sendMedia/${instance}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      number: numero,
      mediatype: opts.mediatype,
      media: opts.url,
      ...(opts.mimetype ? { mimetype: opts.mimetype } : {}),
      ...(opts.fileName ? { fileName: opts.fileName } : {}),
      ...(opts.caption ? { caption: opts.caption } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Evolution sendMedia ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json().catch(() => ({}));
  return { messageId: data?.key?.id ?? data?.messageId };
}

/** Envia áudio como nota de voz (PTT) por URL. */
export async function sendWhatsAppAudio(
  instance: string,
  numero: string,
  url: string,
): Promise<{ messageId?: string }> {
  const res = await fetch(`${BASE}/message/sendWhatsAppAudio/${instance}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ number: numero, audio: url }),
  });
  if (!res.ok) throw new Error(`Evolution sendWhatsAppAudio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json().catch(() => ({}));
  return { messageId: data?.key?.id ?? data?.messageId };
}

/**
 * Baixa o conteúdo de uma mensagem de mídia (ex: áudio) em base64.
 * Recebe o objeto bruto da mensagem vindo do webhook (com `key`).
 * Retorna { base64, mimetype } ou null se falhar.
 */
export async function getMediaBase64(
  instance: string,
  // deno-lint-ignore no-explicit-any
  message: any,
): Promise<{ base64: string; mimetype: string } | null> {
  const url = `${BASE}/chat/getBase64FromMediaMessage/${instance}`;
  // Versões diferentes da Evolution aceitam o objeto inteiro ou só { key }.
  const bodies = [
    { message, convertToMp4: false },
    { message: { key: message?.key }, convertToMp4: false },
  ];
  for (const body of bodies) {
    try {
      const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
      const raw = await res.text();
      if (!res.ok) {
        console.error(`[evolution] getBase64 ${res.status}: ${raw.slice(0, 160)}`);
        continue;
      }
      let data: any = raw;
      try { data = JSON.parse(raw); } catch { /* pode ser base64 cru */ }
      let base64: string | null =
        (typeof data === "string" ? data : null) ??
        data?.base64 ?? data?.media ?? data?.buffer ?? null;
      if (!base64) { console.error("[evolution] getBase64 sem campo base64:", JSON.stringify(data).slice(0, 160)); continue; }
      // Remove prefixo data URI se vier "data:audio/ogg;base64,...."
      const m = /^data:([^;]+);base64,(.*)$/s.exec(base64);
      let mimetype = data?.mimetype ?? data?.mimeType ?? message?.message?.audioMessage?.mimetype ?? "audio/ogg";
      if (m) { mimetype = m[1]; base64 = m[2]; }
      return { base64, mimetype: String(mimetype).split(";")[0] };
    } catch (e) {
      console.error("[evolution] getBase64 erro:", e instanceof Error ? e.message : e);
    }
  }
  return null;
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

/**
 * URL do webhook desta aplicação, com o segredo embutido (?token=...) quando
 * EVOLUTION_WEBHOOK_SECRET estiver definido. O evolution-webhook valida esse
 * token para recusar chamadas forjadas. Sem o segredo, a URL fica "aberta"
 * (comportamento antigo) — defina o segredo e re-sincronize os webhooks.
 */
export function evolutionWebhookUrl(): string {
  const base = Deno.env.get("SUPABASE_URL")!;
  const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";
  const suffix = secret ? `?token=${encodeURIComponent(secret)}` : "";
  return `${base}/functions/v1/evolution-webhook${suffix}`;
}

/** (Re)registra o webhook (com token) numa instância já existente na Evolution. */
export async function setWebhook(instance: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/webhook/set/${instance}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: evolutionWebhookUrl(),
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
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
