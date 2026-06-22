// =====================================================================
// evolution-webhook · recebe eventos da Evolution API
// ---------------------------------------------------------------------
// Configure na Evolution (por instância ou global) o webhook apontando
// para esta URL, evento MESSAGES_UPSERT. Toda resposta de qualquer chip
// cai aqui e é roteada para o Inbox unificado (Omnichannel interno).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { runSdr, transcribeAudio, extractReferral, handleReferral } from "../_shared/sdr.ts";
import { getMediaBase64, sendText } from "../_shared/evolution.ts";
import { isOptOut } from "../_shared/optout.ts";
import { isAutoReply, proximoDiaUtilSP } from "../_shared/autoreply.ts";
import { detectMedia, uploadBase64 } from "../_shared/media.ts";
import { isNotLoteria } from "../_shared/notloteria.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Segredo do webhook: se definido, exigimos ?token=<segredo> (ou header apikey/
// x-webhook-secret) para recusar chamadas forjadas. Vazio = sem checagem
// (compatível com chips antigos até você rodar a re-sincronização).
const WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";

function autorizado(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true; // ainda não configurado
  const token =
    new URL(req.url).searchParams.get("token") ??
    req.headers.get("apikey") ??
    req.headers.get("x-webhook-secret") ??
    "";
  return token === WEBHOOK_SECRET;
}

// Normaliza JID da Evolution -> dígitos E.164 (ex: "5562999998888@s.whatsapp.net")
function normalizeNumber(remoteJid: string): string {
  return (remoteJid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function extractText(message: any): string {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    ""
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!autorizado(req)) return json({ error: "unauthorized" }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // A Evolution envia o nome da instância no corpo do evento.
  const evolutionInstance: string = payload?.instance ?? payload?.instanceName;
  const event: string = (payload?.event ?? "").toLowerCase();

  if (!evolutionInstance) return json({ ok: true, ignored: "sem instance" });

  // Resolve a instância -> descobrimos o user_id (tenant).
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("id, user_id")
    .eq("evolution_instance", evolutionInstance)
    .maybeSingle();

  if (!inst) return json({ ok: true, ignored: "instância desconhecida" });

  // ---- CONNECTION_UPDATE: confirma conexão/desconexão do chip ----
  if (event === "connection.update") {
    const state: string = payload?.data?.state ?? payload?.data?.connection ?? "";
    const status =
      state === "open" ? "conectado" : state === "connecting" ? "conectando" : "desconectado";

    const patch: Record<string, unknown> = { status };
    // Quando conecta, a Evolution costuma informar o JID do dono.
    if (status === "conectado") {
      const wuid: string | undefined =
        payload?.data?.wuid ?? payload?.data?.me?.id ?? payload?.sender;
      const numero = wuid ? wuid.split("@")[0].split(":")[0].replace(/\D/g, "") : null;
      if (numero) patch.numero = numero;
    }
    await supabase.from("whatsapp_instances").update(patch).eq("id", inst.id);
    return json({ ok: true, status });
  }

  // Daqui em diante: apenas mensagens recebidas.
  if (event && event !== "messages.upsert") {
    return json({ ok: true, ignored: event });
  }

  // O payload pode vir como objeto único ou lista.
  const items = Array.isArray(payload?.data) ? payload.data : [payload?.data];

  for (const item of items) {
    const key = item?.key ?? {};
    if (key.fromMe) continue; // só nos interessam mensagens recebidas

    // Ignora o que NÃO é conversa 1-a-1: grupos (@g.us), status/transmissão
    // (@broadcast) e canais/newsletter (@newsletter).
    const remoteJid: string = key.remoteJid ?? "";
    if (
      remoteJid.endsWith("@g.us") ||
      remoteJid.includes("@broadcast") ||
      remoteJid.endsWith("@newsletter")
    ) {
      continue;
    }

    const numero = normalizeNumber(remoteJid);
    if (!numero) continue;
    let text = extractText(item?.message);
    const evoId = key.id as string | undefined;
    const media = detectMedia(item?.message);

    // Mídia recebida (imagem/áudio/vídeo/documento): baixa da Evolution e sobe
    // ao Storage para aparecer no Inbox. Áudio sem legenda também é transcrito.
    let mediaUrl: string | null = null;
    if (media) {
      const dl = await getMediaBase64(evolutionInstance, item);
      if (dl) {
        // Prioriza o mimetype REAL da mensagem (imageMessage/documentMessage…);
        // o do download cai p/ "audio/ogg" por padrão e quebraria imagens/docs.
        const mime = media.mime || dl.mimetype;
        mediaUrl = await uploadBase64(supabase, dl.base64, mime, `${inst.user_id}/inbound`, media.name);
        if (media.kind === "audio" && !text) {
          try {
            const transcrito = await transcribeAudio(dl.base64, dl.mimetype || media.mime);
            if (transcrito) { text = transcrito; console.log("[webhook] áudio transcrito:", text.slice(0, 80)); }
          } catch (e) {
            console.error("[webhook] falha ao transcrever áudio:", e instanceof Error ? e.message : e);
          }
        }
      } else {
        console.error("[webhook] não consegui baixar a mídia da Evolution.");
      }
    }

    // Corpo a salvar: mídia/contato SEMPRE aparecem no chat, mesmo sem texto.
    const isContact = !!(item?.message?.contactMessage || item?.message?.contactsArrayMessage);
    const ROTULO: Record<string, string> = { image: "📷 [imagem]", audio: "🎤 [áudio]", video: "🎥 [vídeo]", document: "📄 [documento]" };
    const bodyToSave = text || (media ? ROTULO[media.kind] : isContact ? "📇 [contato compartilhado]" : "");

    // Match do lead pelo telefone (dentro do tenant).
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, status")
      .eq("user_id", inst.user_id)
      .eq("telefone", numero)
      .maybeSingle();

    // Se não conhecemos o lead, cria um "inbound" para não perder o contato.
    let leadId = lead?.id;
    if (!leadId) {
      const { data: novo } = await supabase
        .from("leads")
        .insert({
          user_id: inst.user_id,
          nome: item?.pushName ?? numero,
          telefone: numero,
          status: "em_negociacao",
          origem: "inbound",
        })
        .select("id")
        .single();
      leadId = novo?.id;
    } else if (!["reuniao_agendada", "ganho", "perdido"].includes(lead!.status)) {
      // Cliente respondeu → entra em negociação. MAS nunca rebaixa quem já tem
      // reunião marcada (senão o follow-up volta a cutucar durante/após a call),
      // nem mexe em ganho/perdido.
      await supabase.from("leads")
        .update({ status: "em_negociacao" })
        .eq("id", leadId);
    }
    if (!leadId) continue;

    // Cliente respondeu → interrompe os follow-ups de cadência ainda pendentes
    // (não insistir com quem já engajou). Disparos únicos não são afetados.
    await supabase.from("message_queue")
      .update({ status: "cancelado", last_error: "cliente respondeu" })
      .eq("lead_id", leadId)
      .not("cadence_id", "is", null)
      .in("status", ["pendente", "pausado"]);

    // Conversa unificada (1 por lead) — registra por qual chip entrou.
    const conv = await upsertConversation(inst.user_id, leadId, inst.id);
    if (!conv) continue;

    // Cliente respondeu: zera o contador de follow-ups e limpa eventual
    // período de silêncio (será re-setado abaixo se for um auto-reply).
    await supabase.from("conversations").update({ followup_count: 0, quiet_until: null }).eq("id", conv);

    const { data: inserted } = await supabase.from("messages").insert({
      user_id: inst.user_id,
      conversation_id: conv,
      instance_id: inst.id,
      direction: "inbound",
      body: bodyToSave,
      evolution_message_id: evoId ?? null,
      status: "delivered",
      media_url: mediaUrl,
      media_kind: media?.kind ?? null,
      media_mime: media?.mime ?? null,
      media_name: media?.name ?? null,
    }).select("id, created_at").maybeSingle(); // unique (instance_id, evolution_message_id) deduplica reentregas

    // Opt-out: cliente pediu para parar ("pare", "sair", "sem interesse"...).
    // Encerra com respeito: marca perdido, limpa a fila, desliga a IA e manda
    // UM "ok" educado. Protege os chips de denúncia/bloqueio.
    if (inserted && text && isOptOut(text)) {
      console.log("[webhook] opt-out detectado de", numero);
      await supabase.from("leads").update({ status: "perdido" }).eq("id", leadId);
      await supabase.from("message_queue")
        .update({ status: "cancelado", last_error: "opt-out do cliente" })
        .eq("lead_id", leadId)
        .in("status", ["pendente", "pausado"]);
      await supabase.from("conversations").update({ ai_enabled: false }).eq("id", conv);
      const ack = "Sem problemas, vou encerrar o contato por aqui. Obrigado e desculpe o incômodo! 🙏";
      try {
        const { messageId } = await sendText(evolutionInstance, numero, ack);
        await supabase.from("messages").insert({
          user_id: inst.user_id, conversation_id: conv, instance_id: inst.id,
          direction: "outbound", body: ack, evolution_message_id: messageId ?? null, status: "sent",
        });
      } catch (e) {
        console.error("[webhook] falha ao enviar ack de opt-out:", e instanceof Error ? e.message : e);
      }
      continue; // não aciona SDR nem referral
    }

    // Auto-reply de "fora do horário / fechado": NÃO insistir. Marca a conversa
    // para retomar no próximo dia útil e deixa o BOT como "à espera" (outbound),
    // para o follow-up reativar sozinho quando o silêncio passar.
    if (inserted && text && isAutoReply(text)) {
      const retomar = proximoDiaUtilSP();
      await supabase.from("conversations")
        .update({ quiet_until: retomar.toISOString(), last_direction: "outbound" })
        .eq("id", conv);
      console.log("[webhook] auto-reply (fora do horário) de", numero, "— retoma em", retomar.toISOString());
      continue; // não aciona SDR nem referral
    }

    // "Aqui não é lotérica / número errado": encerra e cancela os follow-ups.
    // (Exceção já tratada no detector: se a pessoa vai REPASSAR ao responsável,
    // isNotLoteria retorna false e o fluxo segue normal.)
    if (inserted && text && isNotLoteria(text)) {
      console.log("[webhook] 'não é lotérica' de", numero, "— encerrando e cancelando follow-ups");
      await supabase.from("leads").update({ status: "perdido" }).eq("id", leadId);
      await supabase.from("message_queue")
        .update({ status: "cancelado", last_error: "não é lotérica" })
        .eq("lead_id", leadId).in("status", ["pendente", "pausado"]);
      await supabase.from("conversations").update({ ai_enabled: false }).eq("id", conv);
      const ack = "Ah, entendi! Desculpe o engano e obrigado pela atenção. 🙏";
      try {
        const { messageId } = await sendText(evolutionInstance, numero, ack);
        await supabase.from("messages").insert({
          user_id: inst.user_id, conversation_id: conv, instance_id: inst.id,
          direction: "outbound", body: ack, evolution_message_id: messageId ?? null, status: "sent",
        });
      } catch (e) {
        console.error("[webhook] ack 'não é lotérica' falhou:", e instanceof Error ? e.message : e);
      }
      continue; // não aciona SDR nem referral
    }

    // Indicação de contato: o cliente repassou o número de outra pessoa?
    const referral = inserted ? extractReferral(item, text, numero) : null;
    const isHandoff = !!referral && referral.numero !== numero;
    if (isContact && !isHandoff) console.log("[webhook] contato compartilhado mas sem número extraível");

    if (isHandoff && inserted) {
      console.log("[webhook] indicação detectada → iniciando contato com", referral!.numero);
      const task = handleReferral({
        supabase,
        userId: inst.user_id,
        instanceId: inst.id,
        evolutionInstance,
        referidoNumero: referral!.numero,
        referidoNome: referral!.nome,
        indicadorNome: lead?.nome ?? item?.pushName,
        indicadorConversationId: conv,
        indicadorNumero: numero,
      }).catch((e) => console.error("handleReferral erro:", e instanceof Error ? e.message : e));
      // @ts-ignore EdgeRuntime existe no runtime do Supabase
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
      else await task;
    } else if (inserted && text) {
      // SDR com IA: responde em background (não bloqueia o retorno pra Evolution).
      console.log("[webhook] inbound salvo, acionando SDR para conversa", conv);
      const task = runSdr({
        supabase,
        userId: inst.user_id,
        conversationId: conv,
        leadId,
        instanceId: inst.id,
        evolutionInstance,
        numero,
        triggerAt: inserted.created_at,
      }).catch((e) => console.error("runSdr erro:", e instanceof Error ? e.message : e));
      // @ts-ignore EdgeRuntime existe no runtime do Supabase
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
      else await task;
    }
  }

  return json({ ok: true });
});

async function upsertConversation(userId: string, leadId: string, instanceId: string) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing) {
    await supabase.from("conversations").update({ instance_id: instanceId }).eq("id", existing.id);
    return existing.id;
  }
  const { data: created } = await supabase
    .from("conversations")
    .insert({ user_id: userId, lead_id: leadId, instance_id: instanceId })
    .select("id")
    .single();
  return created?.id ?? null;
}
