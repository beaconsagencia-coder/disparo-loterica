// =====================================================================
// Lógica compartilhada do Alfred (usada pelo cron alfred-tick).
// Monta contexto, chama o Gemini, aprende e aplica as regras de handoff.
// =====================================================================
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const ENV_EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/+$/, "");
const ENV_EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
// Síntese de voz (ElevenLabs) — opcional: só ativa se a chave e a voz estiverem no env.
const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const ELEVENLABS_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "";
const ELEVENLABS_MODEL = Deno.env.get("ELEVENLABS_MODEL_ID") ?? "eleven_v3";
// Ponte com o Bolão Gestor (outro projeto): só ativa se URL e segredo no env.
const BOLAO_BRIDGE_URL = (Deno.env.get("BOLAO_BRIDGE_URL") ?? "").replace(/\/+$/, "");
const BOLAO_BRIDGE_SECRET = Deno.env.get("ALFRED_BRIDGE_SECRET") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const HISTORICO = 50;
const FASE_THRESHOLD_DIAS = 30; // >= 30 dias de grupo => Manutenção (se sem override)
const PROATIVO_DIAS = new Set([1, 2, 3, 4, 5]); // acompanhamento proativo: seg a sex (0=dom..6=sáb)
const BOT_NOME = "Alfred"; // como o bot se apresenta no grupo

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

/** Semana atual do contrato (1..4) pela idade do grupo. Usada só no onboarding para
 *  saber até onde o escopo pode avançar (semana 1 não adianta tarefa da semana 2). */
function semanaAtual(createdAt: string | null): number {
  if (!createdAt) return 1;
  const dias = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.min(4, Math.max(1, Math.floor(dias / 7) + 1));
}

export interface HistRow { id?: string; role: string; sender_name: string | null; body: string; is_team?: boolean; quoted_body?: string | null }

/** Remove tags que só servem para a síntese de voz (não para texto):
 *  <break ../> (v2) e audio tags do v3 como [exhales], [hesitates], [sighs]. */
function semBreaks(s: string): string {
  return s
    .replace(/<break[^>]*>/gi, "")              // pausa v2
    .replace(/\[[a-zà-úç ]{1,20}\]/gi, "")       // tags de voz v3
    .replace(/\s{2,}/g, " ").trim();
}

/** Nome exibível do remetente: descarta perfis sem nome real (só emoji/símbolos/números).
 *  O refino fino (primeiro nome, empresa, frase) fica com o modelo via prompt. */
function nomeExibivel(nome: string | null): string | null {
  const n = (nome ?? "").trim();
  if (!n) return null;
  if (!/\p{L}/u.test(n)) return null; // precisa ter ao menos uma letra
  return n;
}

/** Primeiro nome plausível a partir do pushName (ou null se não parecer nome próprio).
 *  Aplica de forma determinística o mesmo bom senso do prompt: pega só o 1º token
 *  alfabético, ignorando nomes de empresa/frase/emoji. */
function primeiroNome(nome: string | null): string | null {
  const limpo = nomeExibivel(nome);
  if (!limpo) return null;
  const tok = limpo.trim().split(/\s+/)[0];
  if (!/^[a-zà-ú']{2,15}$/i.test(tok)) return null; // só letras (com acento), 2-15
  return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
}

/** Alfred já enviou alguma mensagem neste grupo? (define se precisa se apresentar antes). */
async function jaSeApresentou(supabase: SupabaseClient, groupId: string): Promise<boolean> {
  const { count } = await supabase.from("alfred_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId).eq("role", "model");
  return (count ?? 0) > 0;
}

/** Texto fixo de apresentação — FALLBACK caso o Gemini falhe. */
function montarApresentacao(nomeCliente: string | null): string {
  const abertura = nomeCliente ? `Prazer, ${nomeCliente}!` : "Prazer, pessoal!";
  return `${abertura} Eu sou o ${BOT_NOME} e vou ser o gerente de vocês. ` +
    "Toda a parte de organização de demandas fica comigo.";
}

/** Apresentação gerada pelo Gemini (adapta tom/cumprimento), com o roteiro fixo como
 *  base obrigatória. Cai no texto determinístico se a API falhar. */
async function comporApresentacao(cfg: AlfredCfg, nomeCliente: string | null, gatilho: string | null): Promise<string> {
  if (!GEMINI_API_KEY) return montarApresentacao(nomeCliente);
  const alvo = nomeCliente
    ? `A pessoa que falou se chama ${nomeCliente} — use o primeiro nome dela no cumprimento.`
    : "Você ainda não sabe o nome de quem está no grupo; cumprimente com 'pessoal'.";
  const ctx = gatilho
    ? `A última mensagem da pessoa foi: "${gatilho}". Use-a SÓ para espelhar o cumprimento (bom dia/boa tarde/boa noite) — ignore o conteúdo/pergunta, isso é respondido depois.`
    : "Ninguém falou ainda; você está iniciando a conversa.";
  const sys = `${cfg.system_prompt}\n\n` +
    "TAREFA: esta é a SUA PRIMEIRA mensagem neste grupo — uma APRESENTAÇÃO sua ao cliente (você ainda NÃO falou aqui). " +
    "Escreva UMA mensagem curta, calorosa e com personalidade que contenha, OBRIGATORIAMENTE, as TRÊS coisas a seguir — nenhuma pode faltar:\n" +
    "(1) um cumprimento de boas-vindas/prazer usando o primeiro nome da pessoa quando houver;\n" +
    `(2) DIGA SEU NOME claramente: que você se chama ${BOT_NOME} e que vai ser o GERENTE deles;\n` +
    "(3) que toda a ORGANIZAÇÃO/GESTÃO de demandas fica por sua conta.\n" +
    `${alvo} ${ctx} ` +
    "PROIBIDO: frases de preenchimento como 'vi sua mensagem', 'recebi seu contato'; e PROIBIDO responder/resolver o que a pessoa perguntou (isso vem na próxima mensagem). " +
    "Apenas se apresente. Soe humano e simpático, nunca robótico.\n\n" +
    REGRA_NOME_NEGOCIO + "\n\n" + REGRA_ESTILO + "\n\n" + REGRA_SAIDA;
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: "Escreva agora a sua mensagem de apresentação." }] }],
    generationConfig: { temperature: 0.75, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: -1 } },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { console.error("[alfred] comporApresentacao", res.status); return montarApresentacao(nomeCliente); }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const txt = ((data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
    return txt || montarApresentacao(nomeCliente);
  } catch (e) {
    console.error("[alfred] comporApresentacao erro:", e instanceof Error ? e.message : e);
    return montarApresentacao(nomeCliente);
  }
}

/** Se o Alfred ainda não falou no grupo, envia a apresentação (via Gemini) como 1ª mensagem.
 *  Retorna true se apresentou agora (para os fluxos darem um respiro antes de seguir). */
async function apresentarSeNecessario(
  supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg, nomeCliente: string | null, gatilho: string | null = null,
): Promise<boolean> {
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return false;
  if (await jaSeApresentou(supabase, grupo.id)) return false;
  const partes = fracionarResposta(await comporApresentacao(cfg, nomeCliente, gatilho));
  if (partes.length === 0) return false;
  try {
    for (const bruta of partes) {
      const parte = semBreaks(bruta);
      if (!parte) continue;
      await enviarGrupo(instance, grupo.remote_jid, parte, delayDigitacao(parte, cfg));
      await supabase.from("alfred_messages").insert({
        user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid,
        role: "model", sender_name: "Alfred", body: parte,
      });
    }
    return true;
  } catch (e) {
    console.error("[alfred] apresentação falhou:", e instanceof Error ? e.message : e);
    return false;
  }
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

function montarChecklist(tasks: TaskRow[], fase: Fase, semana = 1): string {
  if (!tasks?.length) return "";
  const porSemana = new Map<number, TaskRow[]>();
  for (const t of tasks) {
    if (!porSemana.has(t.semana)) porSemana.set(t.semana, []);
    porSemana.get(t.semana)!.push(t);
  }
  const titulo = fase === "manutencao"
    ? "HISTÓRICO DE IMPLANTAÇÃO (onboarding já concluído — apenas referência; o foco agora são campanhas e demandas):"
    : `ANDAMENTO DO CONTRATO — você está na SEMANA ${semana} do onboarding (checklist — [x] já feito, [ ] pendente):`;
  const linhas = ["", titulo];
  for (const s of [...porSemana.keys()].sort((a, b) => a - b)) {
    linhas.push(`Semana ${s}:`);
    for (const t of porSemana.get(s)!) linhas.push(`  [${t.done ? "x" : " "}] ${t.titulo}`);
  }
  if (fase !== "manutencao") {
    linhas.push("", `REGRA DO CRONOGRAMA (semana atual: ${semana}):`);
    linhas.push(
      `- O FOCO é o escopo da semana ${semana}. NUNCA adiante tarefas de semanas FUTURAS (> ${semana}): se algo é de uma semana que ainda não chegou, ` +
      "explique com gentileza que está no cronograma e será feito na semana certa, sem antecipar.",
    );
    if (semana > 1) {
      linhas.push(
        "- O cronograma NÃO PARA e NÃO TRAVA. Tarefas pendentes de semanas anteriores devem ser EXECUTADAS agora, como parte do trabalho da semana atual. " +
        "Uma pendência antiga NÃO prende você na semana passada — você já está na semana atual resolvendo o que faltou.",
      );
      linhas.push(
        "- AO COMUNICAR pendências antigas: fale APENAS da execução do que falta ('vamos subir os anúncios agora', 'já estou providenciando isso'). " +
        "É PROIBIDO usar a palavra 'atrasado'/'atraso' e PROIBIDO amarrar a tarefa ao número da semana passada (não diga 'a tarefa da semana 3'). " +
        "Trate como o que está sendo feito agora, com naturalidade e tom positivo.",
      );
    }
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

/** Texto da última fala do CLIENTE (ignora equipe e o próprio Alfred). Para gates. */
function ultimaFalaCliente(hist: HistRow[]): string {
  for (let i = hist.length - 1; i >= 0; i--) {
    const m = hist[i];
    if (m.role === "user" && !m.is_team) return m.body ?? "";
  }
  return "";
}

async function chamarGemini(systemPrompt: string, contexto: string, contents: { role: "user" | "model"; parts: { text: string }[] }[], baseConhecimento: string, recemApresentado = false): Promise<{ mensagem: string; audio: boolean }> {
  const avisoApresentacao = recemApresentado
    ? "ATENÇÃO: você ACABOU de se apresentar e cumprimentar o cliente AGORA, na mensagem anterior. NÃO cumprimente de novo " +
      "(nada de 'Olá', 'Oi', 'Bom dia/Boa tarde' nem repetir o nome dele no começo) — vá DIRETO ao conteúdo da resposta.\n\n"
    : "";
  const body = {
    system_instruction: {
      parts: [{
        text:
          `${systemPrompt}\n\n` +
          avisoApresentacao +
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
          "(1) FINANCEIRO — boletos, descontos, cancelamentos, taxas, negociação/alteração de valores ou datas, termos de contrato. " +
          "EXCEÇÃO: se houver a seção 'FATURA DO CLIENTE' no contexto, você PODE informar os fatos dela (valor da mensalidade, vencimento, se está paga ou em aberto e a chave PIX) — " +
          "isso são dados reais, não é 'resolver financeiro'. Mas negociar (desconto, parcelar, adiar, cancelar, contestar) e dar BAIXA/confirmar pagamento continuam PROIBIDOS: acione o operador;\n" +
          "(2) CONTEXTO QUE VOCÊ NÃO TEM — qualquer menção a reuniões, calls, áudios, prints ou combinados feitos FORA deste chat (ex.: 'a call de sexta', " +
          "'o áudio de ontem', 'o que combinei com o João'); JAMAIS diga 'já anotei', 'já registrei', 'pode deixar que vi' — você NÃO tem acesso a isso;\n" +
          "(3) TÉCNICO fora da BASE DE CONHECIMENTO — integrações de API, DNS, configurações avançadas, qualquer coisa que não esteja explícita na base;\n" +
          "(4) ESTRATÉGIA / APROVAÇÃO SUBJETIVA — mudanças de campanha, decisões de estratégia, aprovações que dependem de julgamento.\n" +
          "Nesses casos, o operador responsável é acionado em paralelo, e a sua ÚNICA resposta ao grupo deve ser CURTÍSSIMA (1 frase), apenas avisando que o " +
          "responsável já vai atender — ex.: 'Vou chamar o responsável pra te atender sobre isso, só um instante!'. SEM explicar, SEM detalhar, SEM opinião, SEM prazo.\n\n" +
          "PEDIDO DE LIGAÇÃO/CHAMADA DE VOZ: se o cliente demonstrar interesse em conversar por LIGAÇÃO, chamada de áudio/vídeo ou 'por telefone', você está " +
          "TERMINANTEMENTE PROIBIDO de dizer que é um bot, que não atende ligações, que não tem telefone ou que não pode falar por voz. Responda com naturalidade e " +
          "educação que vai VERIFICAR a disponibilidade na agenda do Pedro e já retorna com um horário — ex.: 'Claro! Deixa eu verificar a disponibilidade na agenda do " +
          "Pedro aqui e já te confirmo um horário pra gente conversar, tá?'. NÃO marque horário você mesmo, NÃO invente disponibilidade: o operador é acionado em " +
          "paralelo para combinar a ligação direto com o cliente.\n\n" +
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
          "SAÍDA: devolva um JSON com 'mensagem' (APENAS o texto final ao cliente, balões separados por LINHA EM BRANCO) e 'audio' (booleano). " +
          "Defina audio=true quando: (a) o cliente PEDIR explicitamente um áudio (ex.: 'manda um áudio', 'pode me explicar falando'); OU " +
          "(b) a sua resposta for uma EXPLICAÇÃO mais longa/detalhada — várias frases, um passo a passo, um 'porquê' elaborado ou mais de um balão de conteúdo — " +
          "porque ouvir fica bem mais fácil que ler um textão. Use audio=false apenas para respostas CURTAS e diretas (1 frase, confirmações, 'ok', avisos rápidos, " +
          "ou a resposta curtíssima de escalonamento). Na dúvida entre texto e áudio numa resposta que ficou longa, PREFIRA o áudio. " +
          "Quando audio=true, escreva a 'mensagem' em tom FALADO e natural (ela será LIDA em voz pelo ElevenLabs v3): use vícios de linguagem SUTIS e ocasionais " +
          "('é...', 'então', 'tipo', 'olha', 'deixa eu te explicar', 'sabe?', 'ó') e contrações da fala ('tá', 'pra', 'cê'). " +
          "Para as PAUSAS de respiração/pensamento, use reticências '...' e vírgulas em pontos naturais — o v3 transforma isso em pausas bem humanas; mantenha SUTIL. " +
          "Opcionalmente, no MÁXIMO uma vez, uma audio tag do v3 entre colchetes onde couber uma respiração [exhales] ou hesitação [hesitates]. " +
          "NÃO use reticências/tags exageradamente, e NADA disso em respostas de texto (audio=false). " +
          "Use tudo com PARCIMÔNIA — só o suficiente pra não soar robótico, sem exagerar nem ficar caricato. " +
          "Pense internamente o quanto precisar para perguntas complexas; esse raciocínio NUNCA entra no campo 'mensagem'.",
      }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,                  // espaço p/ pensar (privado) + responder
      thinkingConfig: { thinkingBudget: -1 }, // pensamento DINÂMICO: mais em perguntas complexas, ~0 nas simples
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { mensagem: { type: "STRING" }, audio: { type: "BOOLEAN" } }, required: ["mensagem"] },
    },
  };
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) { console.error("[alfred] gemini", res.status, (await res.text()).slice(0, 200)); return { mensagem: "", audio: false }; }
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const raw = ((data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
  // Saída ESTRUTURADA: só o campo "mensagem" é enviado — qualquer raciocínio fica fora.
  try {
    const parsed = JSON.parse(raw);
    return { mensagem: String(parsed?.mensagem ?? "").trim(), audio: parsed?.audio === true };
  } catch {
    return { mensagem: raw, audio: false }; // fallback defensivo caso não venha JSON
  }
}

const MAX_MSGS = 3;

// Resposta "longa" => manda áudio mesmo que o modelo não tenha marcado audio=true.
// Garante o comportamento de explicação detalhada virar nota de voz.
const TAM_AUDIO_AUTO = 320; // nº de caracteres do texto final (juntando os balões)
function respostaLonga(partes: string[]): boolean {
  return partes.join(" ").replace(/\s+/g, " ").trim().length >= TAM_AUDIO_AUTO;
}
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
    // remove SÓ rótulos internos vazados no início ([Equipe ...], [Cliente ...], etc.).
    // Não toca em audio tags do v3 ([exhales], [hesitates]...) usadas na fala.
    .replace(/^(?:\s*\[\s*(?:equipe|cliente|usu[aá]rio|imagem|[aá]udio|nota|an[aá]lise|sistema)[^\]]*\]\s*:?\s*)+/gi, "")
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

/** Sintetiza o texto em voz natural (ElevenLabs) e devolve o MP3 em base64. */
async function sintetizarVoz(texto: string): Promise<string | null> {
  if (!ELEVENLABS_KEY || !ELEVENLABS_VOICE || !texto.trim()) return null;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({
        text: texto.slice(0, 2500), // limita tamanho (custo/duração)
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true }, // v3: stability Natural; "style" não se aplica
      }),
    });
    if (!res.ok) { console.error("[alfred] elevenlabs", res.status, (await res.text()).slice(0, 200)); return null; }
    return encodeBase64(new Uint8Array(await res.arrayBuffer()));
  } catch (e) { console.error("[alfred] elevenlabs erro:", e instanceof Error ? e.message : e); return null; }
}

/** Envia uma nota de voz (PTT) ao grupo via Evolution. */
async function enviarAudioGrupo(instance: string, remoteJid: string, base64Mp3: string): Promise<void> {
  const res = await fetch(`${ENV_EVO_URL}/message/sendWhatsAppAudio/${instance}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: ENV_EVO_KEY },
    body: JSON.stringify({ number: remoteJid, audio: base64Mp3 }),
  });
  if (!res.ok) throw new Error(`Evolution sendWhatsAppAudio ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
  contrato_inicio?: string | null;
  contract_id?: string | null;
  bolao_account_id?: string | null;
  last_proactive_at?: string | null;
}

/** Config de cobrança/PIX (vem de billing_settings, por usuário). */
export interface BillingCfg {
  ativo: boolean;
  pix_key: string | null;
  pix_nome: string | null;
  pix_copia_cola: string | null;
  hora_envio: number; // hora do disparo (0-23, Brasília)
  dias_antes: number; // lembrete N dias antes do vencimento
}

/** Data base do contrato para fase/semana: usa a data de início informada
 *  manualmente; se não houver, cai na data de cadastro do grupo. */
function inicioContrato(g: { contrato_inicio?: string | null; created_at: string | null }): string | null {
  return g.contrato_inicio || g.created_at;
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

  const baseContrato = inicioContrato(grupo);
  const fase = faseEfetiva(baseContrato, grupo.fase_override);
  const contexto = montarContexto(carga.ctx, grupo.client_name, fase)
    + montarProposta(carga.proposta)
    + montarMemoria(carga.mem)
    + montarAtivos(carga.assets)
    + montarDemandas(carga.demandas)
    + montarChecklist(carga.tarefas, fase, semanaAtual(baseContrato))
    + await carregarFaturaContexto(supabase, grupo) // fatura vinculada (dúvidas de cobrança)
    + await carregarBolaoContexto(grupo, ultimaFalaCliente(carga.hist)); // dados ao vivo do Bolão Gestor
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

  // PRIMEIRA fala do Alfred no grupo: apresenta-se antes de responder qualquer coisa.
  const apresentou = await apresentarSeNecessario(supabase, grupo, cfg, primeiroNome(ultimaUser?.sender_name ?? null), ultimaUser?.body ?? null);

  const r = await chamarGemini(cfg.system_prompt, contexto, contents, cfg.base_conhecimento ?? "", apresentou);
  const partes = fracionarResposta(r.mensagem);
  if (partes.length === 0) return "sem resposta (não necessária)"; // o modelo decidiu não responder

  // Escalonamento IMEDIATO (modo imediato; no handoff o cron cobre a cada 2 min).
  async function escalarSeNecessario() {
    if (!cfg.operator_number) return;
    try {
      const esc = await classificarEscalacao(contents);
      if (esc) await criarEscalacao(supabase, grupo, cfg, esc);
    } catch (e) { console.error("[alfred] escalonamento:", e instanceof Error ? e.message : e); }
  }

  // ÁUDIO: pedido do cliente, decisão do modelo, OU resposta longa (explicação detalhada).
  // Logs explícitos em cada ponto de falha para diagnóstico (cai p/ texto em qualquer um).
  const querAudio = r.audio || respostaLonga(partes);
  if (querAudio) {
    if (!ELEVENLABS_KEY || !ELEVENLABS_VOICE) {
      console.warn(`[alfred] áudio solicitado, mas ElevenLabs não configurada (key:${ELEVENLABS_KEY ? "ok" : "FALTA"}, voice:${ELEVENLABS_VOICE ? "ok" : "FALTA"}). Enviando texto.`);
    } else {
      const textoAudio = partes.join(" ").replace(/\s+/g, " ").trim();
      const b64 = await sintetizarVoz(textoAudio);
      if (!b64) {
        console.error("[alfred] síntese de voz falhou (ElevenLabs). Enviando texto.");
      } else {
        try {
          await enviarAudioGrupo(instance, grupo.remote_jid, b64);
          await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: `🎤 ${semBreaks(textoAudio)}` });
          await escalarSeNecessario();
          return "respondido (áudio)";
        } catch (e) { console.error("[alfred] envio do áudio (Evolution sendWhatsAppAudio) falhou:", e instanceof Error ? e.message : e); }
      }
    }
  }

  // TEXTO fracionado (default / fallback do áudio): várias mensagens curtas em sequência.
  let enviadas = 0;
  try {
    for (const bruta of partes) {
      const parte = semBreaks(bruta); // texto nunca leva tag <break> (só o áudio usa)
      if (!parte) continue;
      await enviarGrupo(instance, grupo.remote_jid, parte, delayDigitacao(parte, cfg));
      await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: parte });
      enviadas++;
    }
    await escalarSeNecessario();
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
    "(1) FINANCEIRO: boleto, desconto, cancelamento, taxa, negociação/alteração de valor ou data, termos de contrato, OU o cliente afirmar que JÁ PAGOU/enviar comprovante " +
    "(precisa de confirmação humana da baixa). NÃO escale dúvida SIMPLES respondível pela FATURA DO CLIENTE no contexto (quanto é, quando vence, se está paga, qual a chave PIX).\n" +
    "(2) CONTEXTO EXTERNO que o agente não tem: reuniões, calls, áudios, prints, conversas ou combinados feitos FORA deste chat (ex.: 'a call de sexta', " +
    "'o áudio de ontem', 'o que falei com o João').\n" +
    "(3) TÉCNICO fora da base de conhecimento: integração de API, DNS, configurações avançadas, qualquer pedido técnico não coberto pela base.\n" +
    "(4) ESTRATÉGIA / APROVAÇÃO subjetiva: mudança de campanha, decisão estratégica, aprovação que depende de julgamento humano.\n" +
    "(5) LIGAÇÃO / CHAMADA DE VOZ: o cliente demonstra interesse em conversar por ligação, chamada de áudio ou videochamada, ou quer 'falar por telefone'. " +
    "Nesse caso a mensagem_operador deve avisar que o cliente quer uma ligação e pedir para o operador combinar o horário direto com ele.\n" +
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

  const baseContrato = inicioContrato(grupo);
  const fase = faseEfetiva(baseContrato, grupo.fase_override);
  const contexto = montarContexto(carga.ctx, grupo.client_name, fase)
    + montarProposta(carga.proposta) + montarMemoria(carga.mem)
    + montarAtivos(carga.assets) + montarDemandas(carga.demandas) + montarChecklist(carga.tarefas, fase, semanaAtual(baseContrato));
  // Se o acompanhamento for a 1ª fala do Alfred no grupo, apresenta-se antes.
  await apresentarSeNecessario(supabase, grupo, cfg, null);

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

// ---- Cobrança / fatura vinculada ------------------------------------
const padN = (n: number) => String(n).padStart(2, "0");
const brlV = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diasNoMes = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

interface ContractRow {
  id: string; client_name: string; contract_value: number; duration_months: number;
  due_date_day: number; start_date: string; status: string;
}
interface InvoiceRow {
  id: string; competencia: string; due_date: string; valor: number; status: string;
  alfred_lembrete_at: string | null; alfred_dia_at: string | null; alfred_atraso_at: string | null;
}

/** Vencimento (YYYY-MM-DD) do contrato numa competência (dia clampado ao mês). */
function vencimentoNoMes(dueDay: number, y: number, m0: number): string {
  const dia = Math.min(dueDay, diasNoMes(y, m0));
  return `${y}-${padN(m0 + 1)}-${padN(dia)}`;
}

/** Garante a parcela (invoices) da competência; retorna a linha. */
async function garantirInvoice(
  supabase: SupabaseClient, userId: string, c: ContractRow, comp: string, due: string,
): Promise<InvoiceRow | null> {
  const { data: ex } = await supabase.from("invoices")
    .select("id, competencia, due_date, valor, status, alfred_lembrete_at, alfred_dia_at, alfred_atraso_at")
    .eq("contract_id", c.id).eq("competencia", comp).maybeSingle();
  if (ex) return ex as InvoiceRow;
  const { data: novo } = await supabase.from("invoices")
    .insert({ user_id: userId, contract_id: c.id, competencia: comp, due_date: due, valor: Number(c.contract_value) || 0 })
    .select("id, competencia, due_date, valor, status, alfred_lembrete_at, alfred_dia_at, alfred_atraso_at").single();
  return (novo as InvoiceRow) ?? null;
}

/** Bloco de CONTEXTO com a fatura vinculada (para o Alfred tirar dúvidas). */
async function carregarFaturaContexto(supabase: SupabaseClient, grupo: Grupo): Promise<string> {
  if (!grupo.contract_id) return "";
  const { data: c } = await supabase.from("contracts")
    .select("id, client_name, contract_value, duration_months, due_date_day, start_date, status")
    .eq("id", grupo.contract_id).maybeSingle();
  if (!c) return "";
  const ct = c as ContractRow;
  const b = agoraBrasilia();
  const y = b.getUTCFullYear(), m0 = b.getUTCMonth();
  const comp = `${y}-${padN(m0 + 1)}-01`;
  const dueStr = vencimentoNoMes(ct.due_date_day, y, m0);
  const [{ data: inv }, { data: bs }] = await Promise.all([
    supabase.from("invoices").select("status, due_date, valor").eq("contract_id", ct.id).eq("competencia", comp).maybeSingle(),
    supabase.from("billing_settings").select("pix_key, pix_nome, pix_copia_cola").eq("user_id", grupo.user_id).maybeSingle(),
  ]);
  const pago = (inv as { status?: string } | null)?.status === "paid";
  const [vy, vm, vd] = dueStr.split("-");
  const venc = `${vd}/${vm}/${vy}`;
  const pix = (bs?.pix_key ?? "").trim();
  const copia = (bs?.pix_copia_cola ?? "").trim();
  const fav = (bs?.pix_nome ?? "").trim();
  const linhas = [
    "", "FATURA DO CLIENTE (dados REAIS — use para tirar dúvidas de cobrança; nunca invente nada além daqui):",
    `- Mensalidade: ${brlV(Number(ct.contract_value))}`,
    `- Vencimento deste mês: ${venc} (todo dia ${ct.due_date_day})`,
    `- Situação do mês: ${pago ? "PAGA ✅" : "EM ABERTO (ainda não consta como paga)"}`,
  ];
  if (pix) linhas.push(`- Chave PIX: ${pix}${fav ? ` (favorecido: ${fav})` : ""}`);
  if (copia) linhas.push(`- PIX copia e cola: ${copia}`);
  if (!pix && !copia) linhas.push("- (Sem chave PIX configurada — se pedirem como pagar, acione o operador.)");
  linhas.push(
    "REGRA DA FATURA: você PODE informar valor, vencimento, situação (paga/em aberto) e a chave PIX acima. " +
    "Se o cliente disser que JÁ PAGOU mas consta em aberto, agradeça, diga que vai CONFIRMAR o recebimento e acione o operador — NÃO dê baixa nem confirme pagamento por conta própria. " +
    "Negociação (desconto, parcelar, adiar/mudar vencimento, cancelar, contestar valor) NÃO é com você: acione o operador.",
  );
  return linhas.join("\n");
}

/** Mensagem de cobrança escrita pelo Alfred (natural), por tipo de momento. */
async function comporCobranca(
  cfg: AlfredCfg, tipo: "lembrete" | "dia" | "atraso",
  dados: { valor: string; venc: string; pix: string; copia: string; favorecido: string },
): Promise<string> {
  const objetivo = tipo === "lembrete"
    ? `LEMBRAR, com antecedência e gentileza, que a mensalidade vence em ${dados.venc}.`
    : tipo === "dia"
    ? `avisar que a mensalidade VENCE HOJE (${dados.venc}).`
    : `cobrar com educação a mensalidade que VENCEU em ${dados.venc} e ainda consta em aberto (sem soar ríspido nem ameaçador).`;
  const pixTxt = dados.pix
    ? `Para o pagamento, informe a chave PIX: ${dados.pix}${dados.favorecido ? ` (favorecido: ${dados.favorecido})` : ""}.${dados.copia ? ` Você também pode oferecer o PIX copia e cola: ${dados.copia}` : ""}`
    : "Não há chave PIX para informar; apenas lembre do vencimento e diga que já manda os dados de pagamento na sequência.";
  const sys = `${cfg.system_prompt}\n\n` +
    "TAREFA: você vai INICIAR uma mensagem de COBRANÇA da mensalidade no grupo do cliente (você está começando a conversa). " +
    `Objetivo: ${objetivo} Valor: ${dados.valor}. ${pixTxt} ` +
    "Peça gentilmente que envie o comprovante após o pagamento. Seja caloroso, leve e BREVE (no máximo 2 balões separados por LINHA EM BRANCO), " +
    "como uma pessoa real da equipe no WhatsApp — sem markdown, sem listas, sem rótulos. NÃO invente valores, datas ou taxas além dos informados.\n\n" +
    REGRA_NOME_NEGOCIO + "\n\n" + REGRA_ESTILO + "\n\n" + REGRA_SAIDA;
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: "Escreva agora a mensagem de cobrança." }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: -1 } },
  };
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { console.error("[alfred] comporCobranca", res.status); return ""; }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    return ((data?.candidates?.[0]?.content?.parts as any[] | undefined)?.map((p) => p?.text ?? "").join("") ?? "").trim();
  } catch (e) { console.error("[alfred] comporCobranca erro:", e instanceof Error ? e.message : e); return ""; }
}

const ATRASO_MAX_DIAS = 7; // janela em que a cobrança de atraso ainda dispara (1x)

/**
 * Cobrança proativa no grupo (substitui o PIX direto p/ contratos vinculados).
 * Decide o momento (lembrete antes / no dia / atraso), de forma idempotente por
 * parcela e por tipo. Roda no tick, na hora_envio configurada.
 */
export async function cobrancaProativa(supabase: SupabaseClient, grupo: Grupo, cfg: AlfredCfg, billing: BillingCfg): Promise<string> {
  if (!grupo.contract_id) return "sem contrato";
  if (!billing.ativo) return "cobrança off";
  const instance = cfg.evolution_instance || grupo.evolution_instance || "";
  if (!ENV_EVO_URL || !ENV_EVO_KEY || !instance) return "evolution não configurada";

  const b = agoraBrasilia();
  if (b.getUTCHours() !== Number(billing.hora_envio)) return "fora da hora";
  const hoje = b.toISOString().slice(0, 10);

  const { data: c } = await supabase.from("contracts")
    .select("id, client_name, contract_value, duration_months, due_date_day, start_date, status")
    .eq("id", grupo.contract_id).maybeSingle();
  if (!c) return "contrato não encontrado";
  const ct = c as ContractRow;
  if (ct.status !== "active") return "contrato inativo";

  const [sy, sm] = String(ct.start_date).split("-").map(Number);
  const startIdx = sy * 12 + (sm - 1);
  const fimIdx = startIdx + Number(ct.duration_months) - 1;
  const diasAntes = Number(billing.dias_antes) || 0;

  // Examina competências vizinhas (anterior/atual/próxima) p/ casar antes/dia/atraso.
  const curIdx = b.getUTCFullYear() * 12 + b.getUTCMonth();
  for (const off of [-1, 0, 1]) {
    const idx = curIdx + off;
    if (idx < startIdx || idx > fimIdx) continue;
    const cy = Math.floor(idx / 12), cm0 = ((idx % 12) + 12) % 12;
    const due = vencimentoNoMes(ct.due_date_day, cy, cm0);
    const comp = `${cy}-${padN(cm0 + 1)}-01`;

    // Qual o momento de hoje para esta parcela?
    const lembreteDia = new Date(Date.parse(due + "T00:00:00Z") - diasAntes * 86_400_000).toISOString().slice(0, 10);
    const diasAposVenc = Math.floor((Date.parse(hoje + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86_400_000);
    let tipo: "lembrete" | "dia" | "atraso" | null = null;
    if (diasAntes > 0 && hoje === lembreteDia && hoje !== due) tipo = "lembrete";
    else if (hoje === due) tipo = "dia";
    else if (diasAposVenc >= 1 && diasAposVenc <= ATRASO_MAX_DIAS) tipo = "atraso";
    if (!tipo) continue;

    const inv = await garantirInvoice(supabase, grupo.user_id, ct, comp, due);
    if (!inv) continue;
    if (inv.status === "paid") return "paga (sem cobrança)";
    // Idempotência por tipo.
    if (tipo === "lembrete" && inv.alfred_lembrete_at) continue;
    if (tipo === "dia" && inv.alfred_dia_at) continue;
    if (tipo === "atraso" && inv.alfred_atraso_at) continue;

    const { data: bs } = await supabase.from("billing_settings")
      .select("pix_key, pix_nome, pix_copia_cola").eq("user_id", grupo.user_id).maybeSingle();
    const [vy, vm, vd] = due.split("-");
    const texto = await comporCobranca(cfg, tipo, {
      valor: brlV(Number(ct.contract_value)), venc: `${vd}/${vm}/${vy}`,
      pix: (bs?.pix_key ?? billing.pix_key ?? "").trim(),
      copia: (bs?.pix_copia_cola ?? billing.pix_copia_cola ?? "").trim(),
      favorecido: (bs?.pix_nome ?? billing.pix_nome ?? "").trim(),
    });
    const partes = fracionarResposta(texto);
    if (partes.length === 0) return "sem mensagem de cobrança";

    // Marca ANTES de enviar (evita duplicar se o envio repetir no próximo tick).
    const col = tipo === "lembrete" ? "alfred_lembrete_at" : tipo === "dia" ? "alfred_dia_at" : "alfred_atraso_at";
    await supabase.from("invoices").update({ [col]: new Date().toISOString() }).eq("id", inv.id);
    try {
      for (const bruta of partes) {
        const parte = semBreaks(bruta);
        if (!parte) continue;
        await enviarGrupo(instance, grupo.remote_jid, parte, delayDigitacao(parte, cfg));
        await supabase.from("alfred_messages").insert({ user_id: grupo.user_id, group_id: grupo.id, remote_jid: grupo.remote_jid, role: "model", sender_name: "Alfred", body: parte });
      }
      return `cobrança enviada (${tipo})`;
    } catch (e) {
      console.error("[alfred] cobrança envio falhou:", e instanceof Error ? e.message : e);
      return "falha no envio da cobrança";
    }
  }
  return "fora de janela de cobrança";
}

// ---- Bolão Gestor (dados ao vivo via ponte alfred-bridge) -----------
// Só busca quando o cliente TOCA no assunto (gate por palavras), para não
// dar latência/custo em toda mensagem.
const BOLAO_GATE = /\b(venda|vendas|vendid|vendi|cota|cotas|bol[ãa]o|bol[õo]es|pr[êe]mi|premi|ganhador|faturament|arrecad|assinatura|plano|mensalidade do bol|quanto.*(vend|arrecad)|como.*(t[áa]|est[ãa]).*(venda|bol))/i;

interface BolaoResumo {
  vendas_hoje: { data: string; cotas_vendidas: number; cotas_reservadas: number; valor_total: number } | null;
  boloes_ativos: { modalidade: string; valor_total: number; total_cotas: number; disponiveis: number; vendidas: number }[];
  premiacoes: { modalidade: string | null; concurso: number | null; numero_cota: number | null; premio: number; quando: string }[];
  assinatura: { plano: string; status: string; vigente_ate: string | null; trial_ate: string | null } | null;
}

/** Chama a ponte do Bolão Gestor para o retrato ao vivo da conta. */
async function buscarResumoBolao(accountId: string): Promise<BolaoResumo | null> {
  if (!BOLAO_BRIDGE_URL || !BOLAO_BRIDGE_SECRET) return null;
  try {
    const res = await fetch(`${BOLAO_BRIDGE_URL}?action=resumo&account=${encodeURIComponent(accountId)}`, {
      headers: { "x-bridge-secret": BOLAO_BRIDGE_SECRET },
    });
    if (!res.ok) { console.error("[alfred] bolao-bridge", res.status); return null; }
    return await res.json() as BolaoResumo;
  } catch (e) { console.error("[alfred] bolao-bridge erro:", e instanceof Error ? e.message : e); return null; }
}

/** Bloco de CONTEXTO com os dados ao vivo do Bolão Gestor (só se o cliente tocou no assunto). */
async function carregarBolaoContexto(grupo: Grupo, gatilho: string): Promise<string> {
  if (!grupo.bolao_account_id) return "";
  if (!BOLAO_GATE.test(gatilho)) return ""; // cliente não falou de bolão/vendas agora
  const r = await buscarResumoBolao(grupo.bolao_account_id);
  if (!r) return "";
  const linhas: string[] = ["", "BOLÃO GESTOR — DADOS AO VIVO DO CLIENTE (reais; use para responder; NÃO invente nada além daqui):"];
  if (r.vendas_hoje) {
    const v = r.vendas_hoje;
    linhas.push(`- Vendas de hoje: ${v.cotas_vendidas} cota(s) vendida(s)${v.cotas_reservadas ? `, ${v.cotas_reservadas} reservada(s)` : ""}, total ${brlV(v.valor_total)}.`);
  } else {
    linhas.push("- Vendas de hoje: ainda não há registro de vendas hoje.");
  }
  if (r.boloes_ativos?.length) {
    linhas.push("- Bolões ativos:");
    for (const b of r.boloes_ativos) {
      linhas.push(`  • ${b.modalidade} — ${brlV(b.valor_total)}: ${b.vendidas}/${b.total_cotas} cotas vendidas (${b.disponiveis} disponíveis).`);
    }
  } else {
    linhas.push("- Bolões ativos: nenhum bolão ativo no momento.");
  }
  if (r.premiacoes?.length) {
    linhas.push("- Premiações recentes:");
    for (const p of r.premiacoes) {
      const quando = (p.quando ?? "").slice(0, 10).split("-").reverse().join("/");
      linhas.push(`  • ${p.modalidade ?? "—"}${p.concurso ? ` (concurso ${p.concurso})` : ""}, cota ${p.numero_cota ?? "—"}: ${brlV(p.premio)}${quando ? ` em ${quando}` : ""}.`);
    }
  }
  if (r.assinatura) {
    const a = r.assinatura;
    const ate = (a.vigente_ate ?? a.trial_ate ?? "").slice(0, 10).split("-").reverse().join("/");
    linhas.push(`- Assinatura no Bolão Gestor: plano ${a.plano}, situação ${a.status}${ate ? `, vigente até ${ate}` : ""}.`);
  }
  linhas.push(
    "REGRA BOLÃO GESTOR: você PODE informar esses números reais ao cliente. Mas você NÃO executa ações no sistema (criar/editar bolão, dar baixa, mexer em cota): " +
    "se o cliente pedir uma AÇÃO, confirme com gentileza e acione o operador. Se algum dado não estiver acima, não invente — diga que vai verificar.",
  );
  return linhas.join("\n");
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
