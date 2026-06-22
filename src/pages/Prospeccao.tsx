import { useEffect, useMemo, useState } from "react";
import { Radar, Save, Plus, Trash2, MapPin, Loader2, CheckCircle2, AlertCircle, Send, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CATALOGO_BRASIL } from "@/lib/bairrosBrasil";
import { DEFAULT_TEMPLATE } from "@/lib/templates";

interface Fila { id: string; bairro: string; cidade: string; estado: string; status: string; erro: string | null; }
interface Lead { id: string; nome: string; telefone: string; status: string; notas: string | null; created_at: string; }

const STATUS_FILA: Record<string, string> = {
  pendente: "bg-warning/15 text-[#9a6400]", processando: "bg-accent/15 text-accent",
  concluido: "bg-success/15 text-[#1b7a35]", erro: "bg-danger/15 text-[#b4231b]",
};

export default function Prospeccao() {
  const [autoDisparo, setAutoDisparo] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);

  const [fila, setFila] = useState<Fila[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // catálogo
  const [estadoSel, setEstadoSel] = useState("");
  const [cidadeSel, setCidadeSel] = useState("");
  // adição livre
  const [freeCidade, setFreeCidade] = useState("");
  const [freeEstado, setFreeEstado] = useState("");
  const [freeBairros, setFreeBairros] = useState("");
  const [adding, setAdding] = useState(false);

  async function userId() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  async function loadAll() {
    const { data: cfg } = await supabase.from("prospeccao_config").select("*").maybeSingle();
    if (cfg) {
      setAutoDisparo(cfg.auto_disparo ?? true);
      if (cfg.spintax_template?.trim()) setTemplate(cfg.spintax_template);
    }
    const { data: f } = await supabase.from("fila_bairros")
      .select("id, bairro, cidade, estado, status, erro").order("created_at", { ascending: false }).limit(500);
    setFila((f as Fila[]) ?? []);
    const { data: l } = await supabase.from("leads")
      .select("id, nome, telefone, status, notas, created_at")
      .eq("origem", "prospeccao").order("created_at", { ascending: false }).limit(500);
    setLeads((l as Lead[]) ?? []);
  }
  useEffect(() => { loadAll(); }, []);

  async function saveCfg() {
    setSavingCfg(true); setCfgMsg(null);
    const uid = await userId();
    if (!uid) { setSavingCfg(false); return setCfgMsg("Sessão expirada."); }
    const { error } = await supabase.from("prospeccao_config").upsert(
      { user_id: uid, auto_disparo: autoDisparo, spintax_template: template.trim() },
      { onConflict: "user_id" },
    );
    setSavingCfg(false);
    setCfgMsg(error ? "Erro: " + error.message : "Salvo ✅");
  }

  // ---- adicionar regiões à fila ----
  const estados = useMemo(() => [...new Set(CATALOGO_BRASIL.map((c) => c.estado))].sort(), []);
  const cidades = useMemo(
    () => CATALOGO_BRASIL.filter((c) => c.estado === estadoSel).map((c) => c.cidade),
    [estadoSel],
  );
  const cidadeCat = useMemo(
    () => CATALOGO_BRASIL.find((c) => c.estado === estadoSel && c.cidade === cidadeSel),
    [estadoSel, cidadeSel],
  );

  // ---- trava de segurança: status do que já está na fila/concluído ----
  const norm = (s: string) => s.trim().toLowerCase();
  const statusPorLocal = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fila) m.set(`${norm(f.estado)}|${norm(f.cidade)}|${norm(f.bairro)}`, f.status);
    return m;
  }, [fila]);
  const localStatus = (estado: string, cidade: string, bairro: string) =>
    statusPorLocal.get(`${norm(estado)}|${norm(cidade)}|${norm(bairro)}`) ?? null;

  // Cidades do catálogo 100% concluídas (todos os bairros 'concluido').
  const cidadesConcluidas = useMemo(() => {
    const done = new Set<string>();
    for (const c of CATALOGO_BRASIL) {
      if (c.bairros.length && c.bairros.every((b) => statusPorLocal.get(`${norm(c.estado)}|${norm(c.cidade)}|${norm(b)}`) === "concluido")) {
        done.add(`${norm(c.estado)}|${norm(c.cidade)}`);
      }
    }
    return done;
  }, [statusPorLocal]);

  // Resumo de progresso da cidade selecionada (para o cabeçalho dos bairros).
  const resumoCidade = useMemo(() => {
    if (!cidadeCat) return null;
    let concluidos = 0, naFila = 0;
    for (const b of cidadeCat.bairros) {
      const s = localStatus(cidadeCat.estado, cidadeCat.cidade, b);
      if (s === "concluido") concluidos++;
      else if (s === "pendente" || s === "processando" || s === "erro") naFila++;
    }
    return { total: cidadeCat.bairros.length, concluidos, naFila };
  }, [cidadeCat, statusPorLocal]);

  async function enfileirar(rows: { bairro: string; cidade: string; estado: string }[]) {
    setMsg(null);
    const uid = await userId();
    if (!uid || !rows.length) return;
    setAdding(true);
    const payload = rows.map((r) => ({ user_id: uid, bairro: r.bairro, cidade: r.cidade, estado: r.estado, status: "pendente" }));
    // ignoreDuplicates + .select() => retorna só as linhas REALMENTE inseridas.
    // Assim não reprocessamos o que já está na fila ou concluído (trava de segurança).
    const { data, error } = await supabase.from("fila_bairros")
      .upsert(payload, { onConflict: "user_id,bairro,cidade,estado", ignoreDuplicates: true })
      .select("id");
    setAdding(false);
    if (error) return setMsg("Erro: " + error.message);
    const novas = data?.length ?? 0;
    const ignoradas = rows.length - novas;
    setMsg(
      `${novas} adicionada(s) à fila` +
      (ignoradas ? ` · ${ignoradas} já estava(m) na fila ou concluída(s) e foi(ram) ignorada(s)` : "") + " ✅",
    );
    loadAll();
  }

  function addCidadeInteira() {
    if (!cidadeCat) return;
    enfileirar(cidadeCat.bairros.map((b) => ({ bairro: b, cidade: cidadeCat.cidade, estado: cidadeCat.estado })));
  }
  function addEstadoInteiro() {
    if (!estadoSel) return;
    const rows = CATALOGO_BRASIL
      .filter((c) => c.estado === estadoSel)
      .flatMap((c) => c.bairros.map((b) => ({ bairro: b, cidade: c.cidade, estado: c.estado })));
    enfileirar(rows);
  }
  function addFree() {
    const cidade = freeCidade.trim(), estado = freeEstado.trim().toUpperCase();
    if (!cidade || estado.length !== 2) return setMsg("Informe a cidade e a UF (2 letras).");
    const linhas = freeBairros.split("\n").map((s) => s.trim()).filter(Boolean);
    const lista = linhas.length ? linhas : [""]; // sem bairros = varre a cidade inteira
    enfileirar(lista.map((b) => ({ bairro: b || cidade, cidade, estado })));
    setFreeBairros("");
  }

  async function removerFila(id: string) {
    await supabase.from("fila_bairros").delete().eq("id", id);
    loadAll();
  }
  async function reprocessar(id: string) {
    await supabase.from("fila_bairros").update({ status: "pendente", erro: null }).eq("id", id);
    loadAll();
  }

  const contagem = useMemo(() => {
    const c = { pendente: 0, processando: 0, concluido: 0, erro: 0 } as Record<string, number>;
    for (const f of fila) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [fila]);

  // Detecta a fila pausada por problema de conta (Apify sem créditos, ou Google
  // sem billing/permissão/cota). O motivo real fica guardado no campo `erro`.
  const motivoPausa = useMemo(
    () => fila.find((f) => f.erro && /apify|google|402|429|cr[eé]dito|cota|billing|permiss/i.test(f.erro))?.erro ?? null,
    [fila],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center gap-2">
        <Radar size={22} className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospecção</h1>
          <p className="text-sm text-ink-muted">Escolha cidades/bairros — o sistema busca lotéricas no Google Maps, valida no WhatsApp e já joga na fila de disparo.</p>
        </div>
      </header>

      {/* Disparo automático */}
      <div className="bento-card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Disparo automático</h2>
            <p className="text-sm text-ink-muted">Quando ligado, todo lead encontrado e validado já entra na fila de disparo com a mensagem abaixo.</p>
          </div>
          <button onClick={() => setAutoDisparo((v) => !v)}
            className={`relative h-7 w-12 rounded-full transition-colors ${autoDisparo ? "bg-accent" : "bg-black/15"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${autoDisparo ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <label className="mb-1 mt-3 block text-xs font-medium text-ink-soft">Mensagem (Spintax · use {"{a|b}"}, {"{{Nome}}"}, {"{{Saudacao}}"})</label>
        <textarea className="input min-h-[110px] font-mono text-xs leading-relaxed" value={template} onChange={(e) => setTemplate(e.target.value)} />
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-accent" onClick={saveCfg} disabled={savingCfg}>
            <Save size={16} /> {savingCfg ? "Salvando…" : "Salvar"}
          </button>
          {cfgMsg && <span className="text-sm text-ink-muted">{cfgMsg}</span>}
        </div>
      </div>

      {/* Adicionar regiões */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bento-card">
          <h2 className="mb-3 font-medium">Catálogo do Brasil</h2>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={estadoSel} onChange={(e) => { setEstadoSel(e.target.value); setCidadeSel(""); }}>
              <option value="">Estado…</option>
              {estados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            <select className="input" value={cidadeSel} onChange={(e) => setCidadeSel(e.target.value)} disabled={!estadoSel}>
              <option value="">Cidade…</option>
              {cidades.map((c) => (
                <option key={c} value={c}>
                  {cidadesConcluidas.has(`${norm(estadoSel)}|${norm(c)}`) ? "✓ " : ""}{c}
                </option>
              ))}
            </select>
          </div>

          {estadoSel && (
            <button
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/30 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-60"
              onClick={addEstadoInteiro}
              disabled={adding}
              title={`Enfileira os bairros de todas as cidades de ${estadoSel} do catálogo`}
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Adicionar todas as cidades de {estadoSel} ({cidades.length})
            </button>
          )}

          {cidadeCat && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm text-ink-muted">
                  {cidadeCat.bairros.length} bairros
                  {resumoCidade && resumoCidade.concluidos > 0 && (
                    <span className="ml-1.5 font-medium text-[#1b7a35]">· {resumoCidade.concluidos} concluído{resumoCidade.concluidos > 1 ? "s" : ""}</span>
                  )}
                  {resumoCidade && resumoCidade.concluidos === resumoCidade.total && (
                    <span className="ml-1.5">✓ cidade 100% processada</span>
                  )}
                </span>
                <button className="btn-accent !py-1.5" onClick={addCidadeInteira} disabled={adding}>
                  {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar todos
                </button>
              </div>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {cidadeCat.bairros.map((b) => {
                  const s = localStatus(cidadeCat.estado, cidadeCat.cidade, b);
                  if (s === "concluido") {
                    return (
                      <span key={b} className="chip bg-success/15 text-[#1b7a35]" title="Já processado — não será refeito">
                        <CheckCircle2 size={11} /> {b}
                      </span>
                    );
                  }
                  const naFila = s === "pendente" || s === "processando";
                  return (
                    <button key={b}
                      onClick={() => enfileirar([{ bairro: b, cidade: cidadeCat.cidade, estado: cidadeCat.estado }])}
                      title={naFila ? "Já está na fila" : s === "erro" ? "Falhou — clique para reenfileirar" : "Adicionar à fila"}
                      className={`chip ${
                        naFila ? "bg-accent/15 text-accent"
                          : s === "erro" ? "bg-danger/15 text-[#b4231b]"
                          : "bg-black/[0.06] text-ink-soft hover:bg-accent hover:text-white"
                      }`}>
                      <MapPin size={11} /> {b}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bento-card">
          <h2 className="mb-1 font-medium">Adicionar manualmente</h2>
          <p className="mb-3 text-sm text-ink-muted">Qualquer cidade. Cole bairros (1 por linha) ou deixe vazio para varrer a cidade toda.</p>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <input className="input col-span-2" placeholder="Cidade" value={freeCidade} onChange={(e) => setFreeCidade(e.target.value)} />
            <input className="input" placeholder="UF" maxLength={2} value={freeEstado} onChange={(e) => setFreeEstado(e.target.value)} />
          </div>
          <textarea className="input min-h-[90px] text-sm" placeholder={"Centro\nCohama\nTuru"} value={freeBairros} onChange={(e) => setFreeBairros(e.target.value)} />
          <button className="btn-accent mt-3" onClick={addFree} disabled={adding}><Plus size={16} /> Adicionar à fila</button>
        </div>
      </div>

      {msg && <p className="mt-3 flex items-center gap-1 text-sm text-ink-soft"><CheckCircle2 size={14} className="text-success" /> {msg}</p>}

      {/* Aviso: fila pausada por problema de conta (mostra o motivo real do backend) */}
      {motivoPausa && (
        <div className="bento-card mt-4 flex items-start gap-2 border-danger/30 !bg-danger/5 text-sm text-[#b4231b]">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <strong>Extração pausada.</strong> {motivoPausa} A fila <strong>retoma sozinha</strong> assim que resolver —
            nada é perdido: os bairros seguem como “pendente”.
          </div>
        </div>
      )}

      {/* Fila de regiões */}
      <div className="bento-card mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Fila de regiões</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className={`chip ${STATUS_FILA.pendente}`}>{contagem.pendente} pendente</span>
            <span className={`chip ${STATUS_FILA.processando}`}>{contagem.processando} processando</span>
            <span className={`chip ${STATUS_FILA.concluido}`}>{contagem.concluido} concluído</span>
            {contagem.erro > 0 && <span className={`chip ${STATUS_FILA.erro}`}>{contagem.erro} erro</span>}
            <button className="btn-ghost !px-2 !py-1" title="Atualizar" onClick={loadAll}><RefreshCw size={14} /></button>
          </div>
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {fila.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
              <span className="truncate"><strong>{f.bairro}</strong> · {f.cidade}-{f.estado}{f.erro ? ` — ${f.erro}` : ""}</span>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`chip ${STATUS_FILA[f.status] ?? ""}`}>{f.status}</span>
                {f.status === "erro" && <button className="btn-ghost !px-2 !py-1" title="Tentar de novo" onClick={() => reprocessar(f.id)}><RefreshCw size={13} /></button>}
                <button className="btn-ghost !px-2 !py-1 text-danger" onClick={() => removerFila(f.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {fila.length === 0 && <p className="text-sm text-ink-muted">Nenhuma região na fila. Adicione acima.</p>}
        </div>
      </div>

      {/* Contatos encontrados */}
      <div className="bento-card mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Contatos encontrados <span className="text-ink-muted">({leads.length})</span></h2>
          <span className="flex items-center gap-1 text-xs text-ink-muted"><Send size={12} /> {leads.filter((l) => l.status !== "novo").length} na fila de disparo</span>
        </div>
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {leads.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.nome}</div>
                <div className="text-xs text-ink-muted">{l.telefone}{l.notas ? ` · ${l.notas.replace("Lotérica · ", "")}` : ""}</div>
              </div>
              <span className="chip bg-black/[0.06] text-ink-soft">{l.status}</span>
            </div>
          ))}
          {leads.length === 0 && <p className="text-sm text-ink-muted">Nenhum contato ainda. Assim que a fila for processada (a cada 5 min), eles aparecem aqui.</p>}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1 text-xs text-ink-muted">
        <AlertCircle size={12} /> A varredura roda automaticamente a cada 5 min. É preciso ter um chip <strong>conectado</strong> para validar os números no WhatsApp.
      </p>
    </div>
  );
}
