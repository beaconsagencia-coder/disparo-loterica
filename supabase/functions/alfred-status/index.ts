// =====================================================================
// alfred-status · sincroniza o status do chip do Alfred com a Evolution
// ---------------------------------------------------------------------
// Não depende do webhook connection.update (que pode se perder no scan):
// consulta o estado REAL na Evolution (/instance/connectionState) e grava
// em alfred_configs. O front chama isso ao conectar e em polling.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const mapStatus = (state: string) =>
  state === "open" ? "conectado" : state === "connecting" ? "conectando" : "desconectado";

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
    .from("alfred_configs").select("evolution_instance").eq("user_id", auth.user.id).maybeSingle();
  const instance = cfg?.evolution_instance;
  if (!instance) return json({ ok: true, status: "desconectado", reason: "sem instância" });

  // Estado da conexão direto na Evolution.
  const res = await fetch(`${EVO_URL}/instance/connectionState/${instance}`, { headers: { apikey: EVO_KEY } });
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  const state: string = data?.instance?.state ?? data?.state ?? "";
  const status = mapStatus(state);

  // Quando conectado, tenta capturar o número do dono (varia por versão da Evolution).
  const patch: Record<string, unknown> = { connection_status: status };
  if (status === "conectado") {
    try {
      const fi = await fetch(`${EVO_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`, { headers: { apikey: EVO_KEY } })
        .then((r) => r.json()).catch(() => null);
      // deno-lint-ignore no-explicit-any
      const item: any = Array.isArray(fi) ? fi[0] : fi;
      const owner: string =
        item?.ownerJid ?? item?.owner ?? item?.instance?.owner ?? item?.instance?.ownerJid ?? "";
      const numero = owner ? owner.split("@")[0].split(":")[0].replace(/\D/g, "") : "";
      if (numero) patch.numero = numero;
    } catch { /* número é opcional */ }
  }

  await userClient.from("alfred_configs").update(patch).eq("user_id", auth.user.id);
  return json({ ok: true, status });
});
