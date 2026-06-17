// =====================================================================
// SDR com IA (Claude) — conduz a conversa seguindo o playbook do usuário,
// qualifica o lead e agenda a reunião (tool use). Roda em background.
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk@0.104.2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendText } from "./evolution.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

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
const tools: Anthropic.Tool[] = [
  {
    name: "agendar_reuniao",
    description:
      "Registra a reunião quando o cliente CONFIRMA um horário específico. " +
      "Só chame após o cliente concordar com um dia/horário. Depois de chamar, " +
      "responda confirmando o agendamento de forma calorosa.",
    input_schema: {
      type: "object",
      properties: {
        quando_texto: {
          type: "string",
          description: "O horário combinado em linguagem natural (ex: 'amanhã às 18h', 'segunda às 10h').",
        },
        data_iso: {
          type: "string",
          description: "Data e hora em ISO 8601 (ex: 2026-06-17T18:00:00-03:00), se conseguir inferir. Opcional.",
        },
        observacao: { type: "string", description: "Detalhe relevante combinado. Opcional." },
      },
      required: ["quando_texto"],
    },
  },
];

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
    "- Quando o cliente confirmar um horário, chame a ferramenta agendar_reuniao e então confirme com ele.",
    "- Nunca invente informações nem prometa o que o roteiro não diz. Se o cliente sair muito do escopo ou pedir para falar com humano, responda educadamente que vai chamar alguém do time.",
  ].filter(Boolean).join("\n");
}

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

  // Monta o array de mensagens (inbound=user, outbound=assistant).
  // A API exige começar com 'user' — descartamos mensagens 'assistant' iniciais.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of hist ?? []) {
    const role = m.direction === "inbound" ? "user" : "assistant";
    const text = (m.body ?? "").trim();
    if (!text) continue;
    if (messages.length === 0 && role === "assistant") continue; // pula abertura
    messages.push({ role, content: text });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") return;

  const system = buildSystem(
    config.playbook, config.persona_nome, config.empresa,
    lead?.nome ?? "", lead?.empresa ?? null,
  );

  // 3) Loop de tool use (manual) até a IA terminar o turno
  let finalText = "";
  for (let i = 0; i < 4; i++) {
    const resp = await anthropic.messages.create({
      model: config.model || "claude-opus-4-8",
      max_tokens: 1024,
      system,
      tools,
      messages,
    });

    const turnText = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join(" ").trim();
    if (turnText) finalText = turnText;

    if (resp.stop_reason !== "tool_use") break;

    // Executa as ferramentas chamadas
    messages.push({ role: "assistant", content: resp.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "agendar_reuniao") {
        const input = block.input as { quando_texto: string; data_iso?: string; observacao?: string };
        await supabase.from("meetings").insert({
          user_id: p.userId,
          lead_id: p.leadId,
          conversation_id: p.conversationId,
          quando_texto: input.quando_texto,
          scheduled_for: input.data_iso ?? null,
          observacao: input.observacao ?? null,
          titulo: `Reunião com ${lead?.nome ?? p.numero}`,
        });
        await supabase.from("leads").update({ status: "reuniao_agendada" }).eq("id", p.leadId);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Reunião registrada para "${input.quando_texto}". Agora confirme calorosamente com o cliente.`,
        });
      } else {
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "ok", is_error: true });
      }
    }
    messages.push({ role: "user", content: toolResults });
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
