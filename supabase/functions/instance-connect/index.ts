// =====================================================================
// instance-connect · cria/conecta uma instância na Evolution e devolve o QR
// ---------------------------------------------------------------------
// Fluxo: o frontend chama com { nome }. Criamos a instância na Evolution
// (se ainda não existir), registramos em whatsapp_instances e retornamos
// o QR Code (base64) para o usuário escanear. O status real "conectado"
// é confirmado pelo webhook de connection.update (ver evolution-webhook
// ou um endpoint dedicado) ou por polling de status.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";
import { evolutionWebhookUrl } from "../_shared/evolution.ts";

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  const { nome } = await req.json().catch(() => ({}));
  if (!nome) return json({ error: "nome é obrigatório" }, 400);

  // Nome único da instância na Evolution (prefixo por usuário)
  const evolutionInstance = `u${auth.user.id.slice(0, 8)}-${slug(nome)}`;

  // 1) Cria a instância na Evolution API (idempotente: ignora se já existe)
  const webhookUrl = evolutionWebhookUrl(); // inclui ?token=<segredo> quando configurado
  const createRes = await fetch(`${EVO_URL}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({
      instanceName: evolutionInstance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    }),
  });
  const createData = await createRes.json().catch(() => ({}));

  // 2) Registra/atualiza em whatsapp_instances
  await userClient.from("whatsapp_instances").upsert(
    {
      user_id: auth.user.id,
      nome,
      evolution_instance: evolutionInstance,
      status: "conectando",
    },
    { onConflict: "user_id,evolution_instance" },
  );

  // 3) QR Code: vem na criação ou via /instance/connect
  let qr = createData?.qrcode?.base64 ?? createData?.base64;
  if (!qr) {
    const conn = await fetch(`${EVO_URL}/instance/connect/${evolutionInstance}`, {
      headers: { apikey: EVO_KEY },
    }).then((r) => r.json()).catch(() => ({}));
    qr = conn?.base64 ?? conn?.qrcode?.base64;
  }

  return json({ ok: true, evolution_instance: evolutionInstance, qrcode: qr ?? null });
});

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
