// =====================================================================
// Lógica compartilhada do Alfred (usada pelo cron alfred-tick).
// Monta contexto, chama o Gemini, aprende e aplica as regras de handoff.
// =====================================================================
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const ENV_EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/+$/, "");
const ENV_EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const HISTORICO = 50;

export interface HistRow { role: string; sender_name: string | null; body: string; is_team?: boolean }
export interface TaskRow { semana: number; task_key?: string; titulo: string; done: boolean }

// deno-lint-ignore no-explicit-any
function montarContexto(ctx: any, clientName: string): string {
  const linhas = [`Cliente: ${clientName}`];
  if (ctx?.resumo) linhas.push(`Resumo consolidado do cliente: ${ctx.resumo}`);
  if (ctx?.empresa_dados) linhas.push(`Dados da empresa: ${ctx.empresa_dados}`);
  if (ctx?.regras_atendimento) linhas.push(`Regras de atendimento: ${ctx.regras_atendimento}`);
  if (ctx?.cronograma) linhas.push(`Cronograma atual: ${ctx.cronograma}`);
  if (ctx?.financeiro) linhas.push(`Status financeiro: ${ctx.financeiro}`);
  if (ctx?.drive_link) linhas.push(`Link do Drive: ${ctx.drive_link}`);
  if (ctx?.observacoes) linhas.push(`Observações: ${ctx.observacoes}`);
  return linhas.join("\n");
}

function montarMemoria(mem: { chave: string; valor: string }[]): string {
  if (!mem?.length) return "";
  const linhas = ["", "INFORMAÇÕES SALVAS (memória do cliente — use quando perguntarem):"];
  for (const m of mem) linhas.push(`- ${m.chave}: ${m.valor}`);
  return linhas.join("\n");
}

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

/** Histórico -> contents do Gemini. Mensagens da equipe vêm marcadas [Equipe]. */
function montarContents(hist: HistRow[]) {
  const out: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of hist) {
    const role = m.role === "model" ? "model" : "user";
    if (out.length === 0 && role === "model") continue;
    const quem = m.is_team ? `[Equipe${m.sender_name ? ` ${m.sender_name}` : ""}]` : (m.sender_name || "Cliente");
    const texto = role === "user" ? `${quem}: ${m.body}` : m.body;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${texto}`;
    else out.push({ role, parts: [{ text: texto }] });
  }
  return out;
}

async function chamarGemini(systemPrompt: string, contexto: string, contents: { role: "user" | "model"; parts: { text: string }[] }[]): Promise<string> {
  const body = {
    system_instruction: {
      parts: [{
        text:
          `${systemPrompt}\n\n` +
          `CONTEXTO DO CLIENTE (use para responder):\n${contexto}\n\n` +
          "VOCÊ RESPONDE APENAS AO CLIENTE. Mensagens marcadas como [Equipe ...] são da equipe da agência — leia para ter contexto, " +
          "mas NUNCA responda a elas. Se a última mensagem for da equipe, ou se o pedido do cliente já tiver sido resolvido, ou se a " +
          "última mensagem do cliente não pedir resposta (ex.: 'ok', 'obrigado', encerramento), responda com STRING VAZIA (não envie nada).\n\n" +
          "USO DO CHECKLIST/MEMÓRIA: baseie-se no andamento e nas informações salvas; nunca diga que algo está pronto se está pendente; " +
          "se uma etapa pendente depende do cliente (criativo, conta de Facebook, orçamento), solicite a ele.\n\n" +
          "FORMATO: envie ESTRITAMENTE o conteúdo, sem prefixo/nome/'Alfred:'. Curto e direto, como pessoa real no WhatsApp; " +
          "poucas palavras, sem markdown, para economizar créditos.",
      }],
    },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) { console.error("[alfred] gemini", res.status, (await res.text()).slice(0, 200)); return ""; }
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const txt = (data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "";
  return txt.replace(/^\s*alfred\s*:\s*/i, "").replace(/^["“](.*)["”]$/s, "$1").trim();
}

interface Aprendizado { tarefas_concluidas: string[]; memorias: { chave: string; valor: string }[]; resumo: string }

async function aprenderDaConversa(hist: HistRow[], tarefas: TaskRow[], memoriaAtual: { chave: string; valor: string }[], resumoAtual: string): Promise<Aprendizado | null> {
  const tasksTxt = tarefas.map((t) => `- ${t.task_key ?? ""} — ${t.titulo} — ${t.done ? "feito" : "pendente"}`).join("\n");
  const memTxt = memoriaAtual.length ? memoriaAtual.map((m) => `- ${m.chave}: ${m.valor}`).join("\n") : "(vazio)";
  const histTxt = hist.map((m) => `${m.role === "model" ? "Alfred" : (m.is_team ? `[Equipe ${m.sender_name || ""}]` : (m.sender_name || "Cliente"))}: ${m.body}`).join("\n");

  const sys =
    "Você analisa a conversa de um grupo de WhatsApp de um cliente da agência e APRENDE com ela. Identifique de forma autônoma: " +
    "(1) tarefas do checklist concluídas AGORA — use EXATAMENTE as task_key da lista; só marque o que ficou claramente pronto " +
    "(ex.: alguém diz 'segue a identidade visual' => identidade_visual). " +
    "(2) dados operacionais/sensíveis para guardar (senhas, logins, @ do Instagram, links, orçamento, decisões, datas). Chaves curtas em snake_case. Atualize valores. " +
    "(3) um RESUMO consolidado e enxuto (~5 linhas) com a ESSÊNCIA do cliente, evoluindo o anterior. Sem novidade: listas vazias e repita o resumo.";

  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text:
      `CHECKLIST (task_key — título — estado):\n${tasksTxt}\n\nMEMÓRIA ATUAL:\n${memTxt}\n\nRESUMO ATUAL:\n${resumoAtual || "(vazio)"}\n\nCONVERSA RECENTE:\n${histTxt}` }] }],
    generationConfig: {
      temperature: 0, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          tarefas_concluidas: { type: "ARRAY", items: { type: "STRING" } },
          memorias: { type: "ARRAY", items: { type: "OBJECT", properties: { chave: { type: "STRING" }, valor: { type: "STRING" } }, required: ["chave", "valor"] } },
          resumo: { type: "STRING" },
        },
      },
    },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { console.error("[alfred] aprender", res.status); return null; }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const txt = (data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "";
    const parsed = JSON.parse(txt);
    return {
      tarefas_concluidas: Array.isArray(parsed?.tarefas_concluidas) ? parsed.tarefas_concluidas : [],
      memorias: Array.isArray(parsed?.memorias) ? parsed.memorias : [],
      resumo: typeof parsed?.resumo === "string" ? parsed.resumo : "",
    };
  } catch (e) { console.error("[alfred] aprender erro:", e instanceof Error ? e.message : e); return null; }
}

async function enviarGrupo(instance: string, remoteJid: string, texto: string, delayMs = 0): Promise<void> {
  const res = await fetch(`${ENV_EVO_URL}/message/sendText/${instance}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: ENV_EVO_KEY },
    body: JSON.stringify({ number: remoteJid, text: texto, ...(delayMs > 0 ? { delay: delayMs, presence: "composing" } : {}) }),
  });
  if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export interface AlfredCfg {
  system_prompt: string;
  evolution_instance: string | null;
  team_cooldown_min: number;
  intervene_after_min: number;
  dmin: number;
  dmax: number;
}
// deno-lint-ignore no-explicit-any
type Grupo = { id: string; user_id: string; client_name: string; remote_jid: string; evolution_instance: string | null; last_learned_at: string | null };

/**
 * Avalia um grupo: (1) consolida aprendizado quando a conversa assentou e
 * (2) intervém respondendo ao cliente se a equipe não resolveu no prazo.
 */
export async function processarGrupoTick(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg): Promise<string> {
  const nowMs = Date.now();

  const { data: msgsDesc } = await supabase
    .from("alfred_messages")
    .select("role, sender_name, body, created_at, is_team")
    .eq("group_id", grupo.id)
    .order("created_at", { ascending: false })
    .limit(HISTORICO);
  const hist = ((msgsDesc as (HistRow & { created_at: string })[]) ?? []).reverse();
  if (hist.length === 0) return "vazio";

  const ultima = hist[hist.length - 1];
  const lastMsgMs = new Date(ultima.created_at).getTime();
  const lastTeamMs = Math.max(0, ...hist.filter((m) => m.is_team).map((m) => new Date(m.created_at).getTime()));

  // Carrega contexto/checklist/memória uma vez (servem para aprender e responder).
  const [{ data: ctx }, { data: tasks }, { data: memorias }] = await Promise.all([
    supabase.from("alfred_context").select("empresa_dados, regras_atendimento, drive_link, cronograma, financeiro, observacoes, resumo").eq("group_id", grupo.id).maybeSingle(),
    supabase.from("alfred_tasks").select("semana, task_key, titulo, done").eq("group_id", grupo.id).order("semana").order("ordem"),
    supabase.from("alfred_memory").select("chave, valor").eq("group_id", grupo.id),
  ]);
  const tarefas = (tasks as TaskRow[]) ?? [];
  const mem = (memorias as { chave: string; valor: string }[]) ?? [];

  // (1) APRENDIZADO — só quando há mensagens novas e a conversa assentou (>2 min).
  const learnedMs = grupo.last_learned_at ? new Date(grupo.last_learned_at).getTime() : 0;
  if (lastMsgMs > learnedMs && nowMs - lastMsgMs >= 120_000) {
    const aprend = await aprenderDaConversa(hist, tarefas, mem, ctx?.resumo ?? "");
    if (aprend) {
      const validKeys = new Set(tarefas.map((t) => t.task_key).filter(Boolean));
      const agora = new Date().toISOString();
      for (const key of aprend.tarefas_concluidas) {
        if (validKeys.has(key)) await supabase.from("alfred_tasks").update({ done: true, done_at: agora }).eq("group_id", grupo.id).eq("task_key", key).eq("done", false);
      }
      for (const m of aprend.memorias) {
        if (!m?.chave || !m?.valor) continue;
        await supabase.from("alfred_memory").upsert({ user_id: grupo.user_id, group_id: grupo.id, chave: String(m.chave).slice(0, 80), valor: String(m.valor).slice(0, 2000), updated_at: agora }, { onConflict: "group_id,chave" });
      }
      if (aprend.resumo?.trim()) await supabase.from("alfred_context").upsert({ user_id: grupo.user_id, group_id: grupo.id, resumo: aprend.resumo.trim() }, { onConflict: "group_id" });
    }
    await supabase.from("alfred_groups").update({ last_learned_at: new Date(lastMsgMs).toISOString() }).eq("id", grupo.id);
  }

  // (2) HANDOFF — só intervém se o CLIENTE falou por último (equipe não respondeu),
  //     passou o prazo de intervenção e a equipe está em silêncio (cooldown).
  const clienteFalouPorUltimo = ultima.role === "user" && !ultima.is_team;
  if (!clienteFalouPorUltimo) return "sem necessidade";
  const sinceClient = nowMs - lastMsgMs;
  const sinceTeam = lastTeamMs ? nowMs - lastTeamMs : Infinity;
  if (sinceClient < cfg.intervene_after_min * 60_000) return "aguardando prazo";
  if (sinceTeam < cfg.team_cooldown_min * 60_000) return "equipe ativa (cooldown)";

  if (!GEMINI_API_KEY) return "sem GEMINI_API_KEY";
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return "evolution não configurada";

  const contexto = montarContexto(ctx, grupo.client_name) + montarMemoria(mem) + montarChecklist(tarefas);
  const contents = montarContents(hist);
  if (contents.length === 0) return "sem histórico";

  const resposta = await chamarGemini(cfg.system_prompt, contexto, contents);
  if (!resposta) return "sem resposta (não necessária)"; // o modelo decidiu não responder

  const base = cfg.dmin + Math.random() * Math.max(0, cfg.dmax - cfg.dmin);
  const delayMs = Math.round(Math.max(cfg.dmin, Math.max(base, Math.min(cfg.dmax, resposta.length / 25))) * 1000);
  try {
    await enviarGrupo(instance, grupo.remote_jid, resposta, delayMs);
    await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: resposta });
    return "respondido";
  } catch (e) {
    console.error("[alfred] envio falhou:", e instanceof Error ? e.message : e);
    return "falha ao enviar";
  }
}
