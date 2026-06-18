// =====================================================================
// self-reflect · Self-Reflection Loop (sob demanda)
// ---------------------------------------------------------------------
// Analisa as conversas recentes do usuário (todas, ganho ou não), compara
// desfechos e onde o atendente assumiu, e pede ao Gemini LIÇÕES práticas
// para melhorar o SDR. As lições entram como 'sugerido' — o usuário revisa
// e aprova na aba Aprendizado; as aprovadas vão para o prompt do SDR.
// =====================================================================
import { GoogleGenAI, Type } from "npm:@google/genai@2.8.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";

const MODEL = "gemini-2.5-flash";
const MAX_CONVERSAS = 40;     // conversas analisadas por rodada
const MSGS_POR_CONVERSA = 14; // últimas mensagens de cada conversa

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);
  const userId = auth.user.id;

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY não configurada" }, 500);

  const { dias } = await req.json().catch(() => ({}));
  const janela = Number(dias) > 0 ? Number(dias) : 21;
  const desde = new Date(Date.now() - janela * 86_400_000).toISOString();

  // 1) Conversas recentes + desfecho do lead
  const { data: convs } = await userClient
    .from("conversations")
    .select("id, ai_enabled, last_message_at, leads(status)")
    .gte("last_message_at", desde)
    .order("last_message_at", { ascending: false })
    .limit(60);
  if (!convs?.length) return json({ ok: true, sugeridos: 0, analisadas: 0, motivo: "sem conversas no período" });

  const ids = convs.map((c) => c.id);
  const { data: msgs } = await userClient
    .from("messages")
    .select("conversation_id, direction, body, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true })
    .limit(3000);

  const porConv = new Map<string, { direction: string; body: string }[]>();
  for (const m of msgs ?? []) {
    const body = (m.body ?? "").trim();
    if (!body) continue;
    const arr = porConv.get(m.conversation_id) ?? [];
    arr.push({ direction: m.direction, body });
    porConv.set(m.conversation_id, arr);
  }

  // 2) Monta os blocos de transcript (rotulando desfecho e se o atendente assumiu)
  const blocos: string[] = [];
  for (const c of convs as any[]) {
    if (blocos.length >= MAX_CONVERSAS) break;
    const arr = (porConv.get(c.id) ?? []).slice(-MSGS_POR_CONVERSA);
    if (arr.length < 2) continue; // sem troca real
    const desfecho = c.leads?.status ?? "—";
    const humano = c.ai_enabled === false ? "sim" : "não";
    const linhas = arr.map((m) => `${m.direction === "inbound" ? "Cliente" : "Bot"}: ${m.body}`).join("\n");
    blocos.push(`=== Conversa ${blocos.length + 1} | desfecho: ${desfecho} | atendente assumiu: ${humano} ===\n${linhas}`);
  }
  if (!blocos.length) return json({ ok: true, sugeridos: 0, analisadas: 0, motivo: "sem trocas suficientes para analisar" });

  // 3) Lições já existentes (não repetir)
  const { data: existentes } = await userClient
    .from("sdr_aprendizados").select("texto").in("status", ["aprovado", "sugerido"]).limit(60);
  const jaTem = (existentes ?? []).map((e) => `- ${e.texto}`).join("\n") || "(nenhuma ainda)";

  // 4) Pede as lições ao Gemini (JSON estruturado)
  const ai = new GoogleGenAI({ apiKey });
  const system =
    "Você é um coach de vendas analisando conversas REAIS de um SDR automatizado de WhatsApp que vende um sistema de gestão de bolões para DONOS DE LOTÉRICAS. " +
    "O objetivo do SDR é qualificar e AGENDAR uma reunião de 15 min. " +
    "Compare o que funcionou (reunião agendada / ganho) com o que afastou o cliente (perdido / sem resposta) e observe onde um humano ASSUMIU a conversa (forte sinal de que o bot errou ali). " +
    "Extraia LIÇÕES práticas, curtas e ACIONÁVEIS para melhorar as próximas conversas — regras generalizáveis que caberiam no manual do SDR. " +
    "NÃO cite nomes de pessoas/empresas específicas. NÃO repita nem reformule lições já existentes. No máximo 6 lições novas; se não houver evidência sólida, devolva menos (ou nenhuma).";

  const prompt =
    `LIÇÕES JÁ EXISTENTES (não repita):\n${jaTem}\n\n` +
    `CONVERSAS ANALISADAS (${blocos.length}):\n\n${blocos.join("\n\n")}`;

  let licoes: { texto?: string; categoria?: string; evidencia?: string }[] = [];
  let txt = "";
  try {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: system,
        maxOutputTokens: 2048,
        // 2.5-flash usa "thinking" e consome o orçamento de saída — desligamos
        // para que todo o limite vá para o JSON da resposta (evita texto vazio).
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            licoes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  texto: { type: Type.STRING, description: "A lição/regra acionável, curta (1-2 frases)." },
                  categoria: { type: Type.STRING, description: "uma de: abertura, objecao, agendamento, tom, timing, qualificacao, geral" },
                  evidencia: { type: Type.STRING, description: "Justificativa curta do padrão observado." },
                },
                required: ["texto", "categoria"],
              },
            },
          },
          required: ["licoes"],
        },
      },
    });
    txt = (resp.text ?? "").trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[self-reflect] erro no Gemini:", msg);
    return json({ error: "falha na análise (Gemini): " + msg }, 502);
  }

  if (!txt) {
    console.warn("[self-reflect] Gemini retornou vazio");
    return json({ ok: true, sugeridos: 0, analisadas: blocos.length, motivo: "o modelo não retornou conteúdo; tente novamente" });
  }
  try {
    licoes = JSON.parse(txt)?.licoes ?? [];
  } catch {
    console.error("[self-reflect] JSON inválido do modelo:", txt.slice(0, 300));
    return json({ error: "a resposta do modelo não veio em JSON válido; tente novamente" }, 502);
  }

  licoes = licoes.filter((l) => (l?.texto ?? "").trim()).slice(0, 6);
  if (!licoes.length) return json({ ok: true, sugeridos: 0, analisadas: blocos.length, motivo: "nenhuma lição nova" });

  const rows = licoes.map((l) => ({
    user_id: userId,
    texto: String(l.texto).trim().slice(0, 500),
    categoria: String(l.categoria ?? "geral").trim().toLowerCase().slice(0, 30),
    evidencia: l.evidencia ? String(l.evidencia).trim().slice(0, 500) : null,
    status: "sugerido",
    origem: "reflexao",
  }));
  const { error } = await userClient.from("sdr_aprendizados").insert(rows);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, sugeridos: rows.length, analisadas: blocos.length });
});
