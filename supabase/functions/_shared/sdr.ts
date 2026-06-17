// =====================================================================
// SDR com IA (Google Gemini) — conduz a conversa seguindo o playbook do
// usuário, qualifica o lead e agenda a reunião (function calling).
// Roda em background a partir do webhook.
// =====================================================================
import { GoogleGenAI, Type } from "npm:@google/genai@2.8.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendText } from "./evolution.ts";

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

// Ferramenta que a IA chama quando um horário de reunião é combinado.
const agendarReuniao = {
  name: "agendar_reuniao",
  description:
    "Registra a reunião quando o cliente CONFIRMA um horário específico. " +
    "Só chame após o cliente concordar com um dia/horário. Depois de chamar, " +
    "responda confirmando o agendamento de forma calorosa.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      quando_texto: {
        type: Type.STRING,
        description: "O horário combinado em linguagem natural (ex: 'amanhã às 18h', 'segunda às 10h').",
      },
      data_iso: {
        type: Type.STRING,
        description: "Data e hora em ISO 8601 (ex: 2026-06-17T18:00:00-03:00), se conseguir inferir. Opcional.",
      },
      observacao: { type: Type.STRING, description: "Detalhe relevante combinado. Opcional." },
    },
    required: ["quando_texto"],
  },
};

function agoraEmSP(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function buildSystem(playbook: string, persona: string, empresa: string, leadNome: string, leadEmpresa: string | null) {
  return [
    playbook.trim(),
    "",
    "## Contexto desta conversa",
    `- Você é ${persona}, da ${empresa}.`,
    `- Nome do contato: ${leadNome || "(desconhecido — pergunte)"}.`,
    leadEmpresa ? `- Empresa do contato: ${leadEmpresa}.` : "",
    `- Agora é ${agoraEmSP()} (horário de Brasília).`,
    "",
    "## Regras de operação (OBRIGATÓRIAS — valem acima do roteiro)",
    "- Responda SEMPRE em uma única mensagem curta de WhatsApp, em português, tom humano e natural. Sem listas, sem markdown.",
    "- Siga o fluxo: cumprimentar → confirmar que fala com o responsável → pegar o nome → gerar interesse → propor uma reunião de 15 min → combinar o horário. Faça UMA pergunta por vez.",
    "- RESPONDA ANTES DE AVANÇAR: se o cliente fizer uma pergunta direta (seu nome, de qual empresa você é, qual lotérica, etc.) ou der uma instrução, responda de forma curtíssima e direta PRIMEIRO; só depois retome o funil. NUNCA ignore o que o cliente acabou de dizer nem force um bloco pronto por cima da pergunta dele.",
    "- AUTORIDADE: nunca diga 'número 1', 'Top 1', 'Top 10' ou similar. Use sempre 'uma das lotéricas que mais vendem online' (ou 'uma das que mais vende'). Credível, sem exageros.",
    "- OBJEÇÃO DE PREÇO: não fale valores. Diga algo como 'a gente nem gosta de falar de valor agora porque a ideia é crescer junto com a lotérica' e volte para o agendamento.",
    "- PEDIDO DE LIGAÇÃO ('me liga', 'liga para X'): não ligue. Explique com naturalidade que precisa mostrar o mecanismo na tela, por isso é uma rápida reunião online, e proponha um horário.",
    "- MENSAGEM AUTOMÁTICA DO CLIENTE: se a última mensagem parecer um auto-atendimento da empresa (ex: 'seja bem-vindo', 'horário de atendimento', 'deixe sua mensagem', menu de opções/números), NÃO dispare a proposta de valor. Apenas cumprimente de forma curta e pergunte se está falando com o responsável.",
    "- AGENDAMENTO: sugira horários exatos (ex: 14:30 ou 15h) e seja flexível para remarcar. Quando o cliente confirmar, chame a função agendar_reuniao e confirme calorosamente.",
    "- LINK DA REUNIÃO: o link é enviado NO DIA da reunião, 15 minutos antes do horário — NUNCA diga 'amanhã' por padrão. Use a data/hora atual acima para descobrir o dia certo: diga 'no dia, uns 15 minutinhos antes, te envio o link' ou cite o dia exato (ex: 'na sexta, 15 min antes'). Só fale 'amanhã' se a reunião for realmente no dia seguinte.",
    "- NÃO REPITA: nunca reenvie uma mensagem que você já mandou, mesmo que o cliente escreva em mensagens picadas ou demore a responder. Continue de onde parou.",
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
    .from("conversations").select("ai_enabled").eq("id", p.conversationId).maybeSingle();
  if (!conv || conv.ai_enabled === false) { console.log("[sdr] conversa com IA desligada (ai_enabled=false)"); return; }

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

  const { data: hist } = await supabase
    .from("messages").select("direction, body, created_at")
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
  if (contents.length === 0) { console.log("[sdr] sem histórico"); return; }
  if (mode === "reply" && contents[contents.length - 1].role !== "user") {
    console.log("[sdr] histórico sem turno de usuário no fim — nada a responder");
    return;
  }
  if (mode === "followup") {
    // Cliente em silêncio: instrução interna para o bot dar andamento sozinho.
    contents.push({
      role: "user",
      parts: [{
        text:
          `[INSTRUÇÃO INTERNA DO SISTEMA — não é mensagem do cliente] O cliente está há cerca de ${p.silencioMin ?? 30} minutos sem responder. ` +
          "Envie UMA mensagem curta para REATIVAR o interesse — NÃO cobre resposta (nada de 'e aí?', 'conseguiu ver?', 'tudo certo?'). " +
          "Use leve imprevisibilidade/curiosidade sobre o mecanismo de captação de clientes (um resultado concreto, um gancho novo ou uma pergunta provocativa), " +
          "retomando de onde parou, sem repetir o que já disse e sem mencionar esta instrução.",
      }],
    });
  }

  const systemInstruction = buildSystem(
    config.playbook, config.persona_nome, config.empresa,
    lead?.nome ?? "", lead?.empresa ?? null,
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
  for (let i = 0; i < 4; i++) {
    const resp = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 1024,
        tools: [{ functionDeclarations: [agendarReuniao] }],
      },
    });

    const text = (resp.text ?? "").trim();
    if (text) finalText = text;

    const calls = resp.functionCalls ?? [];
    if (!calls.length) break;

    // Acrescenta o turno do modelo (com as functionCalls) ao histórico.
    const modelParts = resp.candidates?.[0]?.content?.parts ?? calls.map((c) => ({ functionCall: c }));
    contents.push({ role: "model", parts: modelParts });

    // Executa cada função e devolve o resultado.
    // deno-lint-ignore no-explicit-any
    const responseParts: any[] = [];
    for (const call of calls) {
      if (call.name === "agendar_reuniao") {
        const args = (call.args ?? {}) as { quando_texto?: string; data_iso?: string; observacao?: string };
        await supabase.from("meetings").insert({
          user_id: p.userId,
          lead_id: p.leadId,
          conversation_id: p.conversationId,
          quando_texto: args.quando_texto ?? "(não informado)",
          scheduled_for: args.data_iso ?? null,
          observacao: args.observacao ?? null,
          titulo: `Reunião com ${lead?.nome ?? p.numero}`,
        });
        await supabase.from("leads").update({ status: "reuniao_agendada" }).eq("id", p.leadId);
        responseParts.push({
          functionResponse: {
            name: "agendar_reuniao",
            response: { result: `Reunião registrada para "${args.quando_texto}". Agora confirme calorosamente com o cliente.` },
          },
        });
      } else {
        responseParts.push({ functionResponse: { name: call.name, response: { result: "ferramenta desconhecida" } } });
      }
    }
    contents.push({ role: "user", parts: responseParts });
  }

  if (!finalText) { console.log("[sdr] Gemini não retornou texto"); return; }
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

  // 6) Envia pela mesma instância e registra no histórico
  try {
    const { messageId } = await sendText(p.evolutionInstance, p.numero, finalText, delayMs);
    await supabase.from("messages").insert({
      user_id: p.userId,
      conversation_id: p.conversationId,
      instance_id: p.instanceId,
      direction: "outbound",
      body: finalText,
      evolution_message_id: messageId ?? null,
      status: "sent",
    });
    if (mode === "followup") {
      const { data: c } = await supabase
        .from("conversations").select("followup_count").eq("id", p.conversationId).maybeSingle();
      await supabase.from("conversations")
        .update({ followup_count: (c?.followup_count ?? 0) + 1 }).eq("id", p.conversationId);
    }
  } catch (e) {
    console.error("SDR sendText falhou:", e instanceof Error ? e.message : e);
  }
}
