// =====================================================================
// ai-followup · acionado pelo Supabase Cron (a cada 5 min)
// ---------------------------------------------------------------------
// Dá andamento autônomo às conversas: se o BOT mandou a última mensagem e
// o cliente ficou em silêncio por X minutos (config), a IA envia um
// follow-up para retomar o fluxo — respeitando um teto de follow-ups.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { runSdr } from "../_shared/sdr.ts";
import { dentroDaJanela } from "../_shared/janela.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const CRON_SECRET = Deno.env.get("DISPATCHER_CRON_SECRET")!;
const SKIP_STATUS = ["reuniao_agendada", "ganho", "perdido", "sem_whatsapp"];

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  // Follow-up proativo só dentro da janela de disparo (07h-21h, Brasília).
  if (!dentroDaJanela()) {
    return json({ ok: true, nudged: 0, reason: "fora da janela de disparo (07h-21h)" });
  }

  // Configs de SDR ativas (1 por usuário)
  const { data: configs } = await supabase
    .from("ai_config").select("user_id, ativo, followup_inatividade_min, followup_max")
    .eq("ativo", true);
  if (!configs?.length) return json({ ok: true, nudged: 0, reason: "nenhum SDR ativo" });

  let nudged = 0;
  for (const cfg of configs) {
    const inatividade = Number(cfg.followup_inatividade_min ?? 30);
    const followupMax = Number(cfg.followup_max ?? 2);
    if (followupMax <= 0) continue;
    const cutoff = new Date(Date.now() - inatividade * 60_000).toISOString();

    // Conversas onde o BOT está esperando: última msg foi nossa (outbound),
    // silêncio passou do limite e ainda não estourou o teto de follow-ups.
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, lead_id, instance_id, last_message_at, leads(telefone, status), whatsapp_instances(evolution_instance)")
      .eq("user_id", cfg.user_id)
      .eq("ai_enabled", true)
      .eq("last_direction", "outbound")
      .lt("followup_count", followupMax)
      .lt("last_message_at", cutoff)
      .order("last_message_at", { ascending: true })
      .limit(20);

    for (const c of convs ?? []) {
      const lead = (c as any).leads;
      const inst = (c as any).whatsapp_instances;
      if (!lead?.telefone || !inst?.evolution_instance) continue;
      if (SKIP_STATUS.includes(lead.status)) continue;

      await runSdr({
        supabase,
        userId: cfg.user_id,
        conversationId: c.id,
        leadId: c.lead_id,
        instanceId: c.instance_id,
        evolutionInstance: inst.evolution_instance,
        numero: lead.telefone,
        triggerAt: c.last_message_at,
        mode: "followup",
        silencioMin: inatividade,
      }).catch((e) => console.error("followup runSdr erro:", e instanceof Error ? e.message : e));
      nudged++;
    }
  }

  return json({ ok: true, nudged });
});
