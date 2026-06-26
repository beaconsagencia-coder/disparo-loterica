// =====================================================================
// alfred-webhook · cérebro do agente Alfred (grupos de WhatsApp)
// ---------------------------------------------------------------------
// Fluxo:
//  A. Recebe o payload da Evolution (MESSAGES_UPSERT ou CONNECTION_UPDATE).
//  - connection.update: atualiza o status do chip dedicado do Alfred.
//  B. Mensagens: ignora o que não for de GRUPO (..@g.us), o fromMe e os
//     grupos que não estão ATIVOS em alfred_groups.
//  C. Persiste a mensagem no histórico e busca o contexto do cliente + a
//     GEMINI_API_KEY (alfred_configs).
//  D/E. Monta o fetch para o Gemini 2.5 Flash (REST): system_instruction
//     (prompt global + contexto + regras de brevidade) e o HISTÓRICO do
//     grupo (>=50 mensagens) em contents.
//  F. Extrai o texto, devolve ao grupo via Evolution e salva no histórico.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ENV_EVO_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const ENV_EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
// Mesma chave do Agente SDR (secret de ambiente), unificada — sem chave no banco.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("ALFRED_WEBHOOK_SECRET") ?? "";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const HISTORICO_MIN = 50; // nº mínimo de mensagens do grupo no contexto
const DEBOUNCE_MS = 6000; // espera o cliente terminar de digitar (igual ao SDR)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// deno-lint-ignore no-explicit-any
function montarContexto(ctx: any, clientName: string): string {
  const linhas = [`Cliente: ${clientName}`];
  if (ctx?.empresa_dados) linhas.push(`Dados da empresa: ${ctx.empresa_dados}`);
  if (ctx?.regras_atendimento) linhas.push(`Regras de atendimento: ${ctx.regras_atendimento}`);
  if (ctx?.cronograma) linhas.push(`Cronograma atual: ${ctx.cronograma}`);
  if (ctx?.financeiro) linhas.push(`Status financeiro: ${ctx.financeiro}`);
  if (ctx?.drive_link) linhas.push(`Link do Drive: ${ctx.drive_link}`);
  if (ctx?.observacoes) linhas.push(`Observações: ${ctx.observacoes}`);
  return linhas.join("\n");
}

interface TaskRow { semana: number; titulo: string; done: boolean }

/** Bloco do checklist do cronograma ([x] feito / [ ] pendente), por semana. */
function montarChecklist(tasks: TaskRow[]): string {
  if (!tasks?.length) return "";
  const porSemana = new Map<number, TaskRow[]>();
  for (const t of tasks) {
    if (!porSemana.has(t.semana)) porSemana.set(t.semana, []);
    porSemana.get(t.semana)!.push(t);
  }
  const linhas = ["", "ANDAMENTO DO CONTRATO (checklist — [x] já feito, [ ] pendente):"];
  for (const semana of [...porSemana.keys()].sort((a, b) => a - b)) {
    linhas.push(`Semana ${semana}:`);
    for (const t of porSemana.get(semana)!) linhas.push(`  [${t.done ? "x" : " "}] ${t.titulo}`);
  }
  return linhas.join("\n");
}

interface HistRow { role: string; sender_name: string | null; body: string }

/** Converte o histórico (ordenado) em contents do Gemini, mesclando turnos
 *  consecutivos do mesmo papel e descartando 'model' iniciais (precisa começar
 *  em 'user'). Mensagens de participantes vão prefixadas com o nome. */
function montarContents(hist: HistRow[]) {
  const out: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of hist) {
    const role = m.role === "model" ? "model" : "user";
    if (out.length === 0 && role === "model") continue; // não pode iniciar com model
    const texto = role === "user" && m.sender_name ? `${m.sender_name}: ${m.body}` : m.body;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${texto}`;
    else out.push({ role, parts: [{ text: texto }] });
  }
  return out;
}

async function chamarGemini(
  apiKey: string,
  systemPrompt: string,
  contexto: string,
  contents: { role: "user" | "model"; parts: { text: string }[] }[],
): Promise<string> {
  const body = {
    system_instruction: {
      parts: [{
        text:
          `${systemPrompt}\n\n` +
          `CONTEXTO DO CLIENTE (use para responder):\n${contexto}\n\n` +
          "USO DO CHECKLIST: o contexto traz o ANDAMENTO DO CONTRATO (o que já foi feito ou está pendente). " +
          "Baseie suas respostas nesse andamento — nunca diga que algo está pronto se está pendente. Se o cliente perguntar os " +
          "próximos passos ou cobrar algo de uma etapa PENDENTE (ex.: identidade visual ainda não marcada), diga com segurança que " +
          "estamos trabalhando nisso e que enviaremos em breve no grupo. Se uma etapa PENDENTE depende de algo que o CLIENTE precisa " +
          "fornecer (ex.: vídeo do criativo, conta de Facebook antiga, orçamento dos anúncios), você mesmo solicita isso a ele de forma natural. " +
          "Não liste o checklist nem o exponha cru; use-o só para saber o que falar.\n\n" +
          "FORMATO DA RESPOSTA (OBRIGATÓRIO): envie ESTRITAMENTE o conteúdo da mensagem, sem nenhum prefixo, nome ou identificação. " +
          "NUNCA comece com 'Alfred:', com o seu nome, nem com qualquer 'Nome:'. No histórico, as falas aparecem como 'Nome: texto' " +
          "APENAS para você saber quem falou — isso NÃO é um formato para imitar; escreva só o texto puro da sua resposta. Nada de aspas em volta. " +
          "ESTILO: curto e direto, como uma pessoa real no WhatsApp — poucas palavras, sem listas/markdown, variando a formatação naturalmente, " +
          "respondendo só o necessário para economizar créditos da API. Se não souber, diga que vai verificar com a equipe.",
      }],
    },
    contents,
    // Gemini 2.5: desliga o 'thinking' (respostas curtas, sem gastar tokens à toa).
    generationConfig: { temperature: 0.7, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
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
  const txt = (parts?.map((p) => p?.text ?? "").join("") ?? "").trim();
  // Rede de segurança: remove um prefixo "Alfred:" que o modelo às vezes imita
  // do histórico, e aspas que envolvam a mensagem inteira.
  return txt
    .replace(/^\s*alfred\s*:\s*/i, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}

async function enviarGrupo(url: string, key: string, instance: string, remoteJid: string, texto: string, delayMs = 0): Promise<void> {
  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    // delay + presence: a Evolution exibe "digitando…" antes de enviar (efeito humano).
    body: JSON.stringify({ number: remoteJid, text: texto, ...(delayMs > 0 ? { delay: delayMs, presence: "composing" } : {}) }),
  });
  if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${(await res.text()).slice(0, 200)}`);
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

  // A) CONNECTION_UPDATE → atualiza o status do chip dedicado do Alfred.
  if (event.includes("connection")) {
    const state = data?.state ?? data?.connection ?? "";
    const status = state === "open" ? "conectado" : state === "connecting" ? "conectando" : "desconectado";
    const numero = (data?.wuid ?? data?.owner ?? "").toString().split("@")[0] || null;
    if (instance) {
      await supabase.from("alfred_configs")
        .update({ connection_status: status, ...(numero ? { numero } : {}) })
        .eq("evolution_instance", instance);
    }
    return json({ ok: true, connection: status });
  }

  const key = data?.key ?? {};
  const remoteJid: string = key?.remoteJid ?? "";

  // B) Só GRUPOS, nunca o que nós mesmos enviamos (fromMe).
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

  const senderName: string = data?.pushName ?? (key?.participant ?? "").split("@")[0] ?? "";

  // C) Persiste a mensagem recebida no histórico ANTES de montar o contexto.
  const { data: inserida } = await supabase.from("alfred_messages").insert({
    user_id: grupo.user_id, group_id: grupo.id, remote_jid: remoteJid,
    role: "user", sender_name: senderName || null, body: texto,
  }).select("created_at").single();
  const triggerAt = inserida?.created_at ?? new Date().toISOString();

  // Debounce (igual ao SDR): espera o cliente terminar de digitar. Se chegar
  // mensagem nova no grupo nesse meio, aborta — a execução mais recente
  // responde, já com o contexto completo (sem responder cada msg da rajada).
  await sleep(DEBOUNCE_MS);
  const { count: novas } = await supabase.from("alfred_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", grupo.id).eq("role", "user").gt("created_at", triggerAt);
  if ((novas ?? 0) > 0) return json({ ok: true, ignored: "debounce: mensagem mais nova" });

  // C) A API Key é a MESMA do Agente SDR (env). Do banco vem só o prompt global.
  if (!GEMINI_API_KEY) {
    console.log("[alfred] GEMINI_API_KEY (env) não configurada");
    return json({ ok: true, ignored: "sem GEMINI_API_KEY" });
  }
  const { data: config } = await supabase
    .from("alfred_configs")
    .select("system_prompt")
    .eq("user_id", grupo.user_id)
    .maybeSingle();

  // Tempos de "digitando…" HERDADOS do Agente SDR (mesma config por usuário).
  const { data: sdrCfg } = await supabase
    .from("ai_config").select("delay_min_seg, delay_max_seg").eq("user_id", grupo.user_id).maybeSingle();
  const dmin = Number(sdrCfg?.delay_min_seg ?? 3);
  const dmax = Number(sdrCfg?.delay_max_seg ?? 8);

  // Contexto INDIVIDUAL do grupo (cada grupo = uma empresa).
  const { data: ctx } = await supabase
    .from("alfred_context")
    .select("empresa_dados, regras_atendimento, drive_link, cronograma, financeiro, observacoes")
    .eq("group_id", grupo.id)
    .maybeSingle();

  // Checklist do cronograma deste cliente (o que já foi entregue/coletado).
  const { data: tasks } = await supabase
    .from("alfred_tasks")
    .select("semana, titulo, done")
    .eq("group_id", grupo.id)
    .order("semana").order("ordem");

  // D/E) Histórico (últimas >=50) em ordem cronológica + Gemini 2.5.
  const { data: histDesc } = await supabase
    .from("alfred_messages")
    .select("role, sender_name, body")
    .eq("group_id", grupo.id)
    .order("created_at", { ascending: false })
    .limit(HISTORICO_MIN);
  const hist = ((histDesc as HistRow[]) ?? []).reverse(); // cronológico (antigo -> novo)

  const contexto = montarContexto(ctx, grupo.client_name) + montarChecklist((tasks as TaskRow[]) ?? []);
  const contents = montarContents(hist);
  if (contents.length === 0) return json({ ok: true, ignored: "sem histórico utilizável" });

  const resposta = await chamarGemini(GEMINI_API_KEY, config?.system_prompt ?? "", contexto, contents);
  if (!resposta) return json({ ok: true, ignored: "gemini sem resposta" });

  // F) Devolve ao grupo e salva a resposta no histórico (vira contexto futuro).
  const evoUrl = ENV_EVO_URL.replace(/\/+$/, "");
  const evoKey = ENV_EVO_KEY;
  const evoInstance = instance || grupo.evolution_instance || "";
  if (!evoUrl || !evoKey || !evoInstance) {
    console.error("[alfred] faltam credenciais/instância da Evolution");
    return json({ ok: false, error: "evolution não configurada" }, 200);
  }

  // Delay humanizado (mesma fórmula do SDR): base aleatória na faixa + proporcional
  // ao tamanho do texto (mensagens maiores "demoram" mais para digitar).
  const base = dmin + Math.random() * Math.max(0, dmax - dmin);
  const porTamanho = Math.min(dmax, resposta.length / 25);
  const delayMs = Math.round(Math.max(dmin, Math.max(base, porTamanho)) * 1000);

  try {
    await enviarGrupo(evoUrl, evoKey, evoInstance, remoteJid, resposta, delayMs);
    await supabase.from("alfred_messages").insert({
      user_id: grupo.user_id, group_id: grupo.id, remote_jid: remoteJid,
      role: "model", sender_name: "Alfred", body: resposta,
    });
    return json({ ok: true, replied: true });
  } catch (e) {
    console.error("[alfred] envio falhou:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "falha ao enviar" }, 200);
  }
});
