import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import type { Contract, ContractInput } from "./types";

// =====================================================================
// Lógica de MESES (núcleo da previsibilidade de caixa)
// ---------------------------------------------------------------------
// Trabalhamos com "índice absoluto de mês" = ano*12 + mês(0-based).
// Isso transforma a comparação entre meses (mesmo de anos diferentes)
// em aritmética inteira simples — sem armadilhas de fuso/dia.
// =====================================================================

/** ano*12 + mês(0-based). Ex.: jan/2026 = 2026*12 + 0 = 24312. */
export function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

/**
 * Índice do mês de INÍCIO do contrato.
 * Lemos a string YYYY-MM-DD na mão (sem `new Date`) para não deslocar o
 * mês por causa do fuso (ex.: "2026-06-01" vira 31/05 em UTC-3).
 */
export function startMonthIndex(startDate: string): number {
  const [y, m] = startDate.split("-").map(Number); // m é 1-based
  return monthIndex(y, (m || 1) - 1);
}

/** Índice do mês corrente (M+0), no fuso local do navegador. */
export function currentMonthIndex(now = new Date()): number {
  return monthIndex(now.getFullYear(), now.getMonth());
}

/**
 * Um contrato está VIGENTE (faturando) num determinado mês-alvo se:
 *   1) já começou .............. alvo >= mês de início
 *   2) ainda não terminou ...... alvo <= mês de início + (duração - 1)
 *      → ele gera `duration_months` parcelas, a 1ª no mês de início,
 *        então a última cai em (início + duração - 1).
 *   3) está ATIVO .............. cancelado/concluído não faturam
 *      → é por isso que cancelar derruba MRR/M+1/M+2 na hora.
 */
export function vigenteNoMes(c: Contract, alvoIdx: number): boolean {
  if (c.status !== "active") return false;
  const inicioIdx = startMonthIndex(c.start_date);
  const fimIdx = inicioIdx + c.duration_months - 1; // última parcela (inclusive)
  return alvoIdx >= inicioIdx && alvoIdx <= fimIdx;
}

/** Índice do mês da ÚLTIMA parcela (encerramento da vigência). */
export function endMonthIndex(c: Contract): number {
  return startMonthIndex(c.start_date) + c.duration_months - 1;
}

const soma = (cs: Contract[]) => cs.reduce((acc, c) => acc + (Number(c.contract_value) || 0), 0);

export interface FinanceMetrics {
  volume: number;   // contratos ativos (contagem)
  mrr: number;      // faturamento vigente no mês corrente
  m1: number;       // projeção do mês seguinte (M+1)
  m2: number;       // projeção de daqui a 2 meses (M+2)
  m0Idx: number;    // índices de mês usados (para rótulos)
  m1Idx: number;
  m2Idx: number;
}

/** Calcula todas as métricas a partir da lista de contratos. */
export function computeMetrics(contracts: Contract[], now = new Date()): FinanceMetrics {
  const m0 = currentMonthIndex(now);
  const m1 = m0 + 1;
  const m2 = m0 + 2;
  const ativos = contracts.filter((c) => c.status === "active");
  return {
    volume: ativos.length,
    mrr: soma(ativos.filter((c) => vigenteNoMes(c, m0))),
    m1: soma(ativos.filter((c) => vigenteNoMes(c, m1))),
    m2: soma(ativos.filter((c) => vigenteNoMes(c, m2))),
    m0Idx: m0, m1Idx: m1, m2Idx: m2,
  };
}

// =====================================================================
// Hook de dados: busca, realtime, inserção e cancelamento (churn).
// =====================================================================
export function useContracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else {
      // numeric/int do Postgres podem vir como string (PostgREST) — normaliza.
      const rows = (data ?? []).map((r) => ({
        ...r,
        contract_value: Number(r.contract_value),
        duration_months: Number(r.duration_months),
        due_date_day: Number(r.due_date_day),
      })) as Contract[];
      setContracts(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Realtime: qualquer insert/update/delete recarrega → dashboards reagem.
    const ch = supabase
      .channel("contracts-finance")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [load]);

  /** Cadastra um novo contrato. Realtime atualiza a lista; recarrega como rede de segurança. */
  const addContract = useCallback(async (input: ContractInput) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Sessão expirada — faça login novamente.");
    const { error } = await supabase.from("contracts").insert({ ...input, user_id: u.user.id });
    if (error) throw error;
    await load();
  }, [load]);

  /**
   * Cancela um contrato (churn). Atualiza o estado local na hora (otimista)
   * para que MRR/M+1/M+2 caiam IMEDIATAMENTE, antes mesmo do round-trip.
   */
  const cancelContract = useCallback(async (id: string) => {
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c)));
    const { error } = await supabase
      .from("contracts")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { await load(); throw error; } // reverte para o estado real em caso de erro
  }, [load]);

  const metrics = useMemo(() => computeMetrics(contracts), [contracts]);

  return { contracts, loading, error, metrics, addContract, cancelContract, reload: load };
}
