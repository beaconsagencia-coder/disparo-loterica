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
const FASE_THRESHOLD_DIAS = 30; // >= 30 dias de grupo => Manutenção (se sem override)

export type Fase = "onboarding" | "manutencao";

/** Fase efetiva: override manual, ou automática pela idade do grupo. */
export function faseEfetiva(createdAt: string | null, override: string | null): Fase {
  if (override === "onboarding" || override === "manutencao") return override;
  const ms = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
  return ms / 86_400_000 >= FASE_THRESHOLD_DIAS ? "manutencao" : "onboarding";
}

export interface HistRow { role: string; sender_name: string | null; body: string; is_team?: boolean }
export interface TaskRow { semana: number; task_key?: string; titulo: string; done: boolean }
export interface AssetRow {
  id: string; titulo: string; tipo: string; status: string;
  descricao: string | null; substituida_por: string | null;
}

// deno-lint-ignore no-explicit-any
function montarContexto(ctx: any, clientName: string, fase: Fase): string {
  const faseTxt = fase === "manutencao"
    ? "Manutenção (pós-onboarding — foco na operação: campanhas no ar, criativos e demandas)"
    : "Onboarding (implantação — foco no cronograma das primeiras semanas)";
  const linhas = [`Cliente: ${clientName}`, `Fase do contrato: ${faseTxt}`];
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

function montarDemandas(d: { titulo: string; status: string; prazo: string | null }[]): string {
  if (!d?.length) return "";
  const linhas = ["", "DEMANDAS AVULSAS EM ABERTO (pedidos do cliente — acompanhe e informe prazos quando perguntarem):"];
  for (const x of d) linhas.push(`- ${x.titulo} [${x.status}]${x.prazo ? ` — prazo ${x.prazo}` : ""}`);
  return linhas.join("\n");
}

/** Campanhas/ativos: o que está NO AR agora + histórico com a linhagem. */
function montarAtivos(assets: AssetRow[]): string {
  if (!assets?.length) return "";
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ativas = assets.filter((a) => a.status === "ativa");
  const outras = assets.filter((a) => a.status !== "ativa");
  const linhas = ["", "CAMPANHAS / ATIVOS DO CLIENTE (estado real — base para dizer o que está no ar):"];
  if (ativas.length) {
    linhas.push("No ar agora:");
    for (const a of ativas) linhas.push(`  - ${a.titulo}${a.tipo !== "campanha" ? ` (${a.tipo})` : ""}${a.descricao ? ` — ${a.descricao}` : ""}`);
  } else {
    linhas.push("No ar agora: nenhuma campanha ativa.");
  }
  if (outras.length) {
    linhas.push("Histórico (NÃO estão no ar):");
    for (const a of outras) {
      const novo = a.substituida_por ? byId.get(a.substituida_por) : null;
      const rep = novo ? ` → substituída por "${novo.titulo}"` : "";
      linhas.push(`  - ${a.titulo} [${a.status}]${rep}${a.descricao ? ` — ${a.descricao}` : ""}`);
    }
  }
  return linhas.join("\n");
}

function montarChecklist(tasks: TaskRow[], fase: Fase): string {
  if (!tasks?.length) return "";
  const porSemana = new Map<number, TaskRow[]>();
  for (const t of tasks) {
    if (!porSemana.has(t.semana)) porSemana.set(t.semana, []);
    porSemana.get(t.semana)!.push(t);
  }
  const titulo = fase === "manutencao"
    ? "HISTÓRICO DE IMPLANTAÇÃO (onboarding já concluído — apenas referência; o foco agora são campanhas e demandas):"
    : "ANDAMENTO DO CONTRATO (checklist — [x] já feito, [ ] pendente):";
  const linhas = ["", titulo];
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
          "FASE DO CONTRATO: no Onboarding, priorize o cronograma/checklist de implantação. Na Manutenção, o cronograma é apenas histórico — " +
          "priorize as campanhas no ar e as demandas em aberto.\n\n" +
          "CAMPANHAS/ATIVOS: a seção de campanhas mostra o que está NO AR agora e o histórico. Se perguntarem o que está rodando, baseie-se nas " +
          "campanhas com status ATIVA; se perguntarem por uma campanha antiga, explique o status (pausada/substituída) e, se houver, qual a substituiu. " +
          "NUNCA afirme que uma campanha está ativa se ela foi pausada, encerrada ou substituída.\n\n" +
          "DEMANDAS AVULSAS: se o cliente pedir uma arte específica, uma alteração ou uma tarefa pontual, CONFIRME que vai providenciar e informe um prazo " +
          "aproximado de entrega (poucos dias). A demanda é registrada e acompanhada internamente — fale com naturalidade, sem citar 'sistema' ou 'banco de dados'.\n\n" +
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

interface NovaDemanda { titulo: string; descricao: string; prazo_dias: number }
interface AtivoAprendido { titulo: string; tipo: string; status: string; substitui_titulo: string; descricao: string }
interface Aprendizado { tarefas_concluidas: string[]; memorias: { chave: string; valor: string }[]; resumo: string; demandas: NovaDemanda[]; ativos: AtivoAprendido[] }

async function aprenderDaConversa(
  hist: HistRow[], tarefas: TaskRow[], memoriaAtual: { chave: string; valor: string }[], resumoAtual: string,
  demandasAbertas: { titulo: string }[], ativosAtuais: AssetRow[],
): Promise<Aprendizado | null> {
  const tasksTxt = tarefas.map((t) => `- ${t.task_key ?? ""} — ${t.titulo} — ${t.done ? "feito" : "pendente"}`).join("\n");
  const memTxt = memoriaAtual.length ? memoriaAtual.map((m) => `- ${m.chave}: ${m.valor}`).join("\n") : "(vazio)";
  const demTxt = demandasAbertas.length ? demandasAbertas.map((d) => `- ${d.titulo}`).join("\n") : "(nenhuma)";
  const ativTxt = ativosAtuais.length ? ativosAtuais.map((a) => `- ${a.titulo} [${a.status}]`).join("\n") : "(nenhum)";
  const histTxt = hist.map((m) => `${m.role === "model" ? "Alfred" : (m.is_team ? `[Equipe ${m.sender_name || ""}]` : (m.sender_name || "Cliente"))}: ${m.body}`).join("\n");

  const sys =
    "Você analisa a conversa de um grupo de WhatsApp de um cliente da agência e APRENDE com ela. Identifique de forma autônoma: " +
    "(1) tarefas do checklist concluídas AGORA — use EXATAMENTE as task_key da lista; só marque o que ficou claramente pronto " +
    "(ex.: alguém diz 'segue a identidade visual' => identidade_visual). " +
    "(2) dados operacionais/sensíveis para guardar (senhas, logins, @ do Instagram, links, orçamento, decisões, datas). Chaves curtas em snake_case. Atualize valores. " +
    "(3) um RESUMO consolidado e enxuto (~5 linhas) com a ESSÊNCIA do cliente, evoluindo o anterior. " +
    "(4) NOVAS demandas avulsas pedidas pelo CLIENTE no chat (arte específica, alteração, pedido pontual) que NÃO estejam na lista de demandas abertas e ainda não tenham sido registradas. " +
    "Para cada nova demanda: titulo curto, descricao objetiva e prazo_dias (prazo de entrega em DIAS a partir de hoje — OBRIGATÓRIO, realista, normalmente entre 1 e 7). Não invente demandas; só registre pedidos reais e novos. " +
    "(5) MUDANÇAS em CAMPANHAS/ATIVOS narradas na conversa (subiu/ativou uma campanha, pausou, encerrou, ou substituiu uma campanha por outra). " +
    "Para cada mudança: titulo (nome da campanha/criativo), tipo (campanha|criativo|anuncio|outro), status FINAL (ativa|pausada|encerrada|substituida), " +
    "substitui_titulo (se esta campanha substitui uma já existente, escreva o nome dela; senão deixe vazio) e descricao curta. " +
    "Compare com a lista de ativos atuais e só reporte o que MUDOU ou é novo — não repita itens que já estão iguais. " +
    "Sem novidade: listas vazias e repita o resumo.";

  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text:
      `CHECKLIST (task_key — título — estado):\n${tasksTxt}\n\nMEMÓRIA ATUAL:\n${memTxt}\n\nDEMANDAS AVULSAS JÁ ABERTAS (não repita):\n${demTxt}\n\nCAMPANHAS/ATIVOS ATUAIS (titulo [status] — só reporte mudanças):\n${ativTxt}\n\nRESUMO ATUAL:\n${resumoAtual || "(vazio)"}\n\nCONVERSA RECENTE:\n${histTxt}` }] }],
    generationConfig: {
      temperature: 0, maxOutputTokens: 1100, thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          tarefas_concluidas: { type: "ARRAY", items: { type: "STRING" } },
          memorias: { type: "ARRAY", items: { type: "OBJECT", properties: { chave: { type: "STRING" }, valor: { type: "STRING" } }, required: ["chave", "valor"] } },
          resumo: { type: "STRING" },
          demandas: { type: "ARRAY", items: { type: "OBJECT", properties: { titulo: { type: "STRING" }, descricao: { type: "STRING" }, prazo_dias: { type: "INTEGER" } }, required: ["titulo", "prazo_dias"] } },
          ativos: { type: "ARRAY", items: { type: "OBJECT", properties: { titulo: { type: "STRING" }, tipo: { type: "STRING" }, status: { type: "STRING" }, substitui_titulo: { type: "STRING" }, descricao: { type: "STRING" } }, required: ["titulo", "status"] } },
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
      demandas: Array.isArray(parsed?.demandas) ? parsed.demandas : [],
      ativos: Array.isArray(parsed?.ativos) ? parsed.ativos : [],
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
  handoff_ativo: boolean;        // true = espera a equipe (cron); false = responde na hora
  team_cooldown_min: number;
  intervene_after_min: number;
  dmin: number;
  dmax: number;
}
export interface Grupo {
  id: string; user_id: string; client_name: string; remote_jid: string;
  evolution_instance: string | null; last_learned_at: string | null;
  created_at: string | null; fase_override: string | null;
}
type HistMsg = HistRow & { created_at: string };
interface DemandaRow { titulo: string; status: string; prazo: string | null }
// deno-lint-ignore no-explicit-any
interface Carga { hist: HistMsg[]; ctx: any; tarefas: TaskRow[]; mem: { chave: string; valor: string }[]; demandas: DemandaRow[]; assets: AssetRow[] }

/** Carrega histórico + contexto + checklist + memória + demandas + ativos. */
async function carregar(supabase: SupabaseClient, groupId: string): Promise<Carga> {
  const { data: msgsDesc } = await supabase
    .from("alfred_messages")
    .select("role, sender_name, body, created_at, is_team")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(HISTORICO);
  const hist = ((msgsDesc as HistMsg[]) ?? []).reverse();
  const [{ data: ctx }, { data: tasks }, { data: memorias }, { data: dem }, { data: ats }] = await Promise.all([
    supabase.from("alfred_context").select("empresa_dados, regras_atendimento, drive_link, cronograma, financeiro, observacoes, resumo").eq("group_id", groupId).maybeSingle(),
    supabase.from("alfred_tasks").select("semana, task_key, titulo, done").eq("group_id", groupId).order("semana").order("ordem"),
    supabase.from("alfred_memory").select("chave, valor").eq("group_id", groupId),
    supabase.from("alfred_demands").select("titulo, status, prazo").eq("group_id", groupId).neq("status", "concluida"),
    supabase.from("alfred_assets").select("id, titulo, tipo, status, descricao, substituida_por").eq("group_id", groupId).neq("status", "encerrada").order("updated_at", { ascending: false }).limit(40),
  ]);
  return {
    hist, ctx: ctx ?? null,
    tarefas: (tasks as TaskRow[]) ?? [],
    mem: (memorias as { chave: string; valor: string }[]) ?? [],
    demandas: (dem as DemandaRow[]) ?? [],
    assets: (ats as AssetRow[]) ?? [],
  };
}

/** Gera e envia a resposta ao cliente (sem gating). Retorna o status. */
async function gerarResposta(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg, carga: Carga): Promise<string> {
  if (!GEMINI_API_KEY) return "sem GEMINI_API_KEY";
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return "evolution não configurada";

  const fase = faseEfetiva(grupo.created_at, grupo.fase_override);
  const contexto = montarContexto(carga.ctx, grupo.client_name, fase)
    + montarMemoria(carga.mem)
    + montarAtivos(carga.assets)
    + montarDemandas(carga.demandas)
    + montarChecklist(carga.tarefas, fase);
  const contents = montarContents(carga.hist);
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

/** Resposta IMEDIATA (modo handoff desligado): chamada pelo webhook. */
export async function responderAgora(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg): Promise<string> {
  const carga = await carregar(supabase, grupo.id);
  if (carga.hist.length === 0) return "vazio";
  return gerarResposta(supabase, grupo, cfg, carga);
}

/**
 * Cron: (1) consolida aprendizado quando a conversa assentou (sempre) e
 * (2) SÓ no modo handoff, intervém se a equipe não resolveu no prazo.
 */
export async function processarGrupoTick(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg): Promise<string> {
  const nowMs = Date.now();
  const carga = await carregar(supabase, grupo.id);
  if (carga.hist.length === 0) return "vazio";
  const { hist } = carga;

  const ultima = hist[hist.length - 1];
  const lastMsgMs = new Date(ultima.created_at).getTime();

  // (1) APRENDIZADO — sempre (independe do modo), quando há novidade e assentou (>2 min).
  const learnedMs = grupo.last_learned_at ? new Date(grupo.last_learned_at).getTime() : 0;
  if (lastMsgMs > learnedMs && nowMs - lastMsgMs >= 120_000) {
    const aprend = await aprenderDaConversa(hist, carga.tarefas, carga.mem, carga.ctx?.resumo ?? "", carga.demandas, carga.assets);
    if (aprend) {
      const validKeys = new Set(carga.tarefas.map((t) => t.task_key).filter(Boolean));
      const agora = new Date().toISOString();
      const hoje = agora.slice(0, 10);
      for (const key of aprend.tarefas_concluidas) {
        if (validKeys.has(key)) await supabase.from("alfred_tasks").update({ done: true, done_at: agora }).eq("group_id", grupo.id).eq("task_key", key).eq("done", false);
      }
      for (const m of aprend.memorias) {
        if (!m?.chave || !m?.valor) continue;
        await supabase.from("alfred_memory").upsert({ user_id: grupo.user_id, group_id: grupo.id, chave: String(m.chave).slice(0, 80), valor: String(m.valor).slice(0, 2000), updated_at: agora }, { onConflict: "group_id,chave" });
      }
      if (aprend.resumo?.trim()) await supabase.from("alfred_context").upsert({ user_id: grupo.user_id, group_id: grupo.id, resumo: aprend.resumo.trim() }, { onConflict: "group_id" });

      // Novas demandas avulsas -> Kanban, com PRAZO obrigatório (dias a partir de hoje).
      const abertasTit = new Set(carga.demandas.map((d) => d.titulo.trim().toLowerCase()));
      for (const d of aprend.demandas) {
        const titulo = String(d?.titulo ?? "").trim();
        if (!titulo || abertasTit.has(titulo.toLowerCase())) continue; // dedup
        const dias = Math.min(60, Math.max(1, Math.floor(Number(d?.prazo_dias) || 3)));
        const prazo = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
        await supabase.from("alfred_demands").insert({
          user_id: grupo.user_id, group_id: grupo.id, titulo: titulo.slice(0, 120),
          descricao: (String(d?.descricao ?? "").trim() || null), prazo, origem: "chat", status: "pendente",
        });
        abertasTit.add(titulo.toLowerCase());
      }

      // Campanhas/ativos: cria/atualiza estado e resolve a substituição (linhagem).
      const tiposOk = new Set(["campanha", "criativo", "anuncio", "outro"]);
      const statusOk = new Set(["ativa", "pausada", "encerrada", "substituida"]);
      const porTitulo = new Map(carga.assets.map((a) => [a.titulo.trim().toLowerCase(), a]));
      for (const a of aprend.ativos) {
        const titulo = String(a?.titulo ?? "").trim();
        if (!titulo) continue;
        const tipo = tiposOk.has(String(a?.tipo)) ? String(a.tipo) : "campanha";
        const status = statusOk.has(String(a?.status)) ? String(a.status) : "ativa";
        const descricao = String(a?.descricao ?? "").trim() || null;
        const fimDeVida = status === "encerrada" || status === "substituida";
        const key = titulo.toLowerCase();

        let assetId: string | null = null;
        const existente = porTitulo.get(key);
        if (existente) {
          await supabase.from("alfred_assets").update({
            tipo, status, ...(descricao ? { descricao } : {}), ...(fimDeVida ? { ended_at: hoje } : {}),
          }).eq("id", existente.id);
          existente.status = status;
          assetId = existente.id;
        } else {
          const { data: ins } = await supabase.from("alfred_assets").insert({
            user_id: grupo.user_id, group_id: grupo.id, titulo: titulo.slice(0, 120), tipo, status, descricao,
            origem: "chat", started_at: status === "ativa" ? hoje : null, ...(fimDeVida ? { ended_at: hoje } : {}),
          }).select("id").single();
          assetId = ins?.id ?? null;
          if (assetId) porTitulo.set(key, { id: assetId, titulo, tipo, status, descricao, substituida_por: null });
        }

        // Substituição: a campanha antiga vira "substituida" e aponta p/ a nova.
        const subKey = String(a?.substitui_titulo ?? "").trim().toLowerCase();
        if (subKey && subKey !== key && assetId) {
          const antiga = porTitulo.get(subKey);
          if (antiga && antiga.status !== "substituida") {
            await supabase.from("alfred_assets").update({ status: "substituida", substituida_por: assetId, ended_at: hoje }).eq("id", antiga.id);
            antiga.status = "substituida";
          }
        }
      }
    }
    await supabase.from("alfred_groups").update({ last_learned_at: new Date(lastMsgMs).toISOString() }).eq("id", grupo.id);
  }

  // (2) RESPOSTA — só no modo handoff (no imediato, o webhook já respondeu).
  if (!cfg.handoff_ativo) return "modo imediato";

  const clienteFalouPorUltimo = ultima.role === "user" && !ultima.is_team;
  if (!clienteFalouPorUltimo) return "sem necessidade";
  const lastTeamMs = Math.max(0, ...hist.filter((m) => m.is_team).map((m) => new Date(m.created_at).getTime()));
  const sinceClient = nowMs - lastMsgMs;
  const sinceTeam = lastTeamMs ? nowMs - lastTeamMs : Infinity;
  if (sinceClient < cfg.intervene_after_min * 60_000) return "aguardando prazo";
  if (sinceTeam < cfg.team_cooldown_min * 60_000) return "equipe ativa (cooldown)";

  return gerarResposta(supabase, grupo, cfg, carga);
}
