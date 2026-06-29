// =====================================================================
// alfred-webhook · registra as mensagens dos grupos do Alfred
// ---------------------------------------------------------------------
// Apenas REGISTRA (não responde): identifica se quem enviou é EQUIPE ou
// CLIENTE (cruzando com alfred_group_members), interpreta áudio/imagem e
// grava no histórico. Quem decide responder é o cron alfred-tick, que
// respeita o handoff humano (espera a equipe, intervém após o prazo).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { getMediaBase64 } from "../_shared/evolution.ts";
import { responderAgora, atenderOperador, type AlfredCfg } from "../_shared/alfred.ts";

const DEBOUNCE_MS = 8000; // modo imediato: junta a rajada antes de responder
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("ALFRED_WEBHOOK_SECRET") ?? "";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// --- helpers --------------------------------------------------------
// deno-lint-ignore no-explicit-any
function extrairTexto(message: any): string {
  if (!message) return "";
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    ""
  ).trim();
}

/** Texto da mensagem CITADA (reply do WhatsApp), se houver. */
// deno-lint-ignore no-explicit-any
function extrairCitacao(message: any): string {
  if (!message) return "";
  const ci = message.extendedTextMessage?.contextInfo
    ?? message.imageMessage?.contextInfo
    ?? message.videoMessage?.contextInfo
    ?? message.audioMessage?.contextInfo
    ?? message.documentMessage?.contextInfo
    ?? message.contextInfo
    ?? null;
  const quoted = ci?.quotedMessage;
  return quoted ? extrairTexto(quoted) : "";
}

const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Formas equivalentes de um número BR para casar: com/sem DDI 55 e com/sem 9º dígito.
 *  Ex.: "98999998888", "5598999998888", "9899998888", "559899998888" casam entre si. */
function variantes(num: string): string[] {
  const d = soDigitos(num);
  if (!d) return [];
  const out = new Set<string>([d]);
  const semDDI = (d.startsWith("55") && d.length >= 12) ? d.slice(2) : d; // tira o 55, se houver
  if (semDDI.length >= 10) {
    const dd = semDDI.slice(0, 2);
    const local = semDDI.slice(2);
    const formas = new Set<string>([local]);
    if (local.length === 9 && local.startsWith("9")) formas.add(local.slice(1)); // sem o 9
    if (local.length === 8) formas.add("9" + local);                             // com o 9
    for (const loc of formas) {
      out.add(dd + loc);          // sem DDI
      out.add("55" + dd + loc);   // com DDI
    }
  }
  return [...out];
}

/** Interpreta mídia via Gemini (REST): transcreve áudio ou descreve imagem. */
async function interpretarMidia(base64: string, mime: string, tipo: "audio" | "image"): Promise<string> {
  if (!GEMINI_API_KEY) return "";
  const prompt = tipo === "audio"
    ? "Transcreva este áudio em português do Brasil. Responda APENAS com a transcrição, sem comentários."
    : "Descreva em português, de forma objetiva e curta, o que aparece nesta imagem (inclua qualquer texto visível).";
  const body = {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) { console.error("[alfred] interpretarMidia", res.status); return ""; }
    const dataR = await res.json();
    // deno-lint-ignore no-explicit-any
    return ((dataR?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
  } catch (e) { console.error("[alfred] interpretarMidia erro:", e instanceof Error ? e.message : e); return ""; }
}

// --- handler --------------------------------------------------------
Deno.serve(async (req) => {
  if (WEBHOOK_SECRET) {
    const token = new URL(req.url).searchParams.get("token");
    if (token !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ ok: true, ignored: "payload inválido" }); }

  // deno-lint-ignore no-explicit-any
  const p = payload as any;
  const event = String(p.event ?? "").toLowerCase();
  const data = p.data ?? p;
  const instance: string = p.instance ?? data?.instance ?? "";

  // CONNECTION_UPDATE → atualiza o status do chip dedicado do Alfred.
  if (event.includes("connection")) {
    const state = data?.state ?? data?.connection ?? "";
    const status = state === "open" ? "conectado" : state === "connecting" ? "conectando" : "desconectado";
    const numero = (data?.wuid ?? data?.owner ?? "").toString().split("@")[0] || null;
    if (instance) {
      await supabase.from("alfred_configs").update({ connection_status: status, ...(numero ? { numero } : {}) }).eq("evolution_instance", instance);
    }
    return json({ ok: true, connection: status });
  }

  const key = data?.key ?? {};
  const remoteJid: string = key?.remoteJid ?? "";
  if (key?.fromMe) return json({ ok: true, ignored: "fromMe" });
  const msgObj = data?.message;

  // 1:1 (não-grupo): pode ser o OPERADOR respondendo a uma escalação por DM.
  if (!remoteJid.endsWith("@g.us")) {
    const senderJidNum = soDigitos(remoteJid.split("@")[0]);
    if (!senderJidNum) return json({ ok: true, ignored: "1:1 sem remetente" });
    const { data: cfgs } = await supabase.from("alfred_configs")
      .select("user_id, operator_number, system_prompt, base_conhecimento, evolution_instance")
      .not("operator_number", "is", null);
    const sv = new Set(variantes(senderJidNum));
    const cfgOp = (cfgs ?? []).find((c) => variantes(String(c.operator_number ?? "")).some((v) => sv.has(v)));
    if (!cfgOp) return json({ ok: true, ignored: "1:1 não é operador" });

    // Operador pode responder por TEXTO ou por ÁUDIO/imagem — interpreta a mídia.
    let replyText = extrairTexto(msgObj);
    if (!replyText) {
      const tipo1: "audio" | "image" | null = msgObj?.audioMessage ? "audio" : msgObj?.imageMessage ? "image" : null;
      if (tipo1) {
        const evoMedia = instance || cfgOp.evolution_instance || "";
        const media = evoMedia ? await getMediaBase64(evoMedia, data) : null;
        if (media) replyText = await interpretarMidia(media.base64, media.mimetype, tipo1);
      }
    }
    if (!replyText) return json({ ok: true, ignored: "operador sem conteúdo" });

    const { data: sdrOp } = await supabase.from("ai_config").select("delay_min_seg, delay_max_seg").eq("user_id", cfgOp.user_id).maybeSingle();
    const cfgA: AlfredCfg = {
      system_prompt: cfgOp.system_prompt ?? "", base_conhecimento: cfgOp.base_conhecimento ?? null,
      operator_number: cfgOp.operator_number ?? null, evolution_instance: cfgOp.evolution_instance ?? null,
      handoff_ativo: false, team_cooldown_min: 5, intervene_after_min: 30,
      proactive_ativo: false, proactive_hora: 9,
      dmin: Number(sdrOp?.delay_min_seg ?? 3), dmax: Number(sdrOp?.delay_max_seg ?? 8),
    };
    const quoted = extrairCitacao(msgObj);
    const r = await atenderOperador(supabase, cfgA, { userId: cfgOp.user_id, replyText, quotedText: quoted });
    return json({ ok: true, operador: true, resultado: r });
  }

  // Detecta mídia (áudio/imagem): interpretar em vez de ignorar.
  const tipoMidia: "audio" | "image" | null = msgObj?.audioMessage ? "audio" : msgObj?.imageMessage ? "image" : null;
  let texto = extrairTexto(msgObj);
  if (!texto && !tipoMidia) return json({ ok: true, ignored: "sem conteúdo" });

  // Grupo precisa estar ATIVO em alfred_groups.
  const { data: grupo } = await supabase
    .from("alfred_groups")
    .select("id, user_id, client_name, evolution_instance, last_learned_at, active, created_at, contrato_inicio, contract_id, bolao_account_id, fase_override")
    .eq("remote_jid", remoteJid).eq("active", true).maybeSingle();
  if (!grupo) return json({ ok: true, ignored: "grupo inativo ou não cadastrado" });

  // Idempotência: ignora reentregas/retries do MESMO evento (mesmo id da
  // mensagem no WhatsApp). É o que evita o Alfred responder duas vezes —
  // comum em retry de webhook e em número compartilhado/multi-dispositivo.
  const waMsgId: string = key?.id ?? "";
  if (waMsgId) {
    const { data: jaProcessada } = await supabase.from("alfred_messages")
      .select("id").eq("group_id", grupo.id).eq("wa_message_id", waMsgId).limit(1).maybeSingle();
    if (jaProcessada) return json({ ok: true, ignored: "mensagem já processada (duplicada)" });
  }

  // Interpreta a mídia (só p/ grupo ativo).
  if (tipoMidia) {
    const evoForMedia = instance || grupo.evolution_instance || "";
    const media = evoForMedia ? await getMediaBase64(evoForMedia, data) : null;
    if (media) {
      const interpretado = await interpretarMidia(media.base64, media.mimetype, tipoMidia);
      texto = tipoMidia === "audio"
        ? (interpretado || texto || "[áudio recebido]")
        : [texto, interpretado ? `[imagem: ${interpretado}]` : "[imagem recebida]"].filter(Boolean).join(" ");
    } else {
      texto = texto || (tipoMidia === "audio" ? "[áudio recebido]" : "[imagem recebida]");
    }
  }
  if (!texto) return json({ ok: true, ignored: "sem conteúdo após mídia" });

  // Quem enviou? Em grupo, o remetente real é key.participant. Com LID ativo, o
  // telefone real costuma vir em participantPn — priorizamos esse para casar a equipe.
  const senderNumber = soDigitos(key?.participantPn ?? data?.participantPn ?? key?.participant ?? "");
  const senderName: string = data?.pushName ?? (senderNumber || "").slice(-4) ?? "";

  // EQUIPE x CLIENTE: cruza o número com os membros cadastrados do grupo.
  const { data: membros } = await supabase
    .from("alfred_group_members").select("numero").eq("group_id", grupo.id);
  const memberSet = new Set<string>();
  for (const m of membros ?? []) for (const v of variantes(m.numero)) memberSet.add(v);
  const isTeam = variantes(senderNumber).some((v) => memberSet.has(v));

  // Registra no histórico (sempre). Em corrida (duas entregas quase juntas),
  // o índice único barra a 2ª: tratamos 23505 como duplicada e paramos aqui.
  const quotedBody = extrairCitacao(msgObj);
  const { data: inserida, error: insErr } = await supabase.from("alfred_messages").insert({
    user_id: grupo.user_id, group_id: grupo.id, remote_jid: remoteJid,
    role: "user", sender_name: senderName || null, sender_number: senderNumber || null,
    is_team: isTeam, body: texto, wa_message_id: waMsgId || null, quoted_body: quotedBody || null,
  }).select("created_at").single();
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") return json({ ok: true, ignored: "duplicada (corrida)" });
    console.error("[alfred] insert msg:", insErr.message);
  }

  // Modo handoff x imediato.
  const { data: cfgRow } = await supabase.from("alfred_configs")
    .select("handoff_ativo, system_prompt, base_conhecimento, operator_number, evolution_instance, team_cooldown_min, intervene_after_min")
    .eq("user_id", grupo.user_id).maybeSingle();
  const handoff = cfgRow?.handoff_ativo ?? true;

  // HANDOFF ligado: só registra (o cron alfred-tick decide quando intervir).
  // Mensagem da EQUIPE: nunca responde.
  if (handoff || isTeam) {
    return json({ ok: true, logged: true, is_team: isTeam, modo: handoff ? "handoff" : "imediato" });
  }

  // IMEDIATO: debounce p/ juntar a rajada; se chegar msg nova, deixa a próxima responder.
  const triggerAt = inserida?.created_at ?? new Date().toISOString();
  await sleep(DEBOUNCE_MS);
  const { count: novas } = await supabase.from("alfred_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", grupo.id).eq("role", "user").gt("created_at", triggerAt);
  if ((novas ?? 0) > 0) return json({ ok: true, ignored: "debounce: mensagem mais nova" });

  const { data: sdrCfg } = await supabase.from("ai_config")
    .select("delay_min_seg, delay_max_seg").eq("user_id", grupo.user_id).maybeSingle();
  const cfg: AlfredCfg = {
    system_prompt: cfgRow?.system_prompt ?? "",
    base_conhecimento: cfgRow?.base_conhecimento ?? null,
    operator_number: cfgRow?.operator_number ?? null,
    evolution_instance: cfgRow?.evolution_instance ?? null,
    handoff_ativo: false,
    team_cooldown_min: Number(cfgRow?.team_cooldown_min ?? 5),
    intervene_after_min: Number(cfgRow?.intervene_after_min ?? 30),
    proactive_ativo: false, proactive_hora: 9,
    dmin: Number(sdrCfg?.delay_min_seg ?? 3),
    dmax: Number(sdrCfg?.delay_max_seg ?? 8),
  };
  const r = await responderAgora(supabase, {
    id: grupo.id, user_id: grupo.user_id, client_name: grupo.client_name,
    remote_jid: remoteJid, evolution_instance: grupo.evolution_instance, last_learned_at: grupo.last_learned_at ?? null,
    created_at: grupo.created_at ?? null, contrato_inicio: grupo.contrato_inicio ?? null,
    contract_id: grupo.contract_id ?? null, bolao_account_id: grupo.bolao_account_id ?? null,
    fase_override: grupo.fase_override ?? null,
  }, cfg);
  return json({ ok: true, modo: "imediato", resultado: r });
});
