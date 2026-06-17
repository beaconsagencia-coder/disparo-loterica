// =====================================================================
// SDR com IA (Google Gemini) — conduz a conversa seguindo o playbook do
// usuário, qualifica o lead e agenda a reunião (function calling).
// Roda em background a partir do webhook.
// =====================================================================
import { GoogleGenAI, Type } from "npm:@google/genai@2.8.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendText } from "./evolution.ts";

const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY")! });
const DEFAULT_MODEL = "gemini-2.5-flash";

interface RunSdrParams {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  leadId: string;
  instanceId: string;
  evolutionInstance: string;
  numero: string;
  triggerAt: string; // created_at da mensagem recebida que disparou o SDR
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
    "## Regras de operação",
    "- Responda SEMPRE em uma única mensagem curta de WhatsApp, em português, tom humano e natural (como nos exemplos do roteiro). Sem listas, sem markdown.",
    "- Siga o fluxo do roteiro: cumprimentar → confirmar que fala com o responsável → pegar o nome → gerar interesse → propor uma reunião de 15 minutos → combinar o melhor horário.",
    "- Faça UMA pergunta por vez. Não despeje tudo de uma vez.",
    "- Quando o cliente confirmar um horário, chame a função agendar_reuniao e então confirme com ele.",
    "- Nunca invente informações nem prometa o que o roteiro não diz. Se o cliente sair muito do escopo ou pedir para falar com humano, responda educadamente que vai chamar alguém do time.",
  ].filter(Boolean).join("\n");
}

// deno-lint-ignore no-explicit-any
type Content = { role: "user" | "model"; parts: any[] };

export async function runSdr(p: RunSdrParams): Promise<void> {
  const { supabase } = p;

  // 1) Config do SDR + checagens de ativação
  const { data: config } = await supabase
    .from("ai_config").select("*").eq("user_id", p.userId).maybeSingle();
  if (!config || !config.ativo) return;

  const { data: conv } = await supabase
    .from("conversations").select("ai_enabled").eq("id", p.conversationId).maybeSingle();
  if (!conv || conv.ai_enabled === false) return;

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
  if (contents.length === 0 || contents[contents.length - 1].role !== "user") return;

  const systemInstruction = buildSystem(
    config.playbook, config.persona_nome, config.empresa,
    lead?.nome ?? "", lead?.empresa ?? null,
  );

  // Garante um modelo Gemini válido (rows antigas podem ter modelo de outro provedor)
  const model = typeof config.model === "string" && config.model.startsWith("gemini")
    ? config.model : DEFAULT_MODEL;

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

  if (!finalText) return;

  // 4) Anti-duplicação: se chegou mensagem mais nova que a que disparou, aborta.
  const { count } = await supabase
    .from("messages").select("id", { count: "exact", head: true })
    .eq("conversation_id", p.conversationId)
    .gt("created_at", p.triggerAt);
  if ((count ?? 0) > 0) return;

  // 5) Envia pela mesma instância e registra no histórico
  try {
    const { messageId } = await sendText(p.evolutionInstance, p.numero, finalText);
    await supabase.from("messages").insert({
      user_id: p.userId,
      conversation_id: p.conversationId,
      instance_id: p.instanceId,
      direction: "outbound",
      body: finalText,
      evolution_message_id: messageId ?? null,
      status: "sent",
    });
  } catch (e) {
    console.error("SDR sendText falhou:", e instanceof Error ? e.message : e);
  }
}
