// =====================================================================
// webhook-sync · re-registra o webhook (com token) nos chips existentes
// ---------------------------------------------------------------------
// Depois de definir EVOLUTION_WEBHOOK_SECRET, os chips criados ANTES ainda
// apontam para a URL sem token e passariam a receber 401. O usuário clica
// "Re-sincronizar webhooks" na aba Instâncias e esta função atualiza a URL
// (com ?token=...) em todas as instâncias da própria conta.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";
import { setWebhook } from "../_shared/evolution.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Autentica como usuário (RLS garante que só vê os próprios chips).
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  const { data: instances } = await userClient
    .from("whatsapp_instances").select("evolution_instance");

  let atualizados = 0, falhas = 0;
  for (const i of instances ?? []) {
    if (await setWebhook(i.evolution_instance)) atualizados++;
    else falhas++;
  }

  return json({ ok: true, atualizados, falhas });
});
