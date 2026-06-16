// =====================================================================
// send-reply · o atendente responde pelo Inbox unificado
// ---------------------------------------------------------------------
// Chamado pelo frontend (supabase.functions.invoke('send-reply', ...)).
// Usa o JWT do usuário para autenticar e RESPEITAR o RLS: o atendente
// só responde conversas da própria conta. A resposta sai pela MESMA
// instância por onde a conversa está roteada.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, corsHeaders } from "../_shared/cors.ts";
import { sendText } from "../_shared/evolution.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  // Cliente "como usuário": valida JWT e aplica RLS.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  const { conversation_id, body } = await req.json().catch(() => ({}));
  if (!conversation_id || !body) return json({ error: "conversation_id e body são obrigatórios" }, 400);

  // RLS garante que esta conversa pertence ao usuário autenticado.
  const { data: conv, error } = await userClient
    .from("conversations")
    .select("id, lead_id, instance_id, leads(telefone), whatsapp_instances(evolution_instance)")
    .eq("id", conversation_id)
    .single();

  if (error || !conv) return json({ error: "conversa não encontrada" }, 404);

  const numero = (conv as any).leads?.telefone;
  const evolutionInstance = (conv as any).whatsapp_instances?.evolution_instance;
  if (!numero || !evolutionInstance) {
    return json({ error: "conversa sem número ou instância associada" }, 422);
  }

  try {
    const { messageId } = await sendText(evolutionInstance, numero, body);

    await userClient.from("messages").insert({
      user_id: auth.user.id,
      conversation_id: conv.id,
      instance_id: conv.instance_id,
      direction: "outbound",
      body,
      evolution_message_id: messageId ?? null,
      status: "sent",
    });

    return json({ ok: true, messageId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
