// =====================================================================
// alfred-bolao · proxy autenticado para a ponte do Bolão Gestor
// ---------------------------------------------------------------------
// O painel chama esta função (com a sessão do usuário) para listar as
// contas do Bolão Gestor e vincular ao grupo. O segredo da ponte fica
// SÓ aqui no servidor — nunca vai pro navegador.
//   action=accounts -> [{ id, nome }]
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const BRIDGE_URL = (Deno.env.get("BOLAO_BRIDGE_URL") ?? "").replace(/\/+$/, "");
const BRIDGE_SECRET = Deno.env.get("ALFRED_BRIDGE_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  if (!BRIDGE_URL || !BRIDGE_SECRET) {
    return json({ ok: false, accounts: [], reason: "Ponte do Bolão Gestor não configurada (BOLAO_BRIDGE_URL / ALFRED_BRIDGE_SECRET)." });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action ?? "accounts";
  if (action !== "accounts") return json({ error: "ação desconhecida" }, 400);

  try {
    const res = await fetch(`${BRIDGE_URL}?action=accounts`, { headers: { "x-bridge-secret": BRIDGE_SECRET } });
    if (!res.ok) return json({ ok: false, accounts: [], error: `bridge ${res.status}` }, 200);
    const data = await res.json();
    return json({ ok: true, accounts: data?.accounts ?? [] });
  } catch (e) {
    return json({ ok: false, accounts: [], error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
