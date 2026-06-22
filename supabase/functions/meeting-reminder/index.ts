// =====================================================================
// meeting-reminder · acionado pelo Supabase Cron (a cada 1 min)
// ---------------------------------------------------------------------
// Dois avisos por reunião, para reduzir no-show:
//   1) CONFIRMAÇÃO antecipada: se a reunião é à TARDE, confirma de manhã
//      (09h, fuso SP); se é de MANHÃ, confirma 2h antes. (confirm_sent)
//   2) LEMBRETE com o link ~15 min antes do horário. (reminder_sent)
// Tudo pelo mesmo chip da conversa, registrado no histórico.
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

/** Partes de uma data no fuso de São Paulo. */
function spParts(iso: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { y: g("year"), mo: g("month"), da: g("day"), h: Number(g("hour")) };
}
const horaSP = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Quando a CONFIRMAÇÃO antecipada deve sair (ms epoch). */
function confirmAtMs(iso: string): number {
  const sp = spParts(iso);
  if (sp.h < 12) return new Date(iso).getTime() - 2 * 3_600_000; // manhã -> 2h antes
  return new Date(`${sp.y}-${sp.mo}-${sp.da}T09:00:00-03:00`).getTime(); // tarde -> 09h da manhã
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const now = Date.now();

  // Reuniões agendadas das próximas 24h que ainda têm algum aviso pendente.
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, lead_id, conversation_id, scheduled_for, quando_texto, meet_link, user_id, reminder_sent, confirm_sent, leads(nome, telefone), conversations(instance_id, whatsapp_instances(evolution_instance))")
    .eq("status", "agendada")
    .not("scheduled_for", "is", null)
    .gte("scheduled_for", new Date(now - 60_000).toISOString())
    .lte("scheduled_for", new Date(now + 24 * 3_600_000).toISOString())
    .or("reminder_sent.eq.false,confirm_sent.eq.false");

  if (!meetings?.length) return json({ ok: true, sent: 0 });

  let sent = 0;
  for (const m of meetings) {
    const lead = (m as any).leads;
    const inst = (m as any).conversations?.whatsapp_instances;
    const instanceId = (m as any).conversations?.instance_id;
    const evolutionInstance = inst?.evolution_instance;
    const schedMs = new Date(m.scheduled_for as string).getTime();
    const nome = (lead?.nome && !/^\d+$/.test(lead.nome)) ? lead.nome.split(/\s+/)[0] : "";

    // Decide qual aviso enviar AGORA (lembrete tem prioridade quando está perto).
    let tipo: "lembrete" | "confirmacao" | null = null;
    if (!m.reminder_sent && schedMs - now <= 15 * 60_000 && schedMs - now >= -60_000) {
      tipo = "lembrete";
    } else if (!m.confirm_sent && now >= confirmAtMs(m.scheduled_for as string) && now <= schedMs - 20 * 60_000) {
      tipo = "confirmacao";
    }
    if (!tipo) continue;

    const flag = tipo === "lembrete" ? { reminder_sent: true } : { confirm_sent: true };

    // Sem chip/telefone: marca a flag para não reprocessar e segue.
    if (!lead?.telefone || !evolutionInstance) {
      await supabase.from("meetings").update(flag).eq("id", m.id);
      continue;
    }

    let texto: string;
    if (tipo === "confirmacao") {
      texto = `Oi${nome ? ` ${nome}` : ""}! Passando pra confirmar nossa reunião de hoje às ${horaSP(m.scheduled_for as string)}. Posso contar com você? 🙌`;
    } else {
      // Link: o da reunião ou o link fixo das configurações.
      let link = m.meet_link as string | null;
      if (!link) {
        const { data: ag } = await supabase.from("agenda_settings").select("meet_link").eq("user_id", m.user_id).maybeSingle();
        link = ag?.meet_link || null;
      }
      texto = link
        ? `Oi${nome ? ` ${nome}` : ""}! Daqui a pouco temos nossa reunião 🙌\nSegue o link da chamada: ${link}`
        : `Oi${nome ? ` ${nome}` : ""}! Daqui a pouco temos nossa reunião 🙌 Já já te mando o link por aqui.`;
    }

    try {
      const { messageId } = await sendText(evolutionInstance, lead.telefone, texto);
      await supabase.from("meetings").update(flag).eq("id", m.id);
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
