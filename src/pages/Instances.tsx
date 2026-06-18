import { useEffect, useState } from "react";
import { Plus, Smartphone, QrCode, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { InstanceBadge } from "@/components/ui/StatusBadge";
import type { WhatsappInstance } from "@/lib/types";

export default function Instances() {
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const { data } = await supabase.from("whatsapp_instances").select("*").order("nome");
    setInstances((data as any) ?? []);
  }

  useEffect(() => {
    load();
    // Atualiza status em tempo real (conectando -> conectado via webhook)
    const ch = supabase
      .channel("instances")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_instances" }, load)
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, []);

  async function connect() {
    if (!nome.trim()) return;
    setLoading(true);
    setQr(null);
    const { data, error } = await supabase.functions.invoke("instance-connect", {
      body: { nome: nome.trim() },
    });
    setLoading(false);
    if (error) return alert("Falha: " + error.message);
    setQr(data?.qrcode ?? null);
    load();
  }

  async function removeInstance(i: WhatsappInstance) {
    if (!confirm(`Excluir o chip "${i.nome}"? Isso desconecta o número e remove a instância.`)) return;
    const { error } = await supabase.functions.invoke("instance-delete", { body: { id: i.id } });
    if (error) return alert("Falha ao excluir: " + error.message);
    load();
  }

  async function resyncWebhooks() {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("webhook-sync", { body: {} });
    setSyncing(false);
    if (error) return alert("Falha ao re-sincronizar: " + error.message);
    alert(`Webhooks atualizados: ${data?.atualizados ?? 0}` + (data?.falhas ? ` · falhas: ${data.falhas}` : ""));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Instâncias</h1>
          <p className="text-sm text-ink-muted">Conecte seus números de WhatsApp (chips) via QR Code.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={resyncWebhooks} disabled={syncing}
            title="Re-registra o webhook (com token) em todos os chips. Rode após definir o segredo do webhook.">
            <ShieldCheck size={16} /> {syncing ? "Sincronizando…" : "Re-sincronizar webhooks"}
          </button>
          <button className="btn-accent" onClick={() => { setModalOpen(true); setQr(null); setNome(""); }}>
            <Plus size={16} /> Conectar chip
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {instances.map((i) => (
          <div key={i.id} className="bento-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Smartphone size={18} />
              </div>
              <div className="flex items-center gap-1">
                <InstanceBadge status={i.status} />
                <button
                  className="btn-ghost !px-2 !py-1 text-ink-muted hover:text-danger"
                  title="Excluir chip"
                  onClick={() => removeInstance(i)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div>
              <div className="font-medium">{i.nome}</div>
              <div className="text-xs text-ink-muted">{i.numero ?? i.evolution_instance}</div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                <span>Hoje: {i.daily_count}/{i.daily_limit}</span>
                {i.daily_count >= i.daily_limit && <span className="text-[#b4231b]">teto atingido</span>}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${Math.min(100, (i.daily_count / Math.max(1, i.daily_limit)) * 100)}%` }}
                />
              </div>
            </div>
            <PersonaField key={`persona-${i.id}`} instance={i} />
          </div>
        ))}
        {instances.length === 0 && (
          <p className="col-span-full text-sm text-ink-muted">Nenhum chip conectado ainda.</p>
        )}
      </div>

      {/* Modal glassmorphism */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="glass-strong w-full max-w-md rounded-xl2 p-6">
            <h2 className="mb-1 text-lg font-semibold">Conectar novo chip</h2>
            <p className="mb-4 text-sm text-ink-muted">Dê um nome e escaneie o QR Code no WhatsApp do celular.</p>

            <label className="mb-1 block text-xs font-medium text-ink-soft">Nome do chip</label>
            <input
              className="input mb-4"
              placeholder="Ex: Chip 1 — Comercial"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />

            {qr ? (
              <div className="flex flex-col items-center gap-2">
                <img src={qr} alt="QR Code" className="h-56 w-56 rounded-xl border border-black/5" />
                <p className="text-xs text-ink-muted">Aguardando leitura… a tela atualiza sozinha.</p>
                <button className="btn-ghost" onClick={connect}><RefreshCw size={14} /> Gerar novo QR</button>
              </div>
            ) : (
              <button className="btn-accent w-full" disabled={loading || !nome.trim()} onClick={connect}>
                <QrCode size={16} /> {loading ? "Gerando QR…" : "Gerar QR Code"}
              </button>
            )}

            <button className="btn-ghost mt-3 w-full" onClick={() => setModalOpen(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Nome com que o atendente (IA) se apresenta neste chip — teste A/B de persona. */
function PersonaField({ instance }: { instance: WhatsappInstance }) {
  const [val, setVal] = useState(instance.persona_nome ?? "");
  const [estado, setEstado] = useState<"idle" | "salvando" | "ok">("idle");

  async function salvar() {
    const novo = val.trim();
    if (novo === (instance.persona_nome ?? "")) return; // nada mudou
    setEstado("salvando");
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({ persona_nome: novo || null })
      .eq("id", instance.id);
    setEstado(error ? "idle" : "ok");
    if (error) alert("Falha ao salvar: " + error.message);
    else setTimeout(() => setEstado("idle"), 1500);
  }

  return (
    <div className="border-t border-black/5 pt-3">
      <label className="mb-1 block text-xs font-medium text-ink-soft">Atendente se apresenta como</label>
      <input
        className="input"
        placeholder="Ex: Ana"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <p className="mt-1 text-[11px] text-ink-muted">
        {estado === "salvando"
          ? "Salvando…"
          : estado === "ok"
            ? "Salvo ✓"
            : "A IA usa este nome ao falar pelo chip (vazio = nome global do SDR)."}
      </p>
    </div>
  );
}
