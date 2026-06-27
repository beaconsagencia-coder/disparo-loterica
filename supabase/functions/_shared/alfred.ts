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
const PROATIVO_DIAS = new Set([1, 2, 3, 4, 5]); // acompanhamento proativo: seg a sex (0=dom..6=sáb)

// Regra de naturalidade aplicada a TODA mensagem ao cliente (resposta, proativo, repasse).
const REGRA_NOME_NEGOCIO =
  "TRATAMENTO DO NEGÓCIO (naturalidade — regra importante): você está PROIBIDO de usar o nome comercial completo do cliente nas frases " +
  "(ex.: 'Lotérica Money Money', 'Lotérica Lírio', 'Lotérica São José') — soa robótico e ninguém da equipe fala assim. " +
  "Para se referir ao negócio, use apenas 'a lotérica', 'a sua lotérica' ou 'o projeto de vocês'. " +
  "Em cumprimentos use 'Olá!', 'Bom dia, pessoal' ou o PRIMEIRO NOME da pessoa (se ela se identificou). " +
  "Ex. CERTO: 'Que ótima notícia, pessoal!' / 'O projeto de vocês está avançando conforme o cronograma' / " +
  "'já confirmei com a equipe e não houve nenhuma publicação no Instagram da lotérica'. " +
  "Ex. ERRADO: 'Olá, Lotérica Lírio!' / 'O projeto da Lotérica Money Money está avançando'.";

const REGRA_ESTILO =
  "ESTILO (ANTI-ROBÔ — regra absoluta): escreva como um atendente humano real no WhatsApp, NUNCA como relatório ou texto de IA. " +
  "PROIBIDO: (1) listas/bullets de qualquer tipo (asterisco, hífen ou número) para enumerar tarefas/itens; " +
  "(2) cabeçalhos/rótulos em negrito seguidos de dois-pontos (ex.: '*Já fizemos:*', '*Hoje teremos:*'); (3) markdown em geral (nada de *, _, #). " +
  "Una as informações em frases CONVERSACIONAIS, em parágrafo simples e direto, sem se estender. " +
  "Ex. ERRADO: '*Já fizemos:* * a identidade visual * validamos a conta do Facebook'. " +
  "Ex. CERTO: 'Pessoal, passando pra atualizar que a identidade visual já tá pronta e a conta do Facebook também já foi validada pra gente rodar o tráfego.'";

const REGRA_SAIDA =
  "SAÍDA (PROIBIDO PENSAR EM VOZ ALTA — regra absoluta): gere APENAS a mensagem final que será enviada ao cliente. " +
  "É ESTRITAMENTE PROIBIDO incluir qualquer análise do cenário, reflexão, resumo do problema, plano do que você vai fazer, " +
  "ou comentário em 3ª pessoa sobre o cliente (ex.: 'O cliente está reclamando...', 'Não vou alterar a estratégia', 'Não pausar as campanhas, apenas tranquilizar'). " +
  "Nada de raciocínio antes da resposta — a PRIMEIRA palavra que você escrever já é a mensagem ao cliente. " +
  "Ex. PROIBIDO: 'O cliente está reclamando da qualidade. Não vou alterar a estratégia. Olá, entendo sua percepção...'. " +
  "Ex. CERTO: 'Entendo sua percepção, mas como as campanhas subiram há pouco tempo, estamos exatamente na fase de otimização...'.";

export type Fase = "onboarding" | "manutencao";

/** Fase efetiva: override manual, ou automática pela idade do grupo. */
export function faseEfetiva(createdAt: string | null, override: string | null): Fase {
  if (override === "onboarding" || override === "manutencao") return override;
  const ms = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
  return ms / 86_400_000 >= FASE_THRESHOLD_DIAS ? "manutencao" : "onboarding";
}

export interface HistRow { id?: string; role: string; sender_name: string | null; body: string; is_team?: boolean; quoted_body?: string | null }

/** Nome exibível do remetente: descarta perfis sem nome real (só emoji/símbolos/números).
 *  O refino fino (primeiro nome, empresa, frase) fica com o modelo via prompt. */
function nomeExibivel(nome: string | null): string | null {
  const n = (nome ?? "").trim();
  if (!n) return null;
  if (!/\p{L}/u.test(n)) return null; // precisa ter ao menos uma letra
  return n;
}

/** Marca uma fala que é resposta a uma mensagem citada (reply do WhatsApp). */
function refResposta(quoted?: string | null): string {
  const q = (quoted ?? "").trim().replace(/\s+/g, " ");
  if (!q) return "";
  return ` (em resposta a: "${q.length > 140 ? q.slice(0, 140) + "…" : q}")`;
}
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

export interface PropostaRow {
  valor_mensal: number | null; valor_setup: number | null; vigencia_meses: number | null;
  forma_pagamento: string | null; entregaveis: string[] | null; observacoes: string | null;
}
/** Proposta/plano contratado: valores e entregáveis (base p/ falar de preço). */
function montarProposta(p: PropostaRow | null): string {
  if (!p) return "";
  const entreg = Array.isArray(p.entregaveis) ? p.entregaveis.filter((e) => String(e).trim()) : [];
  if (!p.valor_mensal && !p.valor_setup && !p.vigencia_meses && !p.forma_pagamento && !entreg.length && !p.observacoes) return "";
  const brl = (v: number) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const linhas = ["", "PROPOSTA / PLANO CONTRATADO (base para falar de valores e do que está incluído):"];
  if (p.valor_mensal) linhas.push(`- Valor mensal: ${brl(p.valor_mensal)}`);
  if (p.valor_setup) linhas.push(`- Setup/entrada: ${brl(p.valor_setup)}`);
  if (p.vigencia_meses) linhas.push(`- Vigência: ${p.vigencia_meses} meses`);
  if (p.forma_pagamento) linhas.push(`- Forma de pagamento: ${p.forma_pagamento}`);
  if (entreg.length) {
    linhas.push("- Entregáveis incluídos no plano:");
    for (const e of entreg) linhas.push(`  - ${e}`);
  }
  if (p.observacoes) linhas.push(`- Observações da proposta: ${p.observacoes}`);
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
    const quem = m.is_team ? `[Equipe${m.sender_name ? ` ${m.sender_name}` : ""}]` : (nomeExibivel(m.sender_name) || "Cliente");
    const texto = role === "user" ? `${quem}${refResposta(m.quoted_body)}: ${m.body}` : m.body;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${texto}`;
    else out.push({ role, parts: [{ text: texto }] });
  }
  return out;
}

async function chamarGemini(systemPrompt: string, contexto: string, contents: { role: "user" | "model"; parts: { text: string }[] }[], baseConhecimento: string): Promise<string> {
  const body = {
    system_instruction: {
      parts: [{
        text:
          `${systemPrompt}\n\n` +
          (baseConhecimento.trim()
            ? `BASE DE CONHECIMENTO — BOLÃO GESTOR (o SaaS gratuito da agência; use para tirar dúvidas do cliente sobre o sistema):\n${baseConhecimento.trim()}\n\n`
            : "") +
          `CONTEXTO DO CLIENTE (use para responder):\n${contexto}\n\n` +
          "VOCÊ RESPONDE APENAS AO CLIENTE. Mensagens marcadas como [Equipe ...] são da equipe da agência — leia para ter contexto, " +
          "mas NUNCA responda a elas. Se a última mensagem for da equipe, ou se o pedido do cliente já tiver sido resolvido, ou se a " +
          "última mensagem do cliente não pedir resposta (ex.: 'ok', 'obrigado', encerramento), responda com STRING VAZIA (não envie nada).\n\n" +
          "JAMAIS escreva anotações internas, análises ou rótulos entre colchetes como '[Equipe ...]', '[Cliente ...]', '[imagem ...]', nem narre o que o " +
          "cliente está fazendo ou o que você pretende fazer. Esses rótulos existem só para o SEU entendimento e NUNCA podem ser enviados ao grupo — " +
          "mande exclusivamente a mensagem final ao cliente, como uma pessoa real. Sobre dados sensíveis (senhas, logins, @): são dados do próprio cliente — " +
          "se ELE pedir, pode informar normalmente; apenas não fique repetindo esses dados sem necessidade quando ninguém pediu.\n\n" +
          "GUARDRAIL ABSOLUTO — O QUE VOCÊ NÃO RESOLVE: nos casos abaixo é TERMINANTEMENTE PROIBIDO tentar resolver, opinar, inventar regras/prazos/valores, " +
          "criar 'setores' inexistentes (ex.: 'setor financeiro'), ou fingir que sabe/anotou/registrou algo. NÃO invente NADA, NUNCA. Os casos:\n" +
          "(1) FINANCEIRO — boletos, descontos, cancelamentos, taxas, valores/datas/formas de pagamento, termos de contrato;\n" +
          "(2) CONTEXTO QUE VOCÊ NÃO TEM — qualquer menção a reuniões, calls, áudios, prints ou combinados feitos FORA deste chat (ex.: 'a call de sexta', " +
          "'o áudio de ontem', 'o que combinei com o João'); JAMAIS diga 'já anotei', 'já registrei', 'pode deixar que vi' — você NÃO tem acesso a isso;\n" +
          "(3) TÉCNICO fora da BASE DE CONHECIMENTO — integrações de API, DNS, configurações avançadas, qualquer coisa que não esteja explícita na base;\n" +
          "(4) ESTRATÉGIA / APROVAÇÃO SUBJETIVA — mudanças de campanha, decisões de estratégia, aprovações que dependem de julgamento.\n" +
          "Nesses casos, o operador responsável é acionado em paralelo, e a sua ÚNICA resposta ao grupo deve ser CURTÍSSIMA (1 frase), apenas avisando que o " +
          "responsável já vai atender — ex.: 'Vou chamar o responsável pra te atender sobre isso, só um instante!'. SEM explicar, SEM detalhar, SEM opinião, SEM prazo.\n\n" +
          "USO DO CHECKLIST/MEMÓRIA: baseie-se no andamento e nas informações salvas; nunca diga que algo está pronto se está pendente; " +
          "se uma etapa pendente depende do cliente (criativo, conta de Facebook, orçamento), solicite a ele.\n\n" +
          "FASE DO CONTRATO: no Onboarding, priorize o cronograma/checklist de implantação. Na Manutenção, o cronograma é apenas histórico — " +
          "priorize as campanhas no ar e as demandas em aberto.\n\n" +
          "CAMPANHAS/ATIVOS: a seção de campanhas mostra o que está NO AR agora e o histórico. Se perguntarem o que está rodando, baseie-se nas " +
          "campanhas com status ATIVA; se perguntarem por uma campanha antiga, explique o status (pausada/substituída) e, se houver, qual a substituiu. " +
          "NUNCA afirme que uma campanha está ativa se ela foi pausada, encerrada ou substituída.\n\n" +
          "PROPOSTA/PLANO: você tem o plano contratado do cliente (valor, vigência, entregáveis). Use-o para responder quanto ele paga e o que está " +
          "incluído. NUNCA invente valores nem prometa algo fora do plano. Se ele pedir algo que NÃO está nos entregáveis, explique com gentileza que " +
          "não faz parte do pacote atual e que dá pra orçar à parte.\n\n" +
          "SUPORTE AO SISTEMA (Bolão Gestor): se o cliente tiver dúvida sobre o sistema/SaaS, responda como especialista usando a BASE DE CONHECIMENTO acima — " +
          "diga o caminho na tela (ex.: 'Atendimento → Automação → ...') e os passos curtos. Se algo NÃO estiver na base, não invente; oriente a conferir a tela " +
          "ou falar com o suporte. Em dúvidas de premiação, reforce conferir o comprovante oficial antes de pagar.\n\n" +
          "DEMANDAS AVULSAS: se o cliente pedir uma arte específica, uma alteração ou uma tarefa pontual, CONFIRME que vai providenciar e informe um prazo " +
          "aproximado de entrega (poucos dias). A demanda é registrada e acompanhada internamente — fale com naturalidade, sem citar 'sistema' ou 'banco de dados'.\n\n" +
          "NOME DO CLIENTE (filtro de bom senso): o rótulo antes de cada fala é o nome do PERFIL de WhatsApp de quem falou — use com cuidado ao se dirigir ao cliente. " +
          "(a) se vier misturado com cargo/local (ex.: 'Luiza - Atendente', 'João Silva - Loja'), use só o PRIMEIRO NOME da pessoa ('Luiza', 'João'); " +
          "(b) NÃO use como nome se for só emoji, frase aleatória/religiosa (ex.: 'Deus seja louvado') ou nome de empresa (ex.: 'Lotérica São José'); " +
          "(c) se não for claramente um nome próprio real, ou na dúvida, OMITA o nome e use saudação neutra (ex.: 'Olá! Como posso ajudar?'). " +
          "Nunca chame o cliente por algo que não seja o nome próprio dele.\n\n" +
          REGRA_NOME_NEGOCIO + "\n\n" + REGRA_ESTILO + "\n\n" + REGRA_SAIDA + "\n\n" +
          "FORMATO (REGRA CRÍTICA — siga à risca): fale como uma pessoa REAL da equipe no WhatsApp — empático e FIRME, mas acima de tudo OBJETIVO e curto. " +
          "Responda no MENOR número de mensagens possível: idealmente 1, no máximo 2 balões (um 3º só se for realmente inevitável). " +
          "Vá DIRETO ao ponto: NÃO repita a mesma ideia de formas diferentes, não encha de justificativas e NÃO detalhe semana por semana a menos que perguntem. " +
          "Cada balão tem 1 a 3 frases curtas. Se mandar 2 balões, separe-os com UMA LINHA EM BRANCO entre eles. " +
          "Exemplo do tom e do tamanho ideais (este é o alvo — note como é enxuto):\n" +
          "Entendo a urgência, Pedro! Mas a gente precisa seguir o cronograma certinho pra não tomar bloqueio e prejudicar suas campanhas.\n\n" +
          "Essa semana o foco é a identidade visual. Fica tranquilo que deixamos tudo pronto a tempo pra aproveitar a data com segurança. Confia no processo!\n" +
          "Nunca use prefixo, nome ou 'Alfred:'; sem markdown; sem emojis em excesso.\n\n" +
          "SAÍDA: devolva um JSON com o campo 'mensagem' contendo APENAS o texto final ao cliente (balões separados por LINHA EM BRANCO). " +
          "Pense internamente o quanto precisar para perguntas complexas; esse raciocínio NUNCA entra no campo 'mensagem'.",
      }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,                  // espaço p/ pensar (privado) + responder
      thinkingConfig: { thinkingBudget: -1 }, // pensamento DINÂMICO: mais em perguntas complexas, ~0 nas simples
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { mensagem: { type: "STRING" } }, required: ["mensagem"] },
    },
  };
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) { console.error("[alfred] gemini", res.status, (await res.text()).slice(0, 200)); return ""; }
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const raw = ((data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
  // Saída ESTRUTURADA: só o campo "mensagem" é enviado — qualquer raciocínio fica fora.
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.mensagem ?? "").trim();
  } catch {
    return raw; // fallback defensivo caso não venha JSON
  }
}

const MAX_MSGS = 3;
/**
 * Quebra a resposta do modelo em poucos "balões" (estilo WhatsApp), priorizando
 * concisão. Separa por PARÁGRAFO (linha em branco), "---" ou marcadores
 * [MENSAGEM]/[MSG] — NÃO por quebra de linha simples, para uma frase poder
 * ocupar 1-2 linhas no mesmo balão sem virar mensagens soltas. Limpa prefixo
 * "Alfred:" e aspas. Se passar do teto, NÃO descarta: junta o excedente.
 */
function fracionarResposta(raw: string): string[] {
  const txt = (raw ?? "").trim();
  if (!txt) return [];
  const limpar = (s: string) => s
    .replace(/^\s*alfred\s*:\s*/i, "")
    // remove rótulos/anotações internas vazadas no início ([Equipe ...], [imagem ...],
    // [Cliente ...], etc.) — o modelo às vezes imita o formato do histórico.
    .replace(/^(?:\s*\[[^\]]*\]\s*:?\s*)+/g, "")
    .replace(/^["“”'\s]+|["“”'\s]+$/g, "")
    .trim();
  const partes = txt
    .split(/(?:\[\s*(?:mensagem|msg)\s*\]|-{3,}|\n[ \t]*\n)+/i)
    .map(limpar)
    .filter(Boolean);
  if (partes.length <= MAX_MSGS) return partes;
  const head = partes.slice(0, MAX_MSGS - 1);
  const tail = partes.slice(MAX_MSGS - 1).join("\n\n"); // preserva tudo
  return [...head, tail];
}

/** Atraso de digitação por mensagem (estilo SDR): proporcional ao tamanho. */
function delayDigitacao(texto: string, cfg: AlfredCfg): number {
  const seg = Math.min(cfg.dmax, Math.max(cfg.dmin, texto.length / 25 + Math.random() * 1.5));
  return Math.round(seg * 1000);
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
  const histTxt = hist.map((m) => {
    const quem = m.role === "model" ? "Alfred" : (m.is_team ? `[Equipe ${m.sender_name || ""}]` : (nomeExibivel(m.sender_name) || "Cliente"));
    return `${quem}${m.role === "model" ? "" : refResposta(m.quoted_body)}: ${m.body}`;
  }).join("\n");

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
  base_conhecimento: string | null; // base global do SaaS (Bolão Gestor)
  operator_number: string | null;   // DM do operador humano (escalonamento)
  evolution_instance: string | null;
  handoff_ativo: boolean;        // true = espera a equipe (cron); false = responde na hora
  team_cooldown_min: number;
  intervene_after_min: number;
  proactive_ativo: boolean;      // acompanhamento diário proativo
  proactive_hora: number;        // hora (0-23, Brasília) do contato diário
  dmin: number;
  dmax: number;
}
export interface Grupo {
  id: string; user_id: string; client_name: string; remote_jid: string;
  evolution_instance: string | null; last_learned_at: string | null;
  created_at: string | null; fase_override: string | null;
  last_proactive_at?: string | null;
}
type HistMsg = HistRow & { created_at: string };
interface DemandaRow { titulo: string; status: string; prazo: string | null }
// deno-lint-ignore no-explicit-any
interface Carga { hist: HistMsg[]; ctx: any; tarefas: TaskRow[]; mem: { chave: string; valor: string }[]; demandas: DemandaRow[]; assets: AssetRow[]; proposta: PropostaRow | null }

/** Carrega histórico + contexto + checklist + memória + demandas + ativos + proposta. */
async function carregar(supabase: SupabaseClient, groupId: string): Promise<Carga> {
  const { data: msgsDesc } = await supabase
    .from("alfred_messages")
    .select("id, role, sender_name, body, created_at, is_team, quoted_body")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(HISTORICO);
  const hist = ((msgsDesc as HistMsg[]) ?? []).reverse();
  const [{ data: ctx }, { data: tasks }, { data: memorias }, { data: dem }, { data: ats }, { data: prop }] = await Promise.all([
    supabase.from("alfred_context").select("empresa_dados, regras_atendimento, drive_link, cronograma, financeiro, observacoes, resumo").eq("group_id", groupId).maybeSingle(),
    supabase.from("alfred_tasks").select("semana, task_key, titulo, done").eq("group_id", groupId).order("semana").order("ordem"),
    supabase.from("alfred_memory").select("chave, valor").eq("group_id", groupId),
    supabase.from("alfred_demands").select("titulo, status, prazo").eq("group_id", groupId).neq("status", "concluida"),
    supabase.from("alfred_assets").select("id, titulo, tipo, status, descricao, substituida_por").eq("group_id", groupId).neq("status", "encerrada").order("updated_at", { ascending: false }).limit(40),
    supabase.from("alfred_proposals").select("valor_mensal, valor_setup, vigencia_meses, forma_pagamento, entregaveis, observacoes").eq("group_id", groupId).maybeSingle(),
  ]);
  return {
    hist, ctx: ctx ?? null,
    tarefas: (tasks as TaskRow[]) ?? [],
    mem: (memorias as { chave: string; valor: string }[]) ?? [],
    demandas: (dem as DemandaRow[]) ?? [],
    assets: (ats as AssetRow[]) ?? [],
    proposta: (prop as PropostaRow | null) ?? null,
  };
}

/** Gera e envia a resposta ao cliente (sem gating). Retorna o status. */
async function gerarResposta(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg, carga: Carga): Promise<string> {
  if (!GEMINI_API_KEY) return "sem GEMINI_API_KEY";
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return "evolution não configurada";

  const fase = faseEfetiva(grupo.created_at, grupo.fase_override);
  const contexto = montarContexto(carga.ctx, grupo.client_name, fase)
    + montarProposta(carga.proposta)
    + montarMemoria(carga.mem)
    + montarAtivos(carga.assets)
    + montarDemandas(carga.demandas)
    + montarChecklist(carga.tarefas, fase);
  const contents = montarContents(carga.hist);
  if (contents.length === 0) return "sem histórico";

  // TRAVA ATÔMICA DE RESPOSTA: só UMA execução responde por mensagem do cliente.
  // Reivindica a última mensagem do cliente marcando answered_at (nulo -> agora).
  // Quem não conseguir o UPDATE (já reivindicada) desiste — evita resposta dupla
  // por retry/debounce/duplo dispositivo. Feito ANTES do Gemini (poupa créditos).
  const ultimaUser = [...carga.hist].reverse().find((m) => m.role === "user" && m.id);
  if (ultimaUser?.id) {
    const { data: claim } = await supabase.from("alfred_messages")
      .update({ answered_at: new Date().toISOString() })
      .eq("id", ultimaUser.id).is("answered_at", null).select("id");
    if (!claim || claim.length === 0) return "já respondido (duplicado)";
  }

  const resposta = await chamarGemini(cfg.system_prompt, contexto, contents, cfg.base_conhecimento ?? "");
  const partes = fracionarResposta(resposta);
  if (partes.length === 0) return "sem resposta (não necessária)"; // o modelo decidiu não responder

  // Envia como VÁRIAS mensagens curtas em sequência (humano digitando no zap):
  // cada uma com seu próprio "digitando…" proporcional ao tamanho.
  let enviadas = 0;
  try {
    for (const parte of partes) {
      await enviarGrupo(instance, grupo.remote_jid, parte, delayDigitacao(parte, cfg));
      await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: parte });
      enviadas++;
    }
    // Escalonamento IMEDIATO: aciona o operador na hora (modo imediato).
    // No handoff, o cron cobre a escalação cedo (a cada 2 min).
    if (cfg.operator_number) {
      try {
        const esc = await classificarEscalacao(contents);
        if (esc) await criarEscalacao(supabase, grupo, cfg, esc);
      } catch (e) { console.error("[alfred] escalonamento:", e instanceof Error ? e.message : e); }
    }
    return "respondido";
  } catch (e) {
    console.error("[alfred] envio falhou:", e instanceof Error ? e.message : e);
    // Não enviou nada: libera a reivindicação p/ uma nova tentativa responder.
    if (enviadas === 0 && ultimaUser?.id) {
      await supabase.from("alfred_messages").update({ answered_at: null }).eq("id", ultimaUser.id);
    }
    return enviadas > 0 ? "parcial" : "falha ao enviar";
  }
}

// ---- Escalonamento ao operador humano (handoff por DM privada) -------
interface Escalacao { resumo: string; mensagem_operador: string }

/** Decide se a última interação do cliente exige uma AÇÃO do operador humano. */
async function classificarEscalacao(contents: { role: "user" | "model"; parts: { text: string }[] }[]): Promise<Escalacao | null> {
  if (!GEMINI_API_KEY || contents.length === 0) return null;
  const sys =
    "Você decide se a conversa deve ACIONAR o operador humano. ESCALE (escalar=true) SEMPRE que a conversa tocar em QUALQUER um destes temas — mesmo que o " +
    "cliente apenas mencione, pergunte ou peça:\n" +
    "(1) FINANCEIRO: boleto, desconto, cancelamento, taxa, valor/forma/data de pagamento, termos de contrato.\n" +
    "(2) CONTEXTO EXTERNO que o agente não tem: reuniões, calls, áudios, prints, conversas ou combinados feitos FORA deste chat (ex.: 'a call de sexta', " +
    "'o áudio de ontem', 'o que falei com o João').\n" +
    "(3) TÉCNICO fora da base de conhecimento: integração de API, DNS, configurações avançadas, qualquer pedido técnico não coberto pela base.\n" +
    "(4) ESTRATÉGIA / APROVAÇÃO subjetiva: mudança de campanha, decisão estratégica, aprovação que depende de julgamento humano.\n" +
    "TAMBÉM escale: testar acesso/credenciais; verificar/investigar/apurar algo numa conta ou plataforma (ex.: conta suspensa, quem postou um story). " +
    "NÃO escale apenas para: dúvidas simples já cobertas pela base de conhecimento, conversa/agradecimento, e pedidos de ARTE/MATERIAL/ALTERAÇÃO (isso é DEMANDA). " +
    "NA DÚVIDA, ESCALE. Se escalar, escreva mensagem_operador CURTA e direta (em nome do Alfred, 1ª pessoa) com o que o cliente pediu e o contexto/dados " +
    "necessários (logins, @, links, o que verificar); e resumo: um título curto.";
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents,
    generationConfig: {
      temperature: 0, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { escalar: { type: "BOOLEAN" }, resumo: { type: "STRING" }, mensagem_operador: { type: "STRING" } }, required: ["escalar"] },
    },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { console.error("[alfred] classificarEscalacao", res.status); return null; }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const txt = (data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "";
    const parsed = JSON.parse(txt);
    if (!parsed?.escalar) return null;
    const mo = String(parsed.mensagem_operador ?? "").trim();
    if (!mo) return null;
    return { resumo: (String(parsed.resumo ?? "").trim() || "Tarefa").slice(0, 200), mensagem_operador: mo.slice(0, 1500) };
  } catch (e) { console.error("[alfred] classificarEscalacao erro:", e instanceof Error ? e.message : e); return null; }
}

/** Cria a escalação e manda a DM ao operador (1 tarefa aberta por grupo). */
async function criarEscalacao(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg, esc: Escalacao): Promise<void> {
  const op = (cfg.operator_number ?? "").trim();
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!op || !instance || !ENV_EVO_URL || !ENV_EVO_KEY) return;
  // Dedup por TAREFA (não "1 por grupo"): evita repetir a MESMA escalação, mas
  // permite uma tarefa nova mesmo havendo outra antiga ainda aberta.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const novoN = norm(esc.resumo);
  const { data: abertas } = await supabase.from("alfred_escalations").select("resumo").eq("group_id", grupo.id).eq("status", "aberta");
  if ((abertas ?? []).some((a) => { const r = norm(String(a.resumo ?? "")); return !!r && (r === novoN || r.includes(novoN) || novoN.includes(r)); })) return;
  const dm = `[${grupo.client_name}] ${esc.mensagem_operador}`;
  const { data: ins } = await supabase.from("alfred_escalations").insert({
    user_id: grupo.user_id, group_id: grupo.id, resumo: esc.resumo, mensagem_operador: dm, status: "aberta",
  }).select("id").single();
  if (!ins) return;
  try { await enviarGrupo(instance, op, dm, 0); }
  catch (e) { console.error("[alfred] DM operador falhou:", e instanceof Error ? e.message : e); }
}

/** Compõe a mensagem ao CLIENTE repassando o retorno do operador.
 *  enviar=false quando o operador pede para NÃO mandar nada no grupo. */
async function comporRelay(cfg: AlfredCfg, resumo: string, pedido: string, retorno: string, _clientName: string): Promise<{ enviar: boolean; mensagem: string }> {
  if (!GEMINI_API_KEY) return { enviar: false, mensagem: "" };
  const sys = `${cfg.system_prompt}\n\nVocê (Alfred) pediu para a equipe/operador executar uma tarefa e recebeu o retorno dele. ` +
    "PRIMEIRO decida se deve enviar algo ao cliente agora: se o retorno indicar que NÃO é para mandar nada no grupo " +
    "(ex.: 'não precisa falar nada', 'já resolvi', 'deixa quieto', 'eu mesmo falo com ele', 'pode deixar que eu respondo', 'não manda nada', " +
    "'você já explicou o que devia'), então enviar=false e mensagem vazia. " +
    "Caso contrário, enviar=true e escreva em 'mensagem' a comunicação PARA O CLIENTE no grupo repassando o status de forma natural " +
    "(fale como a equipe — 'testamos', 'verificamos' — NUNCA mencione 'operador' nem que outra pessoa fez). " +
    "Curto, no máximo 2 balões separados por LINHA EM BRANCO, sem prefixo, sem markdown, sem rótulos entre colchetes.\n\n" +
    REGRA_NOME_NEGOCIO + "\n\n" + REGRA_ESTILO + "\n\n" + REGRA_SAIDA;
  const userTxt = `Tarefa: ${resumo}\nO que foi pedido: ${pedido}\nRetorno do operador: ${retorno}`;
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: userTxt }] }],
    generationConfig: {
      temperature: 0.6, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: -1 },
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { enviar: { type: "BOOLEAN" }, mensagem: { type: "STRING" } }, required: ["enviar"] },
    },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { console.error("[alfred] comporRelay", res.status); return { enviar: false, mensagem: "" }; }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const raw = ((data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
    const parsed = JSON.parse(raw);
    return { enviar: parsed?.enviar !== false, mensagem: String(parsed?.mensagem ?? "").trim() };
  } catch (e) { console.error("[alfred] comporRelay erro:", e instanceof Error ? e.message : e); return { enviar: false, mensagem: "" }; }
}

/** Operador respondeu (DM): casa com a escalação aberta e repassa ao cliente. */
export async function responderOperador(
  supabase: SupabaseClient, cfg: AlfredCfg,
  args: { userId: string; replyText: string; quotedText: string },
): Promise<string> {
  // Acha a escalação aberta: por CITAÇÃO (reply) ou, no fallback, a mais recente.
  const { data: abertas } = await supabase.from("alfred_escalations")
    .select("id, group_id, resumo, mensagem_operador")
    .eq("user_id", args.userId).eq("status", "aberta")
    .order("created_at", { ascending: false });
  if (!abertas || abertas.length === 0) return "sem escalação aberta";
  const q = args.quotedText.trim().toLowerCase();
  let esc = q
    ? abertas.find((e) => { const m = (e.mensagem_operador ?? "").trim().toLowerCase(); return m && (m.includes(q) || q.includes(m)); })
    : undefined;
  if (!esc) esc = abertas[0]; // fallback: a mais recente

  // Claim atômico: só um repassa (evita duplicar em retry).
  const { data: claim } = await supabase.from("alfred_escalations")
    .update({ status: "concluida", resposta_operador: args.replyText, answered_at: new Date().toISOString() })
    .eq("id", esc.id).eq("status", "aberta").select("id");
  if (!claim || claim.length === 0) return "já processada";

  const { data: grupo } = await supabase.from("alfred_groups")
    .select("id, user_id, client_name, remote_jid, evolution_instance")
    .eq("id", esc.group_id).maybeSingle();
  if (!grupo) return "grupo não encontrado";
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return "evolution não configurada";

  const relay = await comporRelay(cfg, esc.resumo, esc.mensagem_operador, args.replyText, grupo.client_name);
  // Operador pode pedir para NÃO mandar nada no grupo — então não posta.
  if (!relay.enviar || !relay.mensagem) {
    if (cfg.operator_number) {
      try { await enviarGrupo(instance, cfg.operator_number, "Beleza, não vou enviar nada no grupo então.", 0); } catch { /* ok */ }
    }
    return "sem repasse (operador pediu)";
  }
  const partes = fracionarResposta(relay.mensagem);
  for (const parte of partes) {
    await enviarGrupo(instance, grupo.remote_jid, parte, delayDigitacao(parte, cfg));
    await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: parte });
  }
  if (cfg.operator_number) {
    try { await enviarGrupo(instance, cfg.operator_number, "Show, repassei pro cliente. Valeu!", 0); } catch { /* ok */ }
  }
  return "repassado";
}

// ---- Acompanhamento diário proativo ---------------------------------
/** Horário atual em Brasília (UTC-3), como Date deslocado (use getUTC*). */
function agoraBrasilia(): Date { return new Date(Date.now() - 3 * 3_600_000); }

/** Compõe a mensagem de acompanhamento (Alfred INICIANDO a conversa). */
async function comporProativo(cfg: AlfredCfg, clientName: string, contexto: string): Promise<string> {
  if (!GEMINI_API_KEY) return "";
  const sys = `${cfg.system_prompt}\n\n` +
    `CONTEXTO DO CLIENTE (${clientName}):\n${contexto}\n\n` +
    "TAREFA: você vai INICIAR um contato proativo de ACOMPANHAMENTO DIÁRIO com o cliente agora (você está começando a conversa, não respondendo a nada). " +
    "Com base no contexto: (1) se houver itens PENDENTES que dependem do CLIENTE (acessos, senhas, contas, materiais, aprovações, configurações que faltam), " +
    "faça uma cobrança gentil e ESPECÍFICA do que falta e por quê; (2) se estiver tudo em dia, dê um update curto e positivo do andamento e confirme que está " +
    "tudo seguindo o cronograma; (3) na fase de manutenção, comente o que está rodando (campanhas) ou o próximo passo. " +
    "NÃO invente progresso que não consta no contexto; NÃO cobre o que já foi entregue; não repita demandas já concluídas. Seja caloroso, leve e breve. " +
    "FORMATO: como uma pessoa real da equipe no WhatsApp, no máximo 2 balões separados por LINHA EM BRANCO, sem prefixo, sem markdown, sem rótulos entre colchetes.\n\n" +
    REGRA_NOME_NEGOCIO + "\n\n" + REGRA_ESTILO + "\n\n" + REGRA_SAIDA;
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: "Escreva agora a mensagem de acompanhamento de hoje para este cliente." }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: -1 } },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { console.error("[alfred] comporProativo", res.status); return ""; }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    return ((data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
  } catch (e) { console.error("[alfred] comporProativo erro:", e instanceof Error ? e.message : e); return ""; }
}

/**
 * Contato diário proativo: 1x/dia por grupo, dentro da janela de horário,
 * sem interromper conversa recente. Claim atômico via last_proactive_at.
 */
export async function acompanhamentoProativo(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg): Promise<string> {
  if (!cfg.proactive_ativo) return "proativo off";
  const b = agoraBrasilia();
  if (!PROATIVO_DIAS.has(b.getUTCDay())) return "fora dos dias (seg-ter)";
  const hora = b.getUTCHours();
  if (hora < cfg.proactive_hora || hora >= 21) return "fora da janela";
  const hojeB = b.toISOString().slice(0, 10);
  const lastB = grupo.last_proactive_at ? new Date(new Date(grupo.last_proactive_at).getTime() - 3 * 3_600_000).toISOString().slice(0, 10) : "";
  if (lastB === hojeB) return "já feito hoje";

  const carga = await carregar(supabase, grupo.id);
  const ultima = carga.hist[carga.hist.length - 1];
  if (ultima && Date.now() - new Date(ultima.created_at).getTime() < 90 * 60_000) return "conversa recente";

  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return "evolution não configurada";

  // Claim atômico do contato de hoje (evita disparo duplo entre ticks).
  const start = new Date(b); start.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date(start.getTime() + 3 * 3_600_000).toISOString(); // meia-noite Brasília em UTC
  const { data: claim } = await supabase.from("alfred_groups")
    .update({ last_proactive_at: new Date().toISOString() })
    .eq("id", grupo.id)
    .or(`last_proactive_at.is.null,last_proactive_at.lt.${cutoff}`)
    .select("id");
  if (!claim || claim.length === 0) return "já feito hoje (corrida)";

  const fase = faseEfetiva(grupo.created_at, grupo.fase_override);
  const contexto = montarContexto(carga.ctx, grupo.client_name, fase)
    + montarProposta(carga.proposta) + montarMemoria(carga.mem)
    + montarAtivos(carga.assets) + montarDemandas(carga.demandas) + montarChecklist(carga.tarefas, fase);
  const partes = fracionarResposta(await comporProativo(cfg, grupo.client_name, contexto));
  if (partes.length === 0) return "sem mensagem (marcado p/ hoje)";

  try {
    for (const parte of partes) {
      await enviarGrupo(instance, grupo.remote_jid, parte, delayDigitacao(parte, cfg));
      await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: parte });
    }
    return "proativo enviado";
  } catch (e) {
    console.error("[alfred] proativo envio falhou:", e instanceof Error ? e.message : e);
    return "falha no envio proativo";
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
    // Escala ao operador no modo HANDOFF (aqui é a via de escalação cedo, ~2 min,
    // já que o Alfred não responde por mensagem). No modo imediato, quem escala é
    // o gerarResposta (na hora) — então não classificamos 2x. Dedup por tarefa.
    if (cfg.operator_number && cfg.handoff_ativo) {
      try {
        const esc = await classificarEscalacao(montarContents(hist));
        if (esc) await criarEscalacao(supabase, grupo, cfg, esc);
      } catch (e) { console.error("[alfred] escalonamento:", e instanceof Error ? e.message : e); }
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
