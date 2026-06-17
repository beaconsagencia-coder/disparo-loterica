// =====================================================================
// meeting-reminder · acionado pelo Supabase Cron (a cada 1 min)
// ---------------------------------------------------------------------
// Envia o link da reunião ~15 min antes do horário, pelo mesmo chip da
// conversa, e registra no histórico. Marca reminder_sent para não repetir.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { sendText } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const CRON_SECRET = Deno.env.get("DISPATCHER_CRON_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const now = Date.now();
  const janelaFim = new Date(now + 15 * 60_000).toISOString(); // próximos 15 min

  // Reuniões agendadas que começam dentro dos próximos 15 min e ainda não avisadas.
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, lead_id, conversation_id, scheduled_for, quando_texto, meet_link, user_id, leads(nome, telefone), conversations(instance_id, whatsapp_instances(evolution_instance))")
    .eq("status", "agendada")
    .eq("reminder_sent", false)
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", janelaFim)
    .gte("scheduled_for", new Date(now - 60_000).toISOString()); // ainda não começou (margem 1 min)

  if (!meetings?.length) return json({ ok: true, sent: 0 });

  let sent = 0;
  for (const m of meetings) {
    const lead = (m as any).leads;
    const inst = (m as any).conversations?.whatsapp_instances;
    const instanceId = (m as any).conversations?.instance_id;
    const evolutionInstance = inst?.evolution_instance;
    if (!lead?.telefone || !evolutionInstance) {
      await supabase.from("meetings").update({ reminder_sent: true }).eq("id", m.id);
      continue;
    }

    // Link: o da reunião ou o link fixo das configurações.
    let link = m.meet_link as string | null;
    if (!link) {
      const { data: ag } = await supabase.from("agenda_settings").select("meet_link").eq("user_id", m.user_id).maybeSingle();
      link = ag?.meet_link || null;
    }

    const nome = (lead.nome && !/^\d+$/.test(lead.nome)) ? lead.nome.split(/\s+/)[0] : "";
    const texto = link
      ? `Oi${nome ? ` ${nome}` : ""}! Daqui a pouco temos nossa reunião 🙌\nSegue o link da chamada: ${link}`
      : `Oi${nome ? ` ${nome}` : ""}! Daqui a pouco temos nossa reunião 🙌 Já já te mando o link por aqui.`;

    try {
      const { messageId } = await sendText(evolutionInstance, lead.telefone, texto);
      await supabase.from("meetings").update({ reminder_sent: true }).eq("id", m.id);
      if (m.conversation_id) {
        await supabase.from("messages").insert({
          user_id: m.user_id, conversation_id: m.conversation_id, instance_id: instanceId,
          direction: "outbound", body: texto, evolution_message_id: messageId ?? null, status: "sent",
        });
      }
      sent++;
    } catch (e) {
      console.error("meeting-reminder envio falhou:", e instanceof Error ? e.message : e);
    }
  }

  return json({ ok: true, sent });
});
