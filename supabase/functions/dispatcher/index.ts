// =====================================================================
// dispatcher · acionado pelo Supabase Cron (a cada 1 min)
// ---------------------------------------------------------------------
// Regra de Ouro: cada instância (chip) dispara no MÁXIMO 1 mensagem a
// cada 30–45 minutos. A cada execução, percorremos as instâncias
// ELEGÍVEIS (conectadas e com next_allowed_send_at vencido), em ordem
// round-robin (a menos recentemente usada primeiro), e cada uma envia
// UMA mensagem da fila. 3 chips elegíveis => 3 mensagens por janela.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { renderMessage, nextSendDelayMs } from "../_shared/spintax.ts";
import { sendText, hasWhatsApp } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CRON_SECRET = Deno.env.get("DISPATCHER_CRON_SECRET")!;
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  // Autenticação simples do cron (header compartilhado)
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(now); // YYYY-MM-DD

  // 1) Instâncias elegíveis: conectadas, ativas, janela vencida.
  //    Ordena por last_message_sent_at asc (nulls first) = round-robin.
  const { data: instances, error: instErr } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("status", "conectado")
    .eq("active", true)
    .or(`next_allowed_send_at.is.null,next_allowed_send_at.lte.${now.toISOString()}`)
    .order("last_message_sent_at", { ascending: true, nullsFirst: true });

  if (instErr) return json({ error: instErr.message }, 500);
  if (!instances?.length) return json({ ok: true, sent: 0, reason: "no eligible instances" });

  const results: Array<Record<string, unknown>> = [];

  for (const inst of instances) {
    // 1b) Teto diário anti-ban: pula chip que já atingiu o limite hoje.
    //     (count zera quando daily_count_date != hoje, no fuso de SP)
    const usedToday = inst.daily_count_date === today ? inst.daily_count : 0;
    if (usedToday >= inst.daily_limit) {
      results.push({ instance: inst.nome, skipped: "teto diário", used: usedToday, limit: inst.daily_limit });
      continue;
    }

    // 2) Reivindica atomicamente a próxima mensagem pendente desse usuário.
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "claim_next_message",
      { p_user_id: inst.user_id, p_instance_id: inst.id },
    );

    if (claimErr) {
      results.push({ instance: inst.nome, error: claimErr.message });
      continue;
    }
    if (!claimed) continue; // nada na fila para esse usuário

    const queue = claimed as Record<string, any>;

    // 3) Carrega o lead para render + número.
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, empresa, telefone")
      .eq("id", queue.lead_id)
      .single();

    if (!lead) {
      await supabase.from("message_queue")
        .update({ status: "falha", last_error: "lead não encontrado" })
        .eq("id", queue.id);
      continue;
    }

    try {
      // 3a) (Opcional) confere se o número tem WhatsApp.
      const exists = await hasWhatsApp(inst.evolution_instance, lead.telefone);
      if (exists === false) {
        await supabase.from("message_queue")
          .update({ status: "falha", last_error: "sem WhatsApp" })
          .eq("id", queue.id);
        await supabase.from("leads")
          .update({ status: "sem_whatsapp" })
          .eq("id", lead.id);
        results.push({ instance: inst.nome, lead: lead.telefone, skipped: "sem_whatsapp" });
        // Mesmo "pulando", consumimos a janela do chip para não martelar.
        await consumeWindow(inst.id, now);
        continue;
      }

      // 4) Render (spintax + saudação + placeholders) e envio.
      const text = renderMessage(queue.spintax_template, {
        nome: lead.nome,
        empresa: lead.empresa ?? undefined,
        now,
      });
      const { messageId } = await sendText(inst.evolution_instance, lead.telefone, text);

      // 5) Marca enviado + cria/atualiza conversa e histórico.
      await supabase.from("message_queue")
        .update({ status: "enviado", rendered_message: text, sent_at: now.toISOString() })
        .eq("id", queue.id);

      await supabase.from("leads")
        .update({ status: "aguardando_resposta" })
        .eq("id", lead.id);

      const conv = await upsertConversation(inst.user_id, lead.id, inst.id);
      if (conv) {
        await supabase.from("messages").insert({
          user_id: inst.user_id,
          conversation_id: conv,
          instance_id: inst.id,
          direction: "outbound",
          body: text,
          evolution_message_id: messageId ?? null,
          status: "sent",
        });
      }

      // 6) Consome a janela do chip (next_allowed_send_at = now + 30..45min).
      await consumeWindow(inst.id, now, today, inst);

      results.push({ instance: inst.nome, lead: lead.telefone, sent: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const fail = queue.attempts >= MAX_ATTEMPTS;
      await supabase.from("message_queue")
        .update({
          status: fail ? "falha" : "pendente",
          last_error: msg,
          // pequeno backoff antes da próxima tentativa
          scheduled_for: fail ? queue.scheduled_for : new Date(now.getTime() + 5 * 60_000).toISOString(),
        })
        .eq("id", queue.id);
      results.push({ instance: inst.nome, lead: lead.telefone, error: msg, retry: !fail });
    }
  }

  const sent = results.filter((r) => r.sent).length;
  return json({ ok: true, sent, results });
});

// ---------------------------------------------------------------------
async function consumeWindow(
  instanceId: string,
  now: Date,
  today?: string,
  inst?: Record<string, any>,
) {
  const patch: Record<string, unknown> = {
    last_message_sent_at: now.toISOString(),
    next_allowed_send_at: new Date(now.getTime() + nextSendDelayMs()).toISOString(),
  };
  if (today && inst) {
    const sameDay = inst.daily_count_date === today;
    patch.daily_count = (sameDay ? inst.daily_count : 0) + 1;
    patch.daily_count_date = today;
  }
  await supabase.from("whatsapp_instances").update(patch).eq("id", instanceId);
}

async function upsertConversation(
  userId: string,
  leadId: string,
  instanceId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing) {
    await supabase.from("conversations")
      .update({ instance_id: instanceId })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created } = await supabase
    .from("conversations")
    .insert({ user_id: userId, lead_id: leadId, instance_id: instanceId })
    .select("id")
    .single();
  return created?.id ?? null;
}
