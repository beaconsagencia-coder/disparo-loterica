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
import { responderAgora, type AlfredCfg } from "../_shared/alfred.ts";

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

const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Variações do 9º dígito (BR) para casar o número da equipe com/sem o 9. */
function variantes(num: string): string[] {
  const d = soDigitos(num);
  const out = new Set<string>([d]);
  if (d.startsWith("55") && d.length === 13) {
    const dd = d.slice(2, 4), rest = d.slice(4);
    if (rest.startsWith("9")) out.add("55" + dd + rest.slice(1));
  } else if (d.startsWith("55") && d.length === 12) {
    const dd = d.slice(2, 4), rest = d.slice(4);
    out.add("55" + dd + "9" + rest);
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
  if (!remoteJid.endsWith("@g.us")) return json({ ok: true, ignored: "não é grupo" });
  if (key?.fromMe) return json({ ok: true, ignored: "fromMe" });

  // Detecta mídia (áudio/imagem): interpretar em vez de ignorar.
  const msgObj = data?.message;
  const tipoMidia: "audio" | "image" | null = msgObj?.audioMessage ? "audio" : msgObj?.imageMessage ? "image" : null;
  let texto = extrairTexto(msgObj);
  if (!texto && !tipoMidia) return json({ ok: true, ignored: "sem conteúdo" });

  // Grupo precisa estar ATIVO em alfred_groups.
  const { data: grupo } = await supabase
    .from("alfred_groups")
    .select("id, user_id, client_name, evolution_instance, last_learned_at, active, created_at, fase_override")
    .eq("remote_jid", remoteJid).eq("active", true).maybeSingle();
  if (!grupo) return json({ ok: true, ignored: "grupo inativo ou não cadastrado" });

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

  // Quem enviou? Em grupo, o remetente real é key.participant.
  const senderNumber = soDigitos(key?.participant ?? "");
  const senderName: string = data?.pushName ?? (senderNumber || "").slice(-4) ?? "";

  // EQUIPE x CLIENTE: cruza o número com os membros cadastrados do grupo.
  const { data: membros } = await supabase
    .from("alfred_group_members").select("numero").eq("group_id", grupo.id);
  const memberSet = new Set<string>();
  for (const m of membros ?? []) for (const v of variantes(m.numero)) memberSet.add(v);
  const isTeam = variantes(senderNumber).some((v) => memberSet.has(v));

  // Registra no histórico (sempre).
  const { data: inserida } = await supabase.from("alfred_messages").insert({
    user_id: grupo.user_id, group_id: grupo.id, remote_jid: remoteJid,
    role: "user", sender_name: senderName || null, sender_number: senderNumber || null,
    is_team: isTeam, body: texto,
  }).select("created_at").single();

  // Modo handoff x imediato.
  const { data: cfgRow } = await supabase.from("alfred_configs")
    .select("handoff_ativo, system_prompt, base_conhecimento, evolution_instance, team_cooldown_min, intervene_after_min")
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
    evolution_instance: cfgRow?.evolution_instance ?? null,
    handoff_ativo: false,
    team_cooldown_min: Number(cfgRow?.team_cooldown_min ?? 5),
    intervene_after_min: Number(cfgRow?.intervene_after_min ?? 30),
    dmin: Number(sdrCfg?.delay_min_seg ?? 3),
    dmax: Number(sdrCfg?.delay_max_seg ?? 8),
  };
  const r = await responderAgora(supabase, {
    id: grupo.id, user_id: grupo.user_id, client_name: grupo.client_name,
    remote_jid: remoteJid, evolution_instance: grupo.evolution_instance, last_learned_at: grupo.last_learned_at ?? null,
    created_at: grupo.created_at ?? null, fase_override: grupo.fase_override ?? null,
  }, cfg);
  return json({ ok: true, modo: "imediato", resultado: r });
});
