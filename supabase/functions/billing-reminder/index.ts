// =====================================================================
// billing-reminder · acionado pelo Supabase Cron (de hora em hora)
// ---------------------------------------------------------------------
// Lembrete automático de vencimento + PIX. Para cada usuário com a cobrança
// ATIVA, na HORA configurada (Brasília), percorre os contratos ativos e, no
// dia do lembrete (vencimento − dias_antes), envia a mensagem com nome,
// valor, vencimento e a chave PIX. Registra a parcela (invoices) para nunca
// cobrar o mesmo mês duas vezes (unique contract_id+competencia).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { sendText } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const CRON_SECRET = Deno.env.get("DISPATCHER_CRON_SECRET")!;

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Data/hora "agora" no fuso de São Paulo (partes numéricas). */
function spNow() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return { y: g("year"), mo0: g("month") - 1, da: g("day"), hour: g("hour") };
}

/** Normaliza telefone BR para dígitos com DDI 55, ou null se inválido (ex.: e-mail). */
function normalizePhone(raw: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return null;
}

/** Monta a mensagem a partir do template (ou de um padrão), trocando os placeholders. */
function montarMensagem(
  template: string | null,
  vars: { nome: string; valor: string; vencimento: string; pix: string; favorecido: string; copia_cola: string },
): string {
  const blocoCopiaCola = vars.copia_cola
    ? `\n📋 PIX Copia e Cola:\n${vars.copia_cola}`
    : "";
  const padrao =
    `Olá${vars.nome ? ` ${vars.nome}` : ""}! 👋\n\n` +
    `Passando para lembrar do vencimento da sua mensalidade:\n\n` +
    `💰 Valor: ${vars.valor}\n` +
    `📅 Vencimento: ${vars.vencimento}\n\n` +
    `Para pagar via PIX:\n` +
    `🔑 Chave: ${vars.pix}${vars.favorecido ? ` (${vars.favorecido})` : ""}` +
    `${blocoCopiaCola}\n\n` +
    `Assim que pagar, pode me enviar o comprovante. Obrigado! 🙏`;
  if (!template || !template.trim()) return padrao;
  return template
    .replaceAll("{nome}", vars.nome)
    .replaceAll("{valor}", vars.valor)
    .replaceAll("{vencimento}", vars.vencimento)
    .replaceAll("{pix}", vars.pix)
    .replaceAll("{favorecido}", vars.favorecido)
    .replaceAll("{copia_cola}", vars.copia_cola);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const now = spNow();
  const todayStr = `${now.y}-${pad(now.mo0 + 1)}-${pad(now.da)}`;
  const currentIdx = now.y * 12 + now.mo0;

  const { data: settings } = await supabase
    .from("billing_settings")
    .select("user_id, ativo, pix_key, pix_nome, pix_copia_cola, hora_envio, dias_antes, template")
    .eq("ativo", true);
  if (!settings?.length) return json({ ok: true, sent: 0, reason: "nenhuma cobrança ativa" });

  let sent = 0;
  for (const s of settings) {
    // Só dispara na hora configurada (Brasília) e se houver chave PIX.
    if (now.hour !== Number(s.hora_envio ?? 8)) continue;
    const pix = (s.pix_key ?? "").trim();
    const copiaCola = (s.pix_copia_cola ?? "").trim();
    if (!pix && !copiaCola) { console.log("[billing] sem chave PIX, pulando user", s.user_id); continue; }

    // Chip conectado para enviar (cobrança usa o mesmo canal do WhatsApp).
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("evolution_instance")
      .eq("user_id", s.user_id).eq("status", "conectado")
      .limit(1).maybeSingle();
    if (!inst?.evolution_instance) { console.log("[billing] sem chip conectado, user", s.user_id); continue; }
    const evolution = inst.evolution_instance as string;

    const diasAntes = Number(s.dias_antes ?? 0);

    const { data: contracts } = await supabase
      .from("contracts")
      .select("id, client_name, contract_value, duration_months, due_date_day, start_date, payer_contact")
      .eq("user_id", s.user_id).eq("status", "active");

    for (const c of contracts ?? []) {
      const [sy, sm] = String(c.start_date).split("-").map(Number);
      const startIdx = sy * 12 + (sm - 1);
      const fimIdx = startIdx + Number(c.duration_months) - 1;
      const dueDay = Number(c.due_date_day);
      const valorNum = Number(c.contract_value) || 0;

      // Considera o mês corrente e o seguinte (cobre dias_antes que cruza o mês).
      for (const offset of [0, 1]) {
        const idx = currentIdx + offset;
        if (idx < startIdx || idx > fimIdx) continue; // contrato não vigente nesse mês
        const cy = Math.floor(idx / 12), cm0 = idx % 12;
        const clampDay = Math.min(dueDay, daysInMonth(cy, cm0));
        // Dia do lembrete = vencimento − dias_antes (calendário, em UTC p/ não deslocar).
        const dueUTC = Date.UTC(cy, cm0, clampDay);
        const remind = new Date(dueUTC - diasAntes * 86_400_000);
        const remindStr = `${remind.getUTCFullYear()}-${pad(remind.getUTCMonth() + 1)}-${pad(remind.getUTCDate())}`;
        if (remindStr !== todayStr) continue; // não é o dia de lembrar esta parcela

        const competencia = `${cy}-${pad(cm0 + 1)}-01`;
        const dueStr = `${cy}-${pad(cm0 + 1)}-${pad(clampDay)}`;

        // Idempotência: se já existe parcela com lembrete enviado, não reenvia.
        const { data: existing } = await supabase
          .from("invoices").select("id, reminder_sent_at")
          .eq("contract_id", c.id).eq("competencia", competencia).maybeSingle();
        if (existing?.reminder_sent_at) continue;

        // Garante a parcela (cria se não existir) — preserva status/baixa manual.
        let invoiceId = existing?.id ?? null;
        if (!invoiceId) {
          const { data: novo } = await supabase.from("invoices").insert({
            user_id: s.user_id, contract_id: c.id, competencia, due_date: dueStr, valor: valorNum,
          }).select("id").single();
          invoiceId = novo?.id ?? null;
        }
        if (!invoiceId) continue;

        const phone = normalizePhone(c.payer_contact);
        if (!phone) { console.log("[billing] contato sem telefone válido:", c.client_name); continue; }

        const nome = c.client_name && !/^\d+$/.test(c.client_name) ? String(c.client_name).split(/\s+/)[0] : "";
        const vencBR = `${pad(clampDay)}/${pad(cm0 + 1)}/${cy}`;
        const texto = montarMensagem(s.template, {
          nome, valor: brl(valorNum), vencimento: vencBR,
          pix: pix || copiaCola, favorecido: (s.pix_nome ?? "").trim(), copia_cola: copiaCola,
        });

        try {
          await sendText(evolution, phone, texto);
          await supabase.from("invoices").update({ reminder_sent_at: new Date().toISOString() }).eq("id", invoiceId);
          sent++;
        } catch (e) {
          console.error("[billing] envio falhou:", e instanceof Error ? e.message : e);
        }
      }
    }
  }

  return json({ ok: true, sent });
});
