import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { daysInMonth } from "./useContracts";
import type { BillingSettings, Contract, Invoice } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Competência (1º dia do mês) do mês corrente: "YYYY-MM-01". */
export function competenciaAtual(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

/** Vencimento do mês corrente para um contrato (dia do contrato, clampado). */
function dueDateAtual(c: Contract, now = new Date()): string {
  const y = now.getFullYear(), m0 = now.getMonth();
  const dia = Math.min(c.due_date_day, daysInMonth(y, m0));
  return `${y}-${pad(m0 + 1)}-${pad(dia)}`;
}

const DEFAULTS: BillingSettings = {
  ativo: false, pix_key: "", pix_nome: "", pix_copia_cola: "", hora_envio: 8, dias_antes: 0, template: "",
};

export function useBilling() {
  const [settings, setSettings] = useState<BillingSettings>(DEFAULTS);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const competencia = competenciaAtual();

  const load = useCallback(async () => {
    const [{ data: cfg }, { data: inv }] = await Promise.all([
      supabase.from("billing_settings").select("*").maybeSingle(),
      supabase.from("invoices").select("*").eq("competencia", competencia),
    ]);
    if (cfg) {
      setSettings({
        ativo: !!cfg.ativo,
        pix_key: cfg.pix_key ?? "",
        pix_nome: cfg.pix_nome ?? "",
        pix_copia_cola: cfg.pix_copia_cola ?? "",
        hora_envio: Number(cfg.hora_envio ?? 8),
        dias_antes: Number(cfg.dias_antes ?? 0),
        template: cfg.template ?? "",
      });
    }
    setInvoices(((inv ?? []) as Invoice[]).map((r) => ({ ...r, valor: Number(r.valor) })));
    setLoading(false);
  }, [competencia]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("billing-invoices")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [load]);

  /** Mapa contract_id -> fatura do mês corrente (para a UI). */
  const porContrato = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const i of invoices) m.set(i.contract_id, i);
    return m;
  }, [invoices]);

  /** Salva (upsert) as configurações de cobrança. */
  const saveSettings = useCallback(async (next: BillingSettings) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Sessão expirada.");
    const { error } = await supabase.from("billing_settings").upsert(
      { user_id: u.user.id, ...next }, { onConflict: "user_id" },
    );
    if (error) throw error;
    setSettings(next);
  }, []);

  /**
   * Registra a fatura do mês como paga (ou volta para pendente). Faz upsert
   * da parcela da competência corrente — cria se ainda não existir.
   */
  const setPaga = useCallback(async (contract: Contract, paga: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Sessão expirada.");
    const row = {
      user_id: u.user.id,
      contract_id: contract.id,
      competencia,
      due_date: dueDateAtual(contract),
      valor: contract.contract_value,
      status: paga ? "paid" : "pending",
      paid_at: paga ? new Date().toISOString() : null,
    };
    // Atualização otimista da UI.
    setInvoices((prev) => {
      const i = prev.findIndex((x) => x.contract_id === contract.id);
      const merged = { id: prev[i]?.id ?? `tmp-${contract.id}`, reminder_sent_at: prev[i]?.reminder_sent_at ?? null, ...row } as Invoice;
      if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], ...merged }; return cp; }
      return [...prev, merged];
    });
    const { error } = await supabase.from("invoices").upsert(row, { onConflict: "contract_id,competencia" });
    if (error) { await load(); throw error; }
  }, [competencia, load]);

  return { settings, invoices, porContrato, loading, saveSettings, setPaga, reload: load };
}
