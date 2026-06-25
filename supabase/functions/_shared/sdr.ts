// =====================================================================
// SDR com IA (Google Gemini) — conduz a conversa seguindo o playbook do
// usuário, qualifica o lead e agenda a reunião (function calling).
// Roda em background a partir do webhook.
// =====================================================================
import { GoogleGenAI, Type } from "npm:@google/genai@2.8.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendText } from "./evolution.ts";
import { agendaResumo, checkAvailability, suggestSlots, activeMeetingFor, labelSlot } from "./agenda.ts";

const DEFAULT_MODEL = "gemini-2.5-flash";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getAi(): GoogleGenAI {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  return new GoogleGenAI({ apiKey });
}

/** Transcreve um áudio (base64) para texto usando o Gemini. */
export async function transcribeAudio(base64: string, mimetype: string): Promise<string> {
  const ai = getAi();
  const resp = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mimetype, data: base64 } },
        { text: "Transcreva este áudio em português do Brasil. Responda APENAS com a transcrição, sem comentários." },
      ],
    }],
  });
  return (resp.text ?? "").trim();
}

// --- Indicação de contato (cliente repassa o número da "dona/responsável") ---

/**
 * Normaliza um telefone BR para dígitos com DDI 55, ou null se inválido.
 * Se o número vier SEM DDD (8 dígitos fixo / 9 dígitos móvel), usa o DDD do
 * remetente (senderDDD) — regra de indicação: "usa o mesmo DDD de quem mandou".
 */
function normalizeBR(raw: string, senderDDD?: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d; // DDI + DDD + número
  if (d.length === 10 || d.length === 11) return "55" + d;                  // DDD + número
  if ((d.length === 8 || d.length === 9) && senderDDD && /^\d{2}$/.test(senderDDD)) {
    return "55" + senderDDD + d;                                            // faltou DDD → usa o do remetente
  }
  return null;
}

/** DDD (2 dígitos) do remetente, a partir do número E.164 dele. */
function dddDoRemetente(senderNumber: string): string | undefined {
  const d = (senderNumber ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return d.slice(2, 4);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2);
  return undefined;
}

// Telefone BR dentro de texto livre: com/sem +55, com/sem (DDD), com/sem
// separadores — ou uma sequência "crua" de 8 a 11 dígitos (ex: "981157376").
const PHONE_RE = /(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}|\d{8,11}/g;

// Palavras comuns ao redor de um número repassado que NÃO são nome próprio.
const STOP_NOME = new Set([
  "o", "a", "os", "as", "e", "de", "da", "do", "das", "dos", "que", "pra", "para", "pro",
  "com", "no", "na", "num", "numa", "meu", "minha", "dela", "dele", "deles", "seu", "sua",
  "numero", "telefone", "tel", "fone", "celular", "whatsapp", "whats", "zap", "contato",
  "manda", "mandar", "segue", "fala", "falar", "ligar", "liga", "aqui", "esse", "essa",
  "isso", "ela", "ele", "responsavel", "loterica", "loteria", "dona", "dono",
]);

/** Aproveita o nome quando a mensagem é tipo "<número> <nome>" ou "<nome> <número>". */
function nomeFromText(text: string, phoneMatch: string): string | undefined {
  const resto = (text || "").replace(phoneMatch, " ").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const palavras = resto.split(" ")
    .filter((w) => w.length >= 2 && !STOP_NOME.has(w.toLowerCase()));
  if (palavras.length === 0 || palavras.length > 2) return undefined; // só nomes curtos e claros
  const nome = palavras.join(" ");
  return nome.length <= 40 ? nome : undefined;
}

function saudacaoHora(): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  if (h >= 5 && h < 12) return "bom dia";
  if (h >= 12 && h < 18) return "boa tarde";
  return "boa noite";
}

/** Acha o 1º telefone BR válido numa string (waid tem prioridade). */
function phoneFromVcard(vcard: string, senderDDD?: string): string | null {
  const waid = /waid=(\d{10,15})/i.exec(vcard)?.[1];
  const fromWaid = waid && normalizeBR(waid, senderDDD);
  if (fromWaid) return fromWaid;
  for (const m of String(vcard).matchAll(PHONE_RE)) {
    const n = normalizeBR(m[0], senderDDD);
    if (n) return n;
  }
  return null;
}

/** Detecta um contato repassado: cartão de contato (vCard) ou número no texto. */
// deno-lint-ignore no-explicit-any
export function extractReferral(item: any, text: string, senderNumber?: string): { numero: string; nome?: string } | null {
  const senderDDD = dddDoRemetente(senderNumber ?? "");
  const msg = item?.message ?? {};
  // deno-lint-ignore no-explicit-any
  const cards: any[] = [];
  if (msg.contactMessage) cards.push(msg.contactMessage);
  if (Array.isArray(msg.contactsArrayMessage?.contacts)) cards.push(...msg.contactsArrayMessage.contacts);

  for (const card of cards) {
    const vcard = card?.vcard ?? card?.vCard ?? "";
    const numero = vcard ? phoneFromVcard(vcard, senderDDD) : null;
    if (numero) return { numero, nome: card?.displayName ?? card?.fullName ?? undefined };
    console.log("[referral] contato sem número extraível. card:", JSON.stringify(card).slice(0, 300));
  }

  // Número digitado no texto — mesmo acompanhado de palavras (ex: "981157376 leila").
  for (const m of (text ?? "").matchAll(PHONE_RE)) {
    const numero = normalizeBR(m[0], senderDDD);
    if (numero) return { numero, nome: nomeFromText(text, m[0]) };
  }
  return null;
}

interface ReferralParams {
  supabase: SupabaseClient;
  userId: string;
  instanceId: string;
  evolutionInstance: string;
  referidoNumero: string;
  referidoNome?: string;
  indicadorNome?: string;
  indicadorConversationId: string;
  indicadorNumero: string;
}

/**
 * Inicia proativamente a conversa com o contato indicado: cria o lead, a
 * conversa (com IA ligada) e envia uma mensagem de abertura citando quem
 * indicou. Também manda um "ok" curto para quem repassou o contato.
 */
export async function handleReferral(p: ReferralParams): Promise<void> {
  const { supabase } = p;
  const numero = normalizeBR(p.referidoNumero);
  if (!numero || numero === normalizeBR(p.indicadorNumero)) return;

  // Só age se o SDR estiver ativo (mesmo interruptor da IA).
  const { data: config } = await supabase
    .from("ai_config").select("ativo, delay_min_seg, delay_max_seg").eq("user_id", p.userId).maybeSingle();
  if (!config?.ativo) { console.log("[referral] SDR inativo, ignorando indicação"); return; }

  // Lead do contato indicado.
  const { data: lead } = await supabase.from("leads").upsert(
    { user_id: p.userId, nome: p.referidoNome?.trim() || numero, telefone: numero, status: "em_negociacao", origem: "indicacao" },
    { onConflict: "user_id,telefone" },
  ).select("id, nome").single();
  if (!lead) return;

  // Conversa do indicado — se já existir com mensagens, não cutuca de novo.
  const { data: existing } = await supabase
    .from("conversations").select("id").eq("user_id", p.userId).eq("lead_id", lead.id).maybeSingle();
  let convId = existing?.id;
  if (convId) {
    const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId);
    if ((count ?? 0) > 0) { console.log("[referral] indicado já tem conversa, pulando abertura"); return; }
  } else {
    const { data: novo } = await supabase.from("conversations")
      .insert({ user_id: p.userId, lead_id: lead.id, instance_id: p.instanceId, ai_enabled: true })
      .select("id").single();
    convId = novo?.id;
  }
  if (!convId) return;

  const primeiroNome = (lead.nome && !/^\d+$/.test(lead.nome)) ? lead.nome.split(/\s+/)[0] : "";
  const indicador = p.indicadorNome && !/^\d+$/.test(p.indicadorNome) ? p.indicadorNome.split(/\s+/)[0] : "Um contato";
  const intro =
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}, ${saudacaoHora()}! ${indicador} me repassou seu contato dizendo ` +
    "que eu posso tratar por aqui sobre as estratégias para aumentar as vendas da lotérica pelo WhatsApp. Posso te explicar rapidinho? 🙂";

  const delayMs = Math.round((Number(config.delay_min_seg ?? 3) + Math.random() * 3) * 1000);
  try {
    const { messageId } = await sendText(p.evolutionInstance, numero, intro, delayMs);
    await supabase.from("messages").insert({
      user_id: p.userId, conversation_id: convId, instance_id: p.instanceId,
      direction: "outbound", body: intro, evolution_message_id: messageId ?? null, status: "sent",
    });
    console.log("[referral] abertura enviada ao indicado", numero);
  } catch (e) {
    console.error("[referral] falha ao abrir contato:", e instanceof Error ? e.message : e);
  }

  // "Ok" curto para quem repassou o contato.
  try {
    const ack = `Perfeito${indicador && indicador !== "Um contato" ? "" : ""}! Já vou falar com ${primeiroNome || "ela"} por aqui. Muito obrigado! 🙏`;
    const { messageId } = await sendText(p.evolutionInstance, p.indicadorNumero, ack, 2000);
    await supabase.from("messages").insert({
      user_id: p.userId, conversation_id: p.indicadorConversationId, instance_id: p.instanceId,
      direction: "outbound", body: ack, evolution_message_id: messageId ?? null, status: "sent",
    });
  } catch { /* ack é opcional */ }

  // Quem repassou já cumpriu o papel: ENCERRA o atendimento nesse número.
  // Desliga a IA (sem follow-up nem novo pitch) e trava o agendador de follow-up.
  await supabase.from("conversations")
    .update({ ai_enabled: false, followup_count: 999 }).eq("id", p.indicadorConversationId);
}

interface RunSdrParams {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  leadId: string;
  instanceId: string;
  evolutionInstance: string;
  numero: string;
  triggerAt: string;          // created_at da última mensagem (gatilho / anti-duplicação)
  mode?: "reply" | "followup"; // followup = cutucar após silêncio
  silencioMin?: number;        // minutos de silêncio (modo followup)
}

// Ferramenta: consulta a agenda em tempo real ANTES de sugerir/confirmar.
const consultarDisponibilidade = {
  name: "consultar_disponibilidade",
  description:
    "Consulta a agenda em tempo real. Use ANTES de sugerir ou confirmar qualquer horário. " +
    "Passe data_iso para checar um horário específico; sem data_iso, devolve os próximos horários livres.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      data_iso: {
        type: Type.STRING,
        description: "Horário a checar em ISO 8601 com fuso -03:00 (ex: 2026-06-20T15:00:00-03:00). Opcional.",
      },
    },
  },
};

// Ferramenta que a IA chama quando um horário de reunião é combinado.
const agendarReuniao = {
  name: "agendar_reuniao",
  description:
    "Confirma e registra a reunião APÓS o cliente concordar com um dia/horário. " +
    "O sistema valida a disponibilidade: se o horário estiver ocupado, retorna alternativas — " +
    "nesse caso ofereça uma das alternativas em vez de confirmar. Sempre informe data_iso.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      quando_texto: {
        type: Type.STRING,
        description: "O horário combinado em linguagem natural (ex: 'sexta às 15h').",
      },
      data_iso: {
        type: Type.STRING,
        description: "Data e hora em ISO 8601 com fuso -03:00 (ex: 2026-06-20T15:00:00-03:00). OBRIGATÓRIO.",
      },
      observacao: { type: Type.STRING, description: "Detalhe relevante combinado. Opcional." },
    },
    required: ["quando_texto", "data_iso"],
  },
};

// Ferramenta de REMARCAÇÃO: usar APENAS quando o cliente já tem uma reunião
// marcada e pede para trocar o horário. Cancela a antiga e cria a nova.
const remarcarReuniao = {
  name: "remarcar_reuniao",
  description:
    "Remarca a reunião JÁ EXISTENTE deste cliente para um novo horário, quando ELE pedir para mudar. " +
    "Cancela a reunião anterior e cria a nova. O sistema valida a disponibilidade: se o novo horário " +
    "estiver ocupado, retorna alternativas — nesse caso ofereça uma delas em vez de confirmar. Sempre informe data_iso.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      quando_texto: {
        type: Type.STRING,
        description: "O NOVO horário combinado em linguagem natural (ex: 'sábado às 10h').",
      },
      data_iso: {
        type: Type.STRING,
        description: "Nova data e hora em ISO 8601 com fuso -03:00 (ex: 2026-06-20T10:00:00-03:00). OBRIGATÓRIO.",
      },
      observacao: { type: Type.STRING, description: "Detalhe relevante combinado. Opcional." },
    },
    required: ["quando_texto", "data_iso"],
  },
};

/**
 * Quebra uma mensagem longa em 2–3 bolhas (em fronteiras de frase), para
 * leitura mais natural. Mensagens curtas voltam inteiras (1 bolha). Nunca
 * corta no meio de uma frase.
 */
function splitMessage(text: string): string[] {
  const t = (text ?? "").trim();
  if (t.length <= 220) return [t];
  const target = t.length > 460 ? 3 : 2;
  const frases = t.replace(/\s*\n+\s*/g, " ")
    .match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];
  if (frases.length <= 1) return [t]; // frase única gigante: não corta no meio
  const alvo = t.length / target;
  const partes: string[] = [];
  let buf = "";
  for (const f of frases) {
    if (buf && buf.length + f.length > alvo && partes.length < target - 1) {
      partes.push(buf.trim());
      buf = f;
    } else {
      buf = buf ? `${buf} ${f}` : f;
    }
  }
  if (buf.trim()) partes.push(buf.trim());
  return partes;
}

function agoraEmSP(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function buildSystem(playbook: string, persona: string, empresa: string, leadNome: string, leadEmpresa: string | null, agenda: string, aprendizados: string) {
  // Substitui as variáveis conhecidas direto no roteiro (evita o modelo
  // copiar "{{Empresa}}"/"{{Nome}}" literalmente quando o valor existe).
  const primeiroNome = leadNome ? leadNome.trim().split(/\s+/)[0] : "";
  const empContato = (leadEmpresa ?? "").trim();
  let roteiro = playbook;
  roteiro = roteiro.replace(/\{\{\s*Saudacao\s*\}\}/gi, saudacaoHora());
  if (primeiroNome) roteiro = roteiro.replace(/\{\{\s*Nome\s*\}\}/gi, primeiroNome);
  if (empContato) roteiro = roteiro.replace(/\{\{\s*Empresa\s*\}\}/gi, empContato);

  return [
    roteiro.trim(),
    "",
    "## Contexto desta conversa",
    `- Você é ${persona}, da ${empresa}.`,
    `- Nome do contato: ${leadNome || "(desconhecido — pergunte)"}.`,
    leadEmpresa ? `- Empresa do contato: ${leadEmpresa}.` : "",
    `- Agora é ${agoraEmSP()} (horário de Brasília).`,
    "",
    "## Agenda em tempo real (já consultada agora — use estes dados ao propor horários)",
    agenda,
    "",
    aprendizados
      ? "## Aprendizados (lições de conversas anteriores — aplique sempre que fizer sentido):\n" + aprendizados
      : "",
    "## Regras de operação (OBRIGATÓRIAS — valem acima do roteiro)",
    "- Responda SEMPRE em uma única mensagem curta de WhatsApp, em português, tom humano e natural. Sem listas, sem markdown.",
    "- Siga o fluxo: cumprimentar → confirmar que fala com o responsável → pegar o nome → gerar interesse → propor uma reunião de 15 min → combinar o horário. Faça UMA pergunta por vez.",
    "- RESPONDA ANTES DE AVANÇAR: se o cliente fizer uma pergunta direta (seu nome, de qual empresa você é, qual lotérica, etc.) ou der uma instrução, responda de forma curtíssima e direta PRIMEIRO; só depois retome o funil. NUNCA ignore o que o cliente acabou de dizer nem force um bloco pronto por cima da pergunta dele.",
    "- AUTORIDADE: nunca diga 'número 1', 'Top 1', 'Top 10' ou similar. Use sempre 'uma das lotéricas que mais vendem online' (ou 'uma das que mais vende'). Credível, sem exageros.",
    "- PROVA SOCIAL (case real, NÃO invente): a lotérica de referência é a Lotérica São José, de PINHEIRO, interior do MARANHÃO (cidade de ~80 mil habitantes). NUNCA diga que ela é de São Luís nem de qualquer capital. Se perguntarem a cidade, responda 'Pinheiro, no interior do Maranhão'. O mérito do case é exatamente esse: ela alcançou resultados expressivos vendendo ONLINE a partir de uma cidade pequena do interior — algo impossível só vendendo no balcão e impressionante por desbancar lotéricas de grandes capitais. Nunca invente cidade, números ou nomes de cases que você não tenha certeza.",
    "- REFERÊNCIAS E CONTATOS (dados REAIS — use quando o cliente perguntar ou pedir prova; nunca invente outros @ ou cidades): Instagram da lotérica de referência (Lotérica São José): @lotericasaojose_ — se o cliente quiser ver resultados/prova, convide-o a olhar esse perfil. Nossa agência é a Beacons, fica em São Luís do Maranhão; Instagram da agência: @beaconssolution. Compartilhe esses dados com naturalidade quando perguntarem sobre Instagram, localização ou provas — e use o Instagram da lotérica como prova social quando fizer sentido. NÃO confunda: a lotérica é de Pinheiro (interior); a AGÊNCIA é que fica em São Luís.",
    "- OBJEÇÃO DE PREÇO: não fale valores. Diga algo como 'a gente nem gosta de falar de valor agora porque a ideia é crescer junto com a lotérica' e volte para o agendamento.",
    "- PEDIDO DE LIGAÇÃO ('me liga', 'liga para X'): não ligue. Explique com naturalidade que precisa mostrar o mecanismo na tela, por isso é uma rápida reunião online, e proponha um horário.",
    "- MENSAGEM AUTOMÁTICA DO CLIENTE: se a última mensagem parecer um auto-atendimento da empresa (ex: 'seja bem-vindo', 'horário de atendimento', 'deixe sua mensagem', menu de opções/números), NÃO dispare a proposta de valor. Apenas cumprimente de forma curta e pergunte se está falando com o responsável.",
    "- AGENDAMENTO: sugira horários exatos (ex: 14:30 ou 15h) e seja flexível para remarcar. Quando o cliente confirmar, chame a função agendar_reuniao e confirme calorosamente.",
    "- PERÍODO PEDIDO (OBRIGATÓRIO): se o cliente indicar um período, proponha e confirme APENAS dentro dele — 'cedo'/'de manhã'/'antes do almoço' = 08h–11h; 'depois do almoço'/'à tarde' = 12h–17h; 'à noite'/'fim do dia' = 18h em diante; 'depois das X' = só após X. NUNCA ofereça a tarde quando ele pediu de manhã (nem o contrário). Consulte a disponibilidade já mirando esse período.",
    "- LEIA O CLIMA (não despeje o pitch): se o cliente está se despedindo ('boa noite', 'falo amanhã') ou pede para falar depois/amanhã, NÃO repita a proposta de valor nem mande textão. Responda em UMA mensagem curta: cumprimente pelo nome, diga que sim, fala no momento que ele pediu, e já proponha UM horário exato dentro do período dele (ex.: 'amanhã às 09h?'). Os detalhes (case, faturamento) ficam para a reunião.",
    "- REUNIÃO JÁ MARCADA: se o contexto da agenda indicar que ESTE cliente já tem uma reunião marcada, NUNCA ofereça novos horários nem chame agendar_reuniao por conta própria — mesmo que o cliente só diga 'ok'/'combinado'. Apenas confirme/relembre o horário já combinado.",
    "- REMARCAÇÃO (só se o cliente PEDIR para mudar): quando o cliente já tem reunião marcada e pede outro horário, use consultar_disponibilidade para confirmar que o novo horário está livre e então chame remarcar_reuniao (ela cancela a anterior e cria a nova — nunca ficam duas). NÃO use agendar_reuniao para remarcar. Se o novo horário estiver ocupado, ofereça as alternativas livres.",
    "- DISPONIBILIDADE (tempo real): SEMPRE chame consultar_disponibilidade ANTES de sugerir ou confirmar qualquer horário. Ofereça apenas horários livres. Se o cliente pedir um horário ocupado, avise que nele não dá e ofereça as opções livres mais próximas que a função retornar. Se agendar_reuniao responder que está ocupado, NÃO confirme: ofereça uma das alternativas.",
    "- NUNCA PROMETA RESPONDER DEPOIS: você NÃO consegue voltar sozinho à conversa mais tarde. É PROIBIDO dizer 'vou verificar com a equipe', 'deixa eu confirmar a agenda e já te retorno', 'já te aviso', 'volto já', 'aguarde um momento' ou qualquer promessa de resposta futura. Você TEM acesso à agenda AGORA: chame consultar_disponibilidade e, no MESMO turno, já responda ao cliente com os horários livres ou confirme a reunião. Resolva o agendamento sempre na hora, sem deixar o cliente esperando.",
    "- LINK DA REUNIÃO: o link é enviado NO DIA da reunião, 15 minutos antes do horário — NUNCA diga 'amanhã' por padrão. Use a data/hora atual acima para descobrir o dia certo: diga 'no dia, uns 15 minutinhos antes, te envio o link' ou cite o dia exato (ex: 'na sexta, 15 min antes'). Só fale 'amanhã' se a reunião for realmente no dia seguinte.",
    "- NÃO REPITA: nunca reenvie uma mensagem que você já mandou, mesmo que o cliente escreva em mensagens picadas ou demore a responder. Continue de onde parou.",
    "- VARIÁVEIS: trechos como {{Nome}} e {{Empresa}} são apenas exemplos. NUNCA escreva chaves {{ }} nem colchetes [ ] na mensagem enviada. Se NÃO souber a empresa do contato, fale de forma natural SEM citar nome de empresa (ex: 'Olá, tudo bem?' em vez de 'Olá, pessoal da {{Empresa}}'). Se não souber o nome, pergunte — nunca use um placeholder no lugar.",
    "- Nunca invente informações. Se o cliente sair muito do escopo ou pedir um humano, diga educadamente que vai chamar alguém do time.",
  ].filter(Boolean).join("\n");
}

// deno-lint-ignore no-explicit-any
type Content = { role: "user" | "model"; parts: any[] };

export async function runSdr(p: RunSdrParams): Promise<void> {
  const { supabase } = p;
  console.log("[sdr] start", { conversationId: p.conversationId });

  // 1) Config do SDR + checagens de ativação
  const { data: config } = await supabase
    .from("ai_config").select("*").eq("user_id", p.userId).maybeSingle();
  if (!config) { console.log("[sdr] sem ai_config para o usuário — salve a config na aba SDR com IA"); return; }
  if (!config.ativo) { console.log("[sdr] ai_config existe mas está INATIVO (ligue a IA e salve)"); return; }

  const { data: conv } = await supabase
    .from("conversations").select("ai_enabled, quiet_reason").eq("id", p.conversationId).maybeSingle();
  if (!conv || conv.ai_enabled === false) { console.log("[sdr] conversa com IA desligada (ai_enabled=false)"); return; }

  // Reunião já marcada para ESTA conversa? Vincula o agendamento ao contato e
  // muda o comportamento: nunca remarcar/re-oferecer; no follow-up, nem cutucar.
  let reuniaoExistente = await activeMeetingFor(supabase, p.userId, p.conversationId, p.leadId);
  if ((p.mode ?? "reply") === "followup" && reuniaoExistente) {
    console.log("[sdr] follow-up ignorado: já há reunião marcada nesta conversa");
    return;
  }

  // Anti-loop / mensagens picadas: ao responder, espera alguns segundos para o
  // cliente terminar de digitar. Se chegar mensagem nova nesse meio, aborta —
  // só a execução do ÚLTIMO fragmento responde (com o contexto completo).
  if ((p.mode ?? "reply") === "reply") {
    await sleep(6000);
    const { count } = await supabase
      .from("messages").select("id", { count: "exact", head: true })
      .eq("conversation_id", p.conversationId).gt("created_at", p.triggerAt);
    if ((count ?? 0) > 0) { console.log("[sdr] debounce: chegou mensagem mais nova, abortando este turno"); return; }
  }

  // 2) Lead + histórico
  const { data: lead } = await supabase
    .from("leads").select("nome, empresa").eq("id", p.leadId).maybeSingle();

  // Nome do atendente pode ser personalizado por chip (teste A/B de persona).
  // Se este chip tiver um nome próprio, ele tem prioridade sobre o nome global.
  const { data: inst } = await supabase
    .from("whatsapp_instances").select("persona_nome").eq("id", p.instanceId).maybeSingle();
  const persona = inst?.persona_nome?.trim() || config.persona_nome;

  const { data: hist } = await supabase
    .from("messages").select("direction, body, created_at, is_continuation")
    .eq("conversation_id", p.conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  // Monta o histórico (inbound=user, outbound=model). O Gemini exige começar
  // com 'user' — descartamos mensagens 'model' iniciais (a abertura do disparo).
  const contents: Content[] = [];
  for (const m of hist ?? []) {
    const role = m.direction === "inbound" ? "user" : "model";
    const text = (m.body ?? "").trim();
    if (!text) continue;
    if (contents.length === 0 && role === "model") continue;
    contents.push({ role, parts: [{ text }] });
  }
  const mode = p.mode ?? "reply";

  if (mode === "reply") {
    if (contents.length === 0) { console.log("[sdr] sem histórico"); return; }
    if (contents[contents.length - 1].role !== "user") {
      console.log("[sdr] histórico sem turno de usuário no fim — nada a responder");
      return;
    }
  } else {
    // TETO ANTI-SPAM: nunca acumular muitas mensagens sem resposta. Conta as
    // mensagens outbound consecutivas desde a última resposta do cliente (ou
    // desde o início, se ele nunca respondeu) — abertura + follow-ups. Ao bater
    // o teto, para de cutucar. (followup_max = nº de follow-ups; +1 = a abertura.)
    let semResposta = 0;
    for (let i = (hist?.length ?? 0) - 1; i >= 0; i--) {
      const m = hist![i];
      if (m.direction === "outbound") { if (!m.is_continuation) semResposta++; } // continuação não conta
      else break; // achou uma resposta do cliente: zera a contagem
    }
    // Reabertura após uma falta (no-show): é um novo evento legítimo, então NÃO
    // é barrada pelo teto histórico de mensagens — o followup_count (zerado na
    // reabertura) + followup_max ainda limitam quantas tentativas de remarcar.
    const noShowReengage = conv.quiet_reason === "no_show";
    const followupMax = Number(config.followup_max ?? 2);
    const maxSemResposta = followupMax + 1;
    if (!noShowReengage && semResposta >= maxSemResposta) {
      console.log(`[sdr] follow-up ignorado: ${semResposta} mensagens sem resposta (teto ${maxSemResposta})`);
      // Trava o agendador para não reprocessar esta conversa a cada ciclo.
      // (Zera quando o cliente responder — o webhook reseta followup_count.)
      await supabase.from("conversations").update({ followup_count: followupMax }).eq("id", p.conversationId);
      return;
    }

    // Follow-up por inatividade. ATENÇÃO: pode NÃO haver turno do cliente ainda
    // (ele nunca respondeu à abertura). Nesse caso 'contents' fica vazio porque a
    // abertura (outbound) é descartada — mas ainda queremos cutucar. Recuperamos
    // o que já enviamos como contexto e criamos um turno 'user' com a instrução.
    const enviadas = (hist ?? [])
      .filter((m) => m.direction === "outbound" && (m.body ?? "").trim())
      .slice(-3)
      .map((m) => (m.body ?? "").trim());
    const jaEnviado = enviadas.length
      ? `Mensagens que VOCÊ já enviou a este contato (NÃO repita, continue de onde parou):\n- ${enviadas.join("\n- ")}\n\n`
      : "";
    // Retomada COMPREENSIVA: o cliente havia pedido para retornar depois
    // (semana corrida). Já se passaram ~2 dias → reabrir com leveza.
    const instrucao = noShowReengage
      ? "Este cliente tinha uma reunião MARCADA mas NÃO compareceu (no-show). Reabra a conversa de forma leve e gentil, SEM cobrar nem culpar " +
        "(jamais diga 'você faltou', 'cadê você', 'fiquei te esperando'). Demonstre compreensão de que imprevistos acontecem e PROPONHA REMARCAR " +
        "para um novo horário próximo: consulte a disponibilidade antes e ofereça UM horário exato e livre (ex.: 'amanhã às 09h?'). Quando o cliente " +
        "aceitar, chame agendar_reuniao normalmente. Mensagem curta e calorosa, sem repetir mensagens anteriores e sem mencionar esta instrução."
      : conv.quiet_reason === "deferral"
      ? "O cliente havia dito que a semana estava corrida/imprevisível e que retornaria depois; já se passaram ~2 dias e ele não voltou. " +
        "Reabra a conversa em tom COMPREENSIVO e leve (algo como 'Olá, Cleber! Tudo bem? Sei que a semana estava corrida...'), " +
        "pergunte se as coisas se acalmaram e PROPONHA UM horário exato e próximo para a rápida reunião (consulte a disponibilidade antes). " +
        "Nada de cobrar ou pressionar; sem repetir mensagens anteriores e sem mencionar esta instrução."
      : `O cliente está há cerca de ${p.silencioMin ?? 30} minutos sem responder. ` +
        "Envie UMA mensagem curta para REATIVAR o interesse — NÃO cobre resposta (nada de 'e aí?', 'conseguiu ver?', 'tudo certo?'). " +
        "Use leve imprevisibilidade/curiosidade sobre o mecanismo de captação de clientes (um resultado concreto, um gancho novo ou uma pergunta provocativa), " +
        "retomando de onde parou, sem repetir o que já disse e sem mencionar esta instrução. " +
        "Se a conversa já estava combinando um horário, consulte a disponibilidade e PROPONHA um horário livre você mesmo, em vez de só perguntar.";
    contents.push({
      role: "user",
      parts: [{ text: `[INSTRUÇÃO INTERNA DO SISTEMA — não é mensagem do cliente] ${jaEnviado}${instrucao}` }],
    });
    // Consome o motivo: a próxima cutucada (se houver) volta ao tom normal.
    if (conv.quiet_reason === "deferral" || conv.quiet_reason === "no_show") {
      await supabase.from("conversations").update({ quiet_reason: null }).eq("id", p.conversationId);
    }
  }

  let agenda = await agendaResumo(supabase, p.userId, p.conversationId);
  if (reuniaoExistente) {
    const quando = reuniaoExistente.quando_texto?.trim() ||
      (reuniaoExistente.scheduled_for ? labelSlot(new Date(reuniaoExistente.scheduled_for)) : "horário já combinado");
    agenda +=
      `\n- ⚠️ ESTE CLIENTE JÁ TEM REUNIÃO MARCADA (${quando}). NÃO agende outra nem ofereça novos horários por conta própria; ` +
      "apenas confirme/relembre esse horário. SÓ se o cliente PEDIR para mudar, use remarcar_reuniao (consulte a disponibilidade antes) — nunca agendar_reuniao.";
  }

  // Aprendizados aprovados (self-reflection loop) injetados no prompt.
  const { data: licoes } = await supabase
    .from("sdr_aprendizados").select("texto")
    .eq("user_id", p.userId).eq("status", "aprovado")
    .order("created_at", { ascending: false }).limit(25);
  const aprendizados = (licoes ?? []).map((l) => `- ${l.texto}`).join("\n");

  const systemInstruction = buildSystem(
    config.playbook, persona, config.empresa,
    lead?.nome ?? "", lead?.empresa ?? null, agenda, aprendizados,
  );

  // Garante um modelo Gemini válido (rows antigas podem ter modelo de outro provedor)
  const model = typeof config.model === "string" && config.model.startsWith("gemini")
    ? config.model : DEFAULT_MODEL;

  // Cliente Gemini (lazy: chave faltando não derruba o webhook, só pula o SDR)
  let ai: GoogleGenAI;
  try { ai = getAi(); } catch { console.error("[sdr] GEMINI_API_KEY não configurada"); return; }
  console.log("[sdr] chamando Gemini", { model, mode });

  // 3) Loop de function calling até a IA terminar o turno
  let finalText = "";
  let truncado = false; // resposta cortada por limite de tokens?
  for (let i = 0; i < 4; i++) {
    const resp = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        // Thinking MÉDIO para decidir melhor agenda/ferramentas. O orçamento de
        // saída precisa caber thinking (~1024) + resposta — senão corta a frase.
        maxOutputTokens: 3072,
        thinkingConfig: { thinkingBudget: 1024 },
        tools: [{ functionDeclarations: [consultarDisponibilidade, agendarReuniao, remarcarReuniao] }],
      },
    });

    const text = (resp.text ?? "").trim();
    if (text) { finalText = text; truncado = resp.candidates?.[0]?.finishReason === "MAX_TOKENS"; }

    const calls = resp.functionCalls ?? [];
    if (!calls.length) break;

    // Acrescenta o turno do modelo (com as functionCalls) ao histórico.
    const modelParts = resp.candidates?.[0]?.content?.parts ?? calls.map((c) => ({ functionCall: c }));
    contents.push({ role: "model", parts: modelParts });

    // Executa cada função e devolve o resultado.
    // deno-lint-ignore no-explicit-any
    const responseParts: any[] = [];
    for (const call of calls) {
      if (call.name === "consultar_disponibilidade") {
        const args = (call.args ?? {}) as { data_iso?: string };
        let result: Record<string, unknown>;
        if (args.data_iso) {
          const av = await checkAvailability(supabase, p.userId, args.data_iso, undefined, p.conversationId);
          result = av.ok
            ? { disponivel: true }
            : { disponivel: false, motivo: av.motivo, alternativas: await suggestSlots(supabase, p.userId, args.data_iso, 3, p.conversationId) };
        } else {
          result = { proximos_horarios_livres: await suggestSlots(supabase, p.userId, undefined, 3, p.conversationId) };
        }
        responseParts.push({ functionResponse: { name: "consultar_disponibilidade", response: result } });
      } else if (call.name === "agendar_reuniao") {
        const args = (call.args ?? {}) as { quando_texto?: string; data_iso?: string; observacao?: string };
        // Já existe reunião nesta conversa? Não confirme nem remarque por conta
        // própria — só o atendente humano remarca. Rede de segurança anti-loop.
        if (reuniaoExistente) {
          const quando = reuniaoExistente.quando_texto?.trim() ||
            (reuniaoExistente.scheduled_for ? labelSlot(new Date(reuniaoExistente.scheduled_for)) : "horário já combinado");
          responseParts.push({
            functionResponse: {
              name: "agendar_reuniao",
              response: { agendado: false, ja_marcada: true, quando, instrucao: `Este cliente JÁ TEM reunião marcada (${quando}). NÃO marque outra nem remarque — apenas confirme calorosamente esse mesmo horário.` },
            },
          });
          continue;
        }
        // Exclui a própria conversa do conflito (não há reunião dela ainda, mas
        // mantém consistente caso uma corrida tenha criado uma).
        const av = await checkAvailability(supabase, p.userId, args.data_iso ?? "", undefined, p.conversationId);
        if (!av.ok) {
          // Horário ocupado/ inválido → devolve alternativas e NÃO agenda.
          const alternativas = await suggestSlots(supabase, p.userId, args.data_iso, 3, p.conversationId);
          responseParts.push({
            functionResponse: {
              name: "agendar_reuniao",
              response: { agendado: false, motivo: av.motivo, alternativas, instrucao: "Ofereça uma destas alternativas ao cliente; não confirme este horário." },
            },
          });
        } else {
          await supabase.from("meetings").insert({
            user_id: p.userId,
            lead_id: p.leadId,
            conversation_id: p.conversationId,
            instance_id: p.instanceId,
            quando_texto: args.quando_texto ?? "(não informado)",
            scheduled_for: args.data_iso ?? null,
            duracao_min: av.settings.duracao,
            meet_link: av.settings.meetLink || null,
            observacao: args.observacao ?? null,
            titulo: `Reunião com ${lead?.nome ?? p.numero}`,
          });
          await supabase.from("leads").update({ status: "reuniao_agendada" }).eq("id", p.leadId);
          responseParts.push({
            functionResponse: {
              name: "agendar_reuniao",
              response: { agendado: true, quando: args.quando_texto, instrucao: "Confirme calorosamente. NÃO mande o link agora — ele será enviado automaticamente 15 min antes." },
            },
          });
        }
      } else if (call.name === "remarcar_reuniao") {
        const args = (call.args ?? {}) as { quando_texto?: string; data_iso?: string; observacao?: string };
        // Valida o NOVO horário (exclui a própria conversa: a reunião antiga,
        // que será cancelada, não pode bloquear o novo horário).
        const av = await checkAvailability(supabase, p.userId, args.data_iso ?? "", undefined, p.conversationId);
        if (!av.ok) {
          const alternativas = await suggestSlots(supabase, p.userId, args.data_iso, 3, p.conversationId);
          responseParts.push({
            functionResponse: {
              name: "remarcar_reuniao",
              response: { remarcado: false, motivo: av.motivo, alternativas, instrucao: "O novo horário não está livre. Ofereça uma destas alternativas; não confirme a mudança." },
            },
          });
        } else {
          // Cancela a reunião antiga deste contato (se houver) e cria a nova.
          if (reuniaoExistente) {
            await supabase.from("meetings").update({ status: "cancelada" }).eq("id", reuniaoExistente.id);
          }
          await supabase.from("meetings").insert({
            user_id: p.userId,
            lead_id: p.leadId,
            conversation_id: p.conversationId,
            instance_id: p.instanceId,
            quando_texto: args.quando_texto ?? "(não informado)",
            scheduled_for: args.data_iso ?? null,
            duracao_min: av.settings.duracao,
            meet_link: av.settings.meetLink || null,
            observacao: args.observacao ?? null,
            titulo: `Reunião com ${lead?.nome ?? p.numero}`,
          });
          await supabase.from("leads").update({ status: "reuniao_agendada" }).eq("id", p.leadId);
          // A partir daqui a "reunião existente" desta conversa é a NOVA.
          reuniaoExistente = { id: "", quando_texto: args.quando_texto ?? null, scheduled_for: args.data_iso ?? null };
          responseParts.push({
            functionResponse: {
              name: "remarcar_reuniao",
              response: { remarcado: true, quando: args.quando_texto, instrucao: "Confirme calorosamente o NOVO horário. A reunião anterior foi cancelada. NÃO mande o link agora — ele vai automaticamente 15 min antes." },
            },
          });
        }
      } else {
        responseParts.push({ functionResponse: { name: call.name, response: { result: "ferramenta desconhecida" } } });
      }
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Filtro de segurança: nunca enviar placeholder cru ({{Empresa}}, [Nome]…).
  // Remove a preposição pendurada junto (ex: "da {{Empresa}}" -> "").
  finalText = finalText
    .replace(/\b(d[aeo]s?|para a|pra|com a|n[ao]s?)\s*\{\{[^}]*\}\}/gi, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([!?.,;:])/g, "$1")
    .trim();

  // Rede de segurança: se a resposta veio cortada por limite de tokens, apara
  // até a última frase completa — nunca enviar uma frase pela metade.
  if (truncado) {
    const completo = finalText.match(/^[\s\S]*[.!?…](?=\s|$)/);
    if (completo && completo[0].trim().length >= 20) finalText = completo[0].trim();
    console.warn("[sdr] resposta truncada (MAX_TOKENS) — aparada até a última frase.");
  }

  if (!finalText) { console.log("[sdr] Gemini não retornou texto (ou só placeholder)"); return; }
  console.log("[sdr] resposta gerada:", finalText.slice(0, 80));

  // 4) Anti-duplicação: se chegou mensagem mais nova que a que disparou, aborta.
  const { count } = await supabase
    .from("messages").select("id", { count: "exact", head: true })
    .eq("conversation_id", p.conversationId)
    .gt("created_at", p.triggerAt);
  if ((count ?? 0) > 0) return;

  // 5) Delay humanizado ("digitando…") proporcional ao tamanho da resposta,
  //    dentro da faixa configurada pelo usuário.
  const dmin = Number(config.delay_min_seg ?? 3);
  const dmax = Number(config.delay_max_seg ?? 8);
  const base = dmin + Math.random() * Math.max(0, dmax - dmin);
  const porTamanho = Math.min(dmax, finalText.length / 25); // textos maiores "demoram" mais a digitar
  const delayMs = Math.round(Math.max(dmin, Math.max(base, porTamanho)) * 1000);

  // 6) Envia pela mesma instância, fragmentando mensagens longas em 2–3 bolhas.
  //    Só a 1ª bolha conta no histórico/teto (as demais são is_continuation).
  const partes = splitMessage(finalText);
  let enviouAlgo = false;
  try {
    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      // 1ª bolha usa o delay humanizado; as seguintes, um delay menor proporcional.
      const d = i === 0 ? delayMs : Math.round(Math.min(dmax, Math.max(1.5, parte.length / 28)) * 1000);
      const { messageId } = await sendText(p.evolutionInstance, p.numero, parte, d);
      await supabase.from("messages").insert({
        user_id: p.userId,
        conversation_id: p.conversationId,
        instance_id: p.instanceId,
        direction: "outbound",
        body: parte,
        evolution_message_id: messageId ?? null,
        status: "sent",
        is_continuation: i > 0, // continuação não conta no teto anti-spam
      });
      enviouAlgo = true;
    }
  } catch (e) {
    console.error("SDR sendText falhou:", e instanceof Error ? e.message : e);
  }
  // Follow-up conta UMA vez por turno (não por bolha).
  if (enviouAlgo && mode === "followup") {
    const { data: c } = await supabase
      .from("conversations").select("followup_count").eq("id", p.conversationId).maybeSingle();
    await supabase.from("conversations")
      .update({ followup_count: (c?.followup_count ?? 0) + 1 }).eq("id", p.conversationId);
  }
}
