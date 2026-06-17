// =====================================================================
// scrape-lotericas · acionado pelo Supabase Cron (a cada 5 min)
// ---------------------------------------------------------------------
// 1) Reivindica um lote de bairros 'pendente' (RPC claim_bairros, SKIP LOCKED)
// 2) Extrai lotéricas no Google Maps (Apify) por bairro
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
const LOTE = 5;          // bairros por execução
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

/** Limpa e formata um telefone BR para 55DDDXXXXXYYYY (12–13 dígitos). */
function normalizePhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "").replace(/^0+/, ""); // só dígitos, sem zeros à esquerda
  if (d.length === 10 || d.length === 11) d = "55" + d;       // DDD + número -> acrescenta DDI
  if (!d.startsWith("55") || d.length < 12 || d.length > 13) return null;
  return d;
}

/** Busca lotéricas no Google Maps via Apify (run-sync: roda o Actor e já devolve os itens). */
async function buscarLotericas(bairro: string, cidade: string, estado: string): Promise<Place[]> {
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
          empresa: c.nome, origem: "prospeccao",
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
      await supabase.from("fila_bairros").update({ status: "erro", erro: msg.slice(0, 300) }).eq("id", b.id);
    }
  }

  return json({ ok: true, bairros: bairros.length, novos: novosLeads, enfileirados });
});
