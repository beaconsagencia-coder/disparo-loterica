// =====================================================================
// alfred-grupos · lista os grupos de WhatsApp do chip dedicado do Alfred
// ---------------------------------------------------------------------
// Evita o usuário ter que descobrir o remoteJid na mão: consulta a Evolution
// (/group/fetchAllGroups) e devolve { id (remoteJid), subject (nome) } dos
// grupos em que o número do Alfred está. Use no formulário "Novo grupo".
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  const { data: cfg } = await userClient
    .from("alfred_configs").select("evolution_instance, connection_status").eq("user_id", auth.user.id).maybeSingle();
  const instance = cfg?.evolution_instance;
  if (!instance) return json({ ok: true, grupos: [], reason: "Conecte o WhatsApp do Alfred primeiro." });

  const res = await fetch(`${EVO_URL}/group/fetchAllGroups/${instance}?getParticipants=false`, { headers: { apikey: EVO_KEY } });
  if (!res.ok) return json({ ok: false, grupos: [], error: `Evolution ${res.status}` }, 200);

  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => []);
  const arr: any[] = Array.isArray(data) ? data : (data?.groups ?? []);
  const grupos = arr
    .map((g) => ({ id: String(g?.id ?? g?.jid ?? ""), subject: String(g?.subject ?? g?.name ?? "") }))
    .filter((g) => g.id.endsWith("@g.us"))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return json({ ok: true, grupos });
});
