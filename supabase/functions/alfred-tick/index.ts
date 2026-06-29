// =====================================================================
// alfred-tick · cron (a cada 2 min): handoff humano + aprendizado do Alfred
// ---------------------------------------------------------------------
// Para cada grupo ativo: consolida o aprendizado e decide se o Alfred deve
// INTERVIR (cliente sem resposta há X min e equipe em silêncio há Y min).
// O webhook só registra as mensagens; quem responde é este cron.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { processarGrupoTick, acompanhamentoProativo, cobrancaProativa, type AlfredCfg, type BillingCfg } from "../_shared/alfred.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const CRON_SECRET = Deno.env.get("DISPATCHER_CRON_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);

  const { data: grupos } = await supabase
    .from("alfred_groups")
    .select("id, user_id, client_name, remote_jid, evolution_instance, last_learned_at, created_at, contrato_inicio, contract_id, fase_override, last_proactive_at")
    .eq("active", true);
  if (!grupos?.length) return json({ ok: true, processados: 0 });

  // Config (prompt/tempos/chip) e delays do SDR, em cache por usuário.
  const cfgCache = new Map<string, AlfredCfg>();
  async function cfgDe(userId: string): Promise<AlfredCfg> {
    if (cfgCache.has(userId)) return cfgCache.get(userId)!;
    const [{ data: a }, { data: sdr }] = await Promise.all([
      supabase.from("alfred_configs").select("system_prompt, base_conhecimento, operator_number, evolution_instance, handoff_ativo, team_cooldown_min, intervene_after_min, proactive_ativo, proactive_hora").eq("user_id", userId).maybeSingle(),
      supabase.from("ai_config").select("delay_min_seg, delay_max_seg").eq("user_id", userId).maybeSingle(),
    ]);
    const cfg: AlfredCfg = {
      system_prompt: a?.system_prompt ?? "",
      base_conhecimento: a?.base_conhecimento ?? null,
      operator_number: a?.operator_number ?? null,
      evolution_instance: a?.evolution_instance ?? null,
      handoff_ativo: a?.handoff_ativo ?? true,
      team_cooldown_min: Number(a?.team_cooldown_min ?? 5),
      intervene_after_min: Number(a?.intervene_after_min ?? 30),
      proactive_ativo: a?.proactive_ativo ?? true,
      proactive_hora: Number(a?.proactive_hora ?? 9),
      dmin: Number(sdr?.delay_min_seg ?? 3),
      dmax: Number(sdr?.delay_max_seg ?? 8),
    };
    cfgCache.set(userId, cfg);
    return cfg;
  }

  // Config de cobrança/PIX por usuário (para a cobrança no grupo via Alfred).
  const billingCache = new Map<string, BillingCfg>();
  async function billingDe(userId: string): Promise<BillingCfg> {
    if (billingCache.has(userId)) return billingCache.get(userId)!;
    const { data } = await supabase.from("billing_settings")
      .select("ativo, pix_key, pix_nome, pix_copia_cola, hora_envio, dias_antes").eq("user_id", userId).maybeSingle();
    const b: BillingCfg = {
      ativo: !!data?.ativo,
      pix_key: data?.pix_key ?? null,
      pix_nome: data?.pix_nome ?? null,
      pix_copia_cola: data?.pix_copia_cola ?? null,
      hora_envio: Number(data?.hora_envio ?? 8),
      dias_antes: Number(data?.dias_antes ?? 0),
    };
    billingCache.set(userId, b);
    return b;
  }

  const resultados: Record<string, number> = {};
  for (const g of grupos) {
    try {
      const cfg = await cfgDe(g.user_id);
      const r = await processarGrupoTick(supabase, g, cfg);
      resultados[r] = (resultados[r] ?? 0) + 1;
      const rp = await acompanhamentoProativo(supabase, g, cfg);
      if (rp === "proativo enviado") resultados[rp] = (resultados[rp] ?? 0) + 1;
      if (g.contract_id) {
        const rc = await cobrancaProativa(supabase, g, cfg, await billingDe(g.user_id));
        if (rc.startsWith("cobrança enviada")) resultados[rc] = (resultados[rc] ?? 0) + 1;
      }
    } catch (e) {
      console.error("[alfred-tick] erro no grupo", g.id, e instanceof Error ? e.message : e);
    }
  }

  return json({ ok: true, processados: grupos.length, resultados });
});
