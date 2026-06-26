// =====================================================================
// alfred-webhook · cérebro do agente Alfred (grupos de WhatsApp)
// ---------------------------------------------------------------------
// Fluxo:
//  A. Recebe o payload MESSAGES_UPSERT da Evolution API.
//  B. Ignora o que não for de GRUPO (remoteJid ..@g.us), o fromMe e os
//     grupos que não estão ATIVOS em alfred_groups.
//  C. Busca o alfred_context do grupo e a GEMINI_API_KEY (alfred_configs).
//  D/E. Monta o fetch para o Gemini 1.5 Flash (REST), com system_instruction
//     (prompt global + regras de brevidade) e o contexto + msg em contents.
//  F. Extrai o texto e devolve ao grupo via Evolution API.
//
// Módulo ISOLADO: aponte o webhook do(s) chip(s) de grupo para esta função.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Fallbacks de ambiente (a config do banco tem prioridade).
const ENV_EVO_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const ENV_EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("ALFRED_WEBHOOK_SECRET") ?? "";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// --- helpers --------------------------------------------------------

/** Extrai o texto de uma mensagem da Evolution (vários formatos). */
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

/** Monta o bloco de contexto do cliente para a IA consultar. */
// deno-lint-ignore no-explicit-any
function montarContexto(ctx: any, clientName: string): string {
  const linhas = [`Cliente: ${clientName}`];
  if (ctx?.drive_link) linhas.push(`Link do Drive: ${ctx.drive_link}`);
  if (ctx?.cronograma) linhas.push(`Cronograma atual: ${ctx.cronograma}`);
  if (ctx?.financeiro) linhas.push(`Status financeiro: ${ctx.financeiro}`);
  if (ctx?.observacoes) linhas.push(`Observações: ${ctx.observacoes}`);
  return linhas.join("\n");
}

/** Chama o Gemini 1.5 Flash via REST. Retorna o texto ou "". */
async function chamarGemini(apiKey: string, systemPrompt: string, contexto: string, msg: string): Promise<string> {
  const body = {
    system_instruction: {
      parts: [{
        text:
          `${systemPrompt}\n\n` +
          "REGRAS DE RESPOSTA: seja curto e direto, como uma pessoa real no WhatsApp. " +
          "Varie a formatação naturalmente (nem sempre listas ou saudações), use poucas palavras e " +
          "evite texto longo para economizar tokens. Responda só o necessário, com base no contexto. " +
          "Se não souber, diga que vai verificar com a equipe.",
      }],
    },
    contents: [{
      role: "user",
      parts: [{ text: `CONTEXTO DO CLIENTE:\n${contexto}\n\nMENSAGEM DO GRUPO:\n${msg}` }],
    }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 350 },
  };

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[alfred] gemini erro", res.status, (await res.text()).slice(0, 300));
    return "";
  }
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const parts = data?.candidates?.[0]?.content?.parts as any[] | undefined;
  return (parts?.map((p) => p?.text ?? "").join("") ?? "").trim();
}

/** Envia texto a um grupo via Evolution API (o JID do grupo vai em `number`). */
async function enviarGrupo(url: string, key: string, instance: string, remoteJid: string, texto: string): Promise<void> {
  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: remoteJid, text: texto }),
  });
  if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// --- handler --------------------------------------------------------
Deno.serve(async (req) => {
  // Segurança opcional: ?token= deve bater com ALFRED_WEBHOOK_SECRET (se definido).
  if (WEBHOOK_SECRET) {
    const token = new URL(req.url).searchParams.get("token");
    if (token !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ ok: true, ignored: "payload inválido" }); }

  // deno-lint-ignore no-explicit-any
  const data = (payload as any).data ?? payload;
  const instance = (payload as any).instance ?? data?.instance ?? "";
  const key = data?.key ?? {};
  const remoteJid: string = key?.remoteJid ?? "";

  // B) Só GRUPOS (..@g.us), nunca o que nós mesmos enviamos (fromMe).
  if (!remoteJid.endsWith("@g.us")) return json({ ok: true, ignored: "não é grupo" });
  if (key?.fromMe) return json({ ok: true, ignored: "fromMe" });

  const texto = extrairTexto(data?.message);
  if (!texto) return json({ ok: true, ignored: "sem texto" });

  // B) Grupo precisa estar ATIVO em alfred_groups.
  const { data: grupo } = await supabase
    .from("alfred_groups")
    .select("id, user_id, client_name, evolution_instance, active")
    .eq("remote_jid", remoteJid)
    .eq("active", true)
    .maybeSingle();
  if (!grupo) return json({ ok: true, ignored: "grupo inativo ou não cadastrado" });

  // C) Config (chaves + prompt) e contexto do cliente.
  const { data: config } = await supabase
    .from("alfred_configs")
    .select("gemini_api_key, evolution_api_key, evolution_api_url, system_prompt")
    .eq("user_id", grupo.user_id)
    .maybeSingle();
  if (!config?.gemini_api_key) {
    console.log("[alfred] sem GEMINI_API_KEY para o usuário", grupo.user_id);
    return json({ ok: true, ignored: "sem gemini_api_key" });
  }

  const { data: ctx } = await supabase
    .from("alfred_context")
    .select("drive_link, cronograma, financeiro, observacoes")
    .eq("group_id", grupo.id)
    .maybeSingle();

  // D/E) Gemini com system_instruction (prompt global) + contexto e mensagem.
  const contexto = montarContexto(ctx, grupo.client_name);
  const resposta = await chamarGemini(config.gemini_api_key, config.system_prompt ?? "", contexto, texto);
  if (!resposta) return json({ ok: true, ignored: "gemini sem resposta" });

  // F) Devolve ao grupo via Evolution (config tem prioridade sobre env).
  const evoUrl = (config.evolution_api_url || ENV_EVO_URL).replace(/\/+$/, "");
  const evoKey = config.evolution_api_key || ENV_EVO_KEY;
  const evoInstance = instance || grupo.evolution_instance || "";
  if (!evoUrl || !evoKey || !evoInstance) {
    console.error("[alfred] faltam credenciais/instância da Evolution");
    return json({ ok: false, error: "evolution não configurada" }, 200);
  }

  try {
    await enviarGrupo(evoUrl, evoKey, evoInstance, remoteJid, resposta);
    return json({ ok: true, replied: true });
  } catch (e) {
    console.error("[alfred] envio falhou:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "falha ao enviar" }, 200);
  }
});
