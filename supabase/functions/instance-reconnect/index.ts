// =====================================================================
// instance-reconnect · reconecta o WhatsApp NA MESMA instância
// ---------------------------------------------------------------------
// Quando um chip cai, recriar geraria um id/instância novos e quebraria
// a atribuição nos Relatórios. Aqui preservamos o MESMO evolution_instance
// e o MESMO id da linha — só pedimos um QR Code novo. O status real volta
// a "conectado" pelo webhook de connection.update após a leitura.
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

  const { id } = await req.json().catch(() => ({}));
  if (!id) return json({ error: "id é obrigatório" }, 400);

  // Carrega a instância DO PRÓPRIO usuário (RLS garante posse). Mantém o
  // mesmo evolution_instance/id — a atribuição nos relatórios não muda.
  const { data: inst, error: loadErr } = await userClient
    .from("whatsapp_instances")
    .select("evolution_instance")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return json({ error: loadErr.message }, 500);
  if (!inst) return json({ error: "instância não encontrada" }, 404);

  const evolutionInstance = inst.evolution_instance as string;

  // 1) Tenta um QR novo conectando na instância existente.
  let qr = await fetchConnectQr(evolutionInstance);

  // 2) Se ela não existe mais na Evolution (ex.: removida de lá), recria com
  //    o MESMO nome — assim id/atribuição continuam — e conecta de novo.
  if (!qr) {
    const webhookUrl = evolutionWebhookUrl();
    await fetch(`${EVO_URL}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({
        instanceName: evolutionInstance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: { url: webhookUrl, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
      }),
    }).then((r) => r.json()).catch(() => ({}));
    qr = await fetchConnectQr(evolutionInstance);
  }

  // 3) Marca como "conectando" — o webhook confirma "conectado" na leitura.
  await userClient.from("whatsapp_instances").update({ status: "conectando" }).eq("id", id);

  return json({ ok: true, evolution_instance: evolutionInstance, qrcode: qr ?? null });
});

/** Pede o QR Code (base64) conectando numa instância já existente. */
async function fetchConnectQr(instance: string): Promise<string | null> {
  const conn = await fetch(`${EVO_URL}/instance/connect/${instance}`, {
    headers: { apikey: EVO_KEY },
  }).then((r) => r.json()).catch(() => ({}));
  return conn?.base64 ?? conn?.qrcode?.base64 ?? null;
}
