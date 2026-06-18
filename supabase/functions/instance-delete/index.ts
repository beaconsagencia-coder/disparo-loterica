// =====================================================================
// instance-delete · remove um chip da Evolution API e do banco
// ---------------------------------------------------------------------
// O frontend chama com { id }. Verificamos a posse via RLS (user client),
// desconectamos/excluímos a instância na Evolution (best effort) e
// apagamos a linha em whatsapp_instances. FKs em message_queue/
// conversations/messages são "on delete set null" — nada quebra.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";

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

  // 1) Carrega a instância (RLS garante que é do próprio usuário).
  const { data: inst } = await userClient
    .from("whatsapp_instances").select("evolution_instance").eq("id", id).maybeSingle();
  if (!inst) return json({ error: "instância não encontrada" }, 404);

  // 2) Desconecta e exclui na Evolution (best effort — não bloqueia a remoção local).
  const evoHeaders = { apikey: EVO_KEY };
  try {
    await fetch(`${EVO_URL}/instance/logout/${inst.evolution_instance}`, { method: "DELETE", headers: evoHeaders });
  } catch (_) { /* já desconectado */ }
  try {
    await fetch(`${EVO_URL}/instance/delete/${inst.evolution_instance}`, { method: "DELETE", headers: evoHeaders });
  } catch (_) { /* já removido na Evolution */ }

  // 3) Remove a linha local.
  const { error } = await userClient.from("whatsapp_instances").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});
