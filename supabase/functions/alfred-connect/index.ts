// =====================================================================
// alfred-connect · cria/conecta o chip DEDICADO do Alfred e devolve o QR
// ---------------------------------------------------------------------
// Chip isolado dos disparos: a instância NÃO entra em whatsapp_instances
// (logo o dispatcher nunca a usa). O webhook dela aponta para alfred-webhook,
// então as mensagens dos grupos caem direto no cérebro do Alfred.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ALFRED_SECRET = Deno.env.get("ALFRED_WEBHOOK_SECRET") ?? "";

/** URL do alfred-webhook com o token embutido (quando o segredo está definido). */
function alfredWebhookUrl(): string {
  const suffix = ALFRED_SECRET ? `?token=${encodeURIComponent(ALFRED_SECRET)}` : "";
  return `${SUPABASE_URL}/functions/v1/alfred-webhook${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  // Uma única instância dedicada por usuário (nome estável → reconecta a mesma).
  const evolutionInstance = `alfred-${auth.user.id.slice(0, 8)}`;
  const webhookUrl = alfredWebhookUrl();

  // 1) Cria a instância na Evolution (idempotente: se já existe, seguimos pro connect).
  const createData = await fetch(`${EVO_URL}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({
      instanceName: evolutionInstance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: { url: webhookUrl, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
    }),
  }).then((r) => r.json()).catch(() => ({}));

  // 1b) Garante o webhook correto mesmo quando a instância já existia.
  await fetch(`${EVO_URL}/webhook/set/${evolutionInstance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] } }),
  }).catch(() => ({}));

  // 2) Registra a instância dedicada em alfred_configs (status: conectando).
  await userClient.from("alfred_configs").upsert(
    { user_id: auth.user.id, evolution_instance: evolutionInstance, connection_status: "conectando" },
    { onConflict: "user_id" },
  );

  // 3) QR Code: vem na criação ou via /instance/connect.
  // deno-lint-ignore no-explicit-any
  let qr = (createData as any)?.qrcode?.base64 ?? (createData as any)?.base64;
  if (!qr) {
    const conn = await fetch(`${EVO_URL}/instance/connect/${evolutionInstance}`, { headers: { apikey: EVO_KEY } })
      .then((r) => r.json()).catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    qr = (conn as any)?.base64 ?? (conn as any)?.qrcode?.base64;
  }

  return json({ ok: true, evolution_instance: evolutionInstance, qrcode: qr ?? null });
});
