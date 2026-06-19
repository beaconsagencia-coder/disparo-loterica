// =====================================================================
// scrape-lotericas · acionado pelo Supabase Cron (a cada 5 min)
// ---------------------------------------------------------------------
// 1) Reivindica um lote de bairros 'pendente' (RPC claim_bairros, SKIP LOCKED)
// 2) Extrai lotéricas no Google Maps por bairro.
//    Fonte: Google Places API (New) se GOOGLE_MAPS_API_KEY existir;
//            senão, cai no Apify (actor pago). Chave-mestra = troca sem deploy.
// 3) Normaliza telefones (Regex -> 55DDDXXXXXYYYY)
// 4) Valida no WhatsApp (Evolution) e grava como lead (origem 'prospeccao')
// 5) Se o auto-disparo estiver ligado, já enfileira a 1ª mensagem
// 6) Marca os bairros como 'concluido' (ou 'erro')
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";
import { hasWhatsApp } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const CRON_SECRET = Deno.env.get("DISPATCHER_CRON_SECRET")!;
const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN")!;
// Actor de Google Maps (padrão); troque por env se quiser outro Actor.
const APIFY_ACTOR = Deno.env.get("APIFY_ACTOR_ID") ?? "compass~crawler-google-places";
// Google Places API (New): se a chave existir, vira a fonte preferida (mais barata).
const GOOGLE_KEY = (Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "").trim();
const USA_GOOGLE = GOOGLE_KEY.length > 0;
const LOTE = 3;          // bairros por execução (menor = menos risco de timeout; o reclaim do claim_bairros cobre o resto)
const POR_BAIRRO = 20;   // resultados máximos por bairro

// Mensagem padrão caso o usuário não tenha definido um template na aba Prospecção.
const DEFAULT_TEMPLATE =
  "{{Saudacao}}, pessoal da {{Empresa}}! {Estava analisando|Estava observando|Andei vendo} " +
  "o atendimento digital de vocês e {tenho|separei|montei} algumas estratégias {para|pra} " +
  "{aumentar|turbinar|alavancar} as vendas de bolões e jogos pelo WhatsApp. " +
  "{É por esse número que falo com o responsável?|É por aqui que consigo falar com o responsável?|Consigo falar com o responsável por esse número?}";

interface Bairro { id: string; user_id: string; bairro: string; cidade: string; estado: string; }
interface Place { title?: string; name?: string; phone?: string; phoneUnformatted?: string }
interface Prosp { autoDisparo: boolean; template: string }

/**
 * Extrai o "nome principal" do estabelecimento (para usar em {{Empresa}}),
 * tirando prefixos genéricos ("Loteria/Lotérica") e caudas corporativas
 * ("Shopping Service", "LTDA", "ME", "Comércio"…). Mantém a gramática do
 * "pessoal da …": só remove o prefixo se o que sobra não começar com preposição.
 */
function nomePrincipal(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  // 1) corta em separadores comuns (fica com a 1ª parte)
  s = s.split(/\s*[-–—|/•·]\s*/)[0].trim();
  // 2) remove cauda corporativa / razão social
  s = s.replace(
    /\s+(shopping\s+service|com[eé]rcio\b.*|servi[çc]os?\b.*|representa[çc][õo]es?\b.*|neg[oó]cios?\b.*|conveni[êe]ncia\b.*|ltda\.?\b.*|eireli\b.*|epp\b.*|mei\b.*|me\b.*|s\.?\/?a\.?\b.*)$/i,
    "",
  ).trim();
  // 3) remove prefixo genérico de lotérica, se sobrar um nome próprio
  const semPrefixo = s.replace(/^(casa\s+)?(lot[eé]ricas?|loterias?)\s+(e\s+)?/i, "").trim();
  if (semPrefixo && !/^(d[aeo]s?|e|em|no|na)\b/i.test(semPrefixo)) s = semPrefixo;
  // 4) limpa pontuação nas pontas e limita a 3 palavras se ainda estiver longo
  s = s.replace(/^[\s,.;:]+|[\s,.;:]+$/g, "").trim();
  const w = s.split(/\s+/);
  if (w.length > 4) s = w.slice(0, 3).join(" ");
  return s || (raw ?? "").trim();
}

/**
 * Erro "de conta" (cota/créditos/billing/permissão) — vale para Apify e Google.
 * Esses problemas afetam TODOS os bairros, não um específico: não adianta marcar
 * 'erro' (queimaria a fila). A gente devolve o bairro pra 'pendente' e pausa,
 * guardando o motivo para a UI avisar. A fila retoma sozinha quando resolver.
 */
function isPauseError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    // Apify (actor pago sem créditos / limite mensal)
    m.includes("not-enough-usage") ||
    m.includes("monthly-usage-hard-limit") ||
    m.includes("usage hard limit") ||
    m.includes("payment required") ||
    /\bapify 402\b/.test(m) ||
    // Google Places API (New)
    m.includes("resource_exhausted") ||      // cota esgotada (429)
    m.includes("billing") ||                 // BILLING_DISABLED / faturamento não ativado
    m.includes("api_key_service_blocked") || // chave não liberada p/ a Places API
    m.includes("service_disabled") ||        // API não ativada no projeto
    m.includes("permission_denied") ||
    /\bgoogle 4(0[13]|29)\b/.test(m)         // 401/403/429 do Google
  );
}

/** Motivo amigável (mostrado na fila) a partir da mensagem técnica de erro. */
function pauseMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("billing"))
    return "Google: billing não ativado. Ative o faturamento no Google Cloud para a Places API (New) funcionar.";
  if (m.includes("api_key_service_blocked") || m.includes("service_disabled") ||
      m.includes("permission_denied") || /\bgoogle 40[13]\b/.test(m))
    return "Google: a chave não tem permissão para a Places API (New). Ative a API e libere a chave para ela.";
  if (m.includes("resource_exhausted") || /\bgoogle 429\b/.test(m))
    return "Google: cota da Places API esgotada no período. A fila volta sozinha quando renovar.";
  return "Apify sem créditos (402). Adicione créditos no Apify para retomar — a fila volta sozinha.";
}

/** Limpa e formata um telefone BR para 55DDDXXXXXYYYY (12–13 dígitos). */
function normalizePhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "").replace(/^0+/, ""); // só dígitos, sem zeros à esquerda
  if (d.length === 10 || d.length === 11) d = "55" + d;       // DDD + número -> acrescenta DDI
  if (!d.startsWith("55") || d.length < 12 || d.length > 13) return null;
  return d;
}

/** Fonte de leads: Google Places (New) se houver chave; senão Apify. */
async function buscarLotericas(bairro: string, cidade: string, estado: string): Promise<Place[]> {
  return USA_GOOGLE
    ? await buscarGoogle(bairro, cidade, estado)
    : await buscarApify(bairro, cidade, estado);
}

/**
 * Google Places API (New) · Text Search.
 * 1 chamada por bairro, até POR_BAIRRO resultados. O telefone vem no field mask
 * (nationalPhoneNumber/internationalPhoneNumber) — sem precisar de Place Details.
 */
async function buscarGoogle(bairro: string, cidade: string, estado: string): Promise<Place[]> {
  const textQuery = `Lotérica, ${bairro}, ${cidade} - ${estado}`;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      // Só os campos que usamos -> mantém a chamada no SKU mais barato possível.
      "X-Goog-FieldMask": "places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber",
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      maxResultCount: POR_BAIRRO, // Text Search (New) aceita 1..20
    }),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const places = Array.isArray(data?.places) ? data.places : [];
  // Normaliza para o shape Place (title + phone) usado adiante.
  return places.map((p: Record<string, unknown>) => ({
    title: (p.displayName as { text?: string })?.text ?? "",
    phone: (p.internationalPhoneNumber as string) ?? (p.nationalPhoneNumber as string) ?? "",
  })) as Place[];
}

/** Apify · busca lotéricas no Google Maps (run-sync: roda o Actor e já devolve os itens). */
async function buscarApify(bairro: string, cidade: string, estado: string): Promise<Place[]> {
  const query = `Lotérica, ${bairro}, ${cidade} - ${estado}`;
  // run-sync-get-dataset-items: executa o Actor e retorna o dataset direto (sem polling).
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: POR_BAIRRO,
      language: "pt-BR",   // o Actor exige um código da lista (pt-BR), não "pt"
      countryCode: "br",
      skipClosedPlaces: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const items = await res.json(); // array de places (itens do dataset)
  return Array.isArray(items) ? items as Place[] : [];
}

/** Resolve a instância Evolution conectada de um usuário (cacheada). */
const instCache = new Map<string, string | null>();
async function instanciaDe(userId: string): Promise<string | null> {
  if (instCache.has(userId)) return instCache.get(userId)!;
  const { data } = await supabase
    .from("whatsapp_instances").select("evolution_instance")
    .eq("user_id", userId).eq("status", "conectado").limit(1).maybeSingle();
  const inst = data?.evolution_instance ?? null;
  instCache.set(userId, inst);
  return inst;
}

/** Config de prospecção do usuário (auto-disparo + template), cacheada. */
const prospCache = new Map<string, Prosp>();
async function prospConfig(userId: string): Promise<Prosp> {
  if (prospCache.has(userId)) return prospCache.get(userId)!;
  const { data } = await supabase
    .from("prospeccao_config").select("auto_disparo, spintax_template").eq("user_id", userId).maybeSingle();
  const cfg: Prosp = {
    autoDisparo: data?.auto_disparo ?? true,
    template: (data?.spintax_template?.trim()) || DEFAULT_TEMPLATE,
  };
  prospCache.set(userId, cfg);
  return cfg;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);

  // 1) Reivindica o lote
  const { data: bairros, error: claimErr } = await supabase.rpc("claim_bairros", { p_lote: LOTE });
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!bairros?.length) return json({ ok: true, processados: 0 });

  let novosLeads = 0, enfileirados = 0;
  let semCredito = false;
  let motivoPausa = "";
  const userIds = [...new Set((bairros as Bairro[]).map((b) => b.user_id))];
  for (const b of bairros as Bairro[]) {
    try {
      const instance = await instanciaDe(b.user_id);
      const cfg = await prospConfig(b.user_id);
      const places = await buscarLotericas(b.bairro, b.cidade, b.estado);

      // 3) Normaliza + dedupe dentro do lote
      const vistos = new Set<string>();
      const candidatos: { nome: string; telefone: string }[] = [];
      for (const p of places) {
        const tel = normalizePhone(p.phoneUnformatted ?? p.phone ?? "");
        if (!tel || vistos.has(tel)) continue;
        vistos.add(tel);
        candidatos.push({ nome: (p.title ?? p.name ?? "").trim() || "Lotérica", telefone: tel });
      }

      // 4) Valida no WhatsApp e monta os leads (descarta quem não tem WhatsApp)
      const leadRows: Record<string, unknown>[] = [];
      for (const c of candidatos) {
        const ok = instance ? await hasWhatsApp(instance, c.telefone) : null;
        if (ok === false) continue; // sem WhatsApp -> descarta (null = não deu p/ validar, mantém)
        leadRows.push({
          user_id: b.user_id, nome: c.nome, telefone: c.telefone,
          empresa: nomePrincipal(c.nome), origem: "prospeccao", // {{Empresa}} = só o nome principal
          status: cfg.autoDisparo ? "na_fila" : "novo",
          notas: `Lotérica · ${b.bairro}, ${b.cidade}-${b.estado}`,
        });
      }

      // Grava leads (ignora duplicados por user_id+telefone). Só retorna os NOVOS.
      if (leadRows.length) {
        const { data: novos, error } = await supabase
          .from("leads").upsert(leadRows, { onConflict: "user_id,telefone", ignoreDuplicates: true }).select("id");
        if (error) throw new Error(error.message);
        novosLeads += novos?.length ?? 0;

        // 5) Auto-disparo: enfileira a 1ª mensagem só para os leads novos
        if (cfg.autoDisparo && novos?.length) {
          const queue = novos.map((l) => ({
            user_id: b.user_id, lead_id: l.id, spintax_template: cfg.template, status: "pendente" as const,
          }));
          const { error: qErr } = await supabase.from("message_queue").insert(queue);
          if (qErr) throw new Error(qErr.message);
          enfileirados += queue.length;
        }
      }

      // 6) Conclui o bairro
      await supabase.from("fila_bairros").update({ status: "concluido", erro: null }).eq("id", b.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[scrape] bairro ${b.id} falhou:`, msg);
      if (isPauseError(msg)) {
        // Problema de conta (cota/créditos/billing/permissão): não marca 'erro'
        // (senão a fila inteira "queima"). Volta pra 'pendente' guardando o motivo.
        motivoPausa = pauseMessage(msg);
        await supabase.from("fila_bairros").update({ status: "pendente", erro: motivoPausa }).eq("id", b.id);
        semCredito = true;
        break;
      }
      await supabase.from("fila_bairros").update({ status: "erro", erro: msg.slice(0, 300) }).eq("id", b.id);
    }
  }

  if (semCredito) {
    // Devolve os demais bairros reivindicados (ainda 'processando') para a fila.
    const ids = (bairros as Bairro[]).map((b) => b.id);
    await supabase.from("fila_bairros")
      .update({ status: "pendente", erro: motivoPausa }).in("id", ids).eq("status", "processando");
    console.warn(`[scrape] extração pausada (${USA_GOOGLE ? "google" : "apify"}):`, motivoPausa);
    return json({ ok: false, motivo: motivoPausa, novos: novosLeads, enfileirados });
  }

  // Ciclo rodou sem pausa: limpa avisos antigos (ex.: "Apify sem créditos")
  // que ficaram gravados nos bairros ainda 'pendente' desses usuários, para
  // o banner não mentir depois de trocar de fonte / repor créditos.
  await supabase.from("fila_bairros")
    .update({ erro: null }).in("user_id", userIds).eq("status", "pendente").not("erro", "is", null);

  return json({ ok: true, bairros: bairros.length, novos: novosLeads, enfileirados });
});
