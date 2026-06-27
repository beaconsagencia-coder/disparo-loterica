import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// ---- Tipos isolados do módulo Alfred (não tocam no types.ts global) ----
// API Keys saíram daqui: o Alfred herda a chave do Agente SDR (env GEMINI_API_KEY).
export interface AlfredConfig {
  system_prompt: string;
  base_conhecimento: string;   // base de conhecimento global do SaaS (Bolão Gestor)
  operator_number: string;     // número pessoal do operador (DM de escalonamento)
  handoff_ativo: boolean;      // true = espera a equipe (cron); false = responde na hora
  team_cooldown_min: number;   // pausa após a equipe interagir
  intervene_after_min: number; // prazo p/ o Alfred intervir se a equipe não responder
  proactive_ativo: boolean;    // acompanhamento diário proativo
  proactive_hora: number;      // hora (0-23, Brasília) do contato diário
}
export interface AlfredMember {
  id: string;
  group_id: string;
  numero: string;
  nome: string | null;
}
export type DemandStatus = "pendente" | "em_andamento" | "concluida";
export interface AlfredDemand {
  id: string;
  group_id: string;
  titulo: string;
  descricao: string | null;
  status: DemandStatus;
  prazo: string; // YYYY-MM-DD
}
export type Fase = "onboarding" | "manutencao";
export interface AlfredGroup {
  id: string;
  remote_jid: string;
  client_name: string;
  evolution_instance: string | null;
  active: boolean;
  created_at: string;
  fase_override: Fase | null; // null = automático pela idade do grupo
}
const FASE_THRESHOLD_DIAS = 30; // >= 30 dias => Manutenção (se sem override)
/** Fase efetiva do grupo: override manual, ou automática pela idade. */
export function faseEfetiva(g: Pick<AlfredGroup, "created_at" | "fase_override">): Fase {
  if (g.fase_override === "onboarding" || g.fase_override === "manutencao") return g.fase_override;
  const dias = (Date.now() - new Date(g.created_at).getTime()) / 86_400_000;
  return dias >= FASE_THRESHOLD_DIAS ? "manutencao" : "onboarding";
}

export interface AlfredProposal {
  group_id: string;
  valor_mensal: number | null;
  valor_setup: number | null;
  vigencia_meses: number | null;
  forma_pagamento: string | null;
  entregaveis: string[];
  observacoes: string | null;
}

export type AssetStatus = "ativa" | "pausada" | "encerrada" | "substituida";
export type AssetTipo = "campanha" | "criativo" | "anuncio" | "outro";
export interface AlfredAsset {
  id: string;
  group_id: string;
  titulo: string;
  tipo: AssetTipo;
  status: AssetStatus;
  descricao: string | null;
  substituida_por: string | null;
}
export interface AlfredContext {
  group_id: string;
  empresa_dados: string | null;
  regras_atendimento: string | null;
  drive_link: string | null;
  cronograma: string | null;
  financeiro: string | null;
  observacoes: string | null;
  resumo?: string | null; // consolidado automaticamente (aprendizado) — não editável no form
}
export interface AlfredMemory {
  id: string;
  group_id: string;
  chave: string;
  valor: string;
}
export interface AlfredConnection {
  evolution_instance: string | null;
  connection_status: string;   // desconectado | conectando | conectado
  numero: string | null;
}
export interface AlfredTask {
  id: string;
  group_id: string;
  semana: number;
  ordem: number;
  task_key: string;
  titulo: string;
  done: boolean;
}
export interface AlfredMessage {
  id: string;
  role: "user" | "model";
  sender_name: string | null;
  body: string;
  created_at: string;
  quoted_body?: string | null; // mensagem citada (reply do WhatsApp)
}

const CONFIG_DEFAULT: AlfredConfig = { system_prompt: "", base_conhecimento: "", operator_number: "", handoff_ativo: true, team_cooldown_min: 5, intervene_after_min: 30, proactive_ativo: true, proactive_hora: 9 };

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada.");
  return data.user.id;
}

/**
 * Hook único do módulo: carrega config, grupos e contextos; expõe o CRUD
 * (salvar config, criar/ligar-desligar/excluir grupo, salvar contexto).
 * Recarrega via realtime nas três tabelas alfred_*.
 */
const CONNECTION_DEFAULT: AlfredConnection = {
  evolution_instance: null, connection_status: "desconectado", numero: null,
};

export function useAlfred() {
  const [config, setConfig] = useState<AlfredConfig>(CONFIG_DEFAULT);
  const [connection, setConnection] = useState<AlfredConnection>(CONNECTION_DEFAULT);
  const [groups, setGroups] = useState<AlfredGroup[]>([]);
  const [contexts, setContexts] = useState<Record<string, AlfredContext>>({});
  const [tasks, setTasks] = useState<Record<string, AlfredTask[]>>({});
  const [memory, setMemory] = useState<Record<string, AlfredMemory[]>>({});
  const [members, setMembers] = useState<Record<string, AlfredMember[]>>({});
  const [demands, setDemands] = useState<Record<string, AlfredDemand[]>>({});
  const [assets, setAssets] = useState<Record<string, AlfredAsset[]>>({});
  const [proposals, setProposals] = useState<Record<string, AlfredProposal>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: cfg }, { data: grp }, { data: ctx }, { data: tk }, { data: mem }, { data: mb }, { data: dm }, { data: as }, { data: pr }] = await Promise.all([
      supabase.from("alfred_configs")
        .select("system_prompt, base_conhecimento, operator_number, evolution_instance, connection_status, numero, handoff_ativo, team_cooldown_min, intervene_after_min, proactive_ativo, proactive_hora")
        .maybeSingle(),
      supabase.from("alfred_groups").select("*").order("created_at", { ascending: false }),
      supabase.from("alfred_context")
        .select("group_id, empresa_dados, regras_atendimento, drive_link, cronograma, financeiro, observacoes, resumo"),
      supabase.from("alfred_tasks")
        .select("id, group_id, semana, ordem, task_key, titulo, done")
        .order("semana").order("ordem"),
      supabase.from("alfred_memory").select("id, group_id, chave, valor").order("chave"),
      supabase.from("alfred_group_members").select("id, group_id, numero, nome").order("created_at"),
      supabase.from("alfred_demands").select("id, group_id, titulo, descricao, status, prazo").order("prazo"),
      supabase.from("alfred_assets").select("id, group_id, titulo, tipo, status, descricao, substituida_por").order("updated_at", { ascending: false }),
      supabase.from("alfred_proposals").select("group_id, valor_mensal, valor_setup, vigencia_meses, forma_pagamento, entregaveis, observacoes"),
    ]);
    if (cfg) {
      setConfig({
        system_prompt: cfg.system_prompt ?? "",
        base_conhecimento: cfg.base_conhecimento ?? "",
        operator_number: cfg.operator_number ?? "",
        handoff_ativo: cfg.handoff_ativo ?? true,
        team_cooldown_min: Number(cfg.team_cooldown_min ?? 5),
        intervene_after_min: Number(cfg.intervene_after_min ?? 30),
        proactive_ativo: cfg.proactive_ativo ?? true,
        proactive_hora: Number(cfg.proactive_hora ?? 9),
      });
      setConnection({
        evolution_instance: cfg.evolution_instance ?? null,
        connection_status: cfg.connection_status ?? "desconectado",
        numero: cfg.numero ?? null,
      });
    }
    setGroups((grp as AlfredGroup[]) ?? []);
    const map: Record<string, AlfredContext> = {};
    for (const c of (ctx as AlfredContext[]) ?? []) map[c.group_id] = c;
    setContexts(map);
    const tmap: Record<string, AlfredTask[]> = {};
    for (const t of (tk as AlfredTask[]) ?? []) (tmap[t.group_id] ??= []).push(t);
    setTasks(tmap);
    const mmap: Record<string, AlfredMemory[]> = {};
    for (const m of (mem as AlfredMemory[]) ?? []) (mmap[m.group_id] ??= []).push(m);
    setMemory(mmap);
    const bmap: Record<string, AlfredMember[]> = {};
    for (const m of (mb as AlfredMember[]) ?? []) (bmap[m.group_id] ??= []).push(m);
    setMembers(bmap);
    const dmap: Record<string, AlfredDemand[]> = {};
    for (const d of (dm as AlfredDemand[]) ?? []) (dmap[d.group_id] ??= []).push(d);
    setDemands(dmap);
    const amap: Record<string, AlfredAsset[]> = {};
    for (const a of (as as AlfredAsset[]) ?? []) (amap[a.group_id] ??= []).push(a);
    setAssets(amap);
    const pmap: Record<string, AlfredProposal> = {};
    for (const p of (pr as (Omit<AlfredProposal, "entregaveis"> & { entregaveis: unknown })[]) ?? []) {
      pmap[p.group_id] = { ...p, entregaveis: Array.isArray(p.entregaveis) ? (p.entregaveis as string[]) : [] };
    }
    setProposals(pmap);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("alfred")
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_groups" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_context" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_configs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_tasks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_memory" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_group_members" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_demands" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_assets" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_proposals" }, () => load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [load]);

  // ---- config ----
  const saveConfig = useCallback(async (next: AlfredConfig) => {
    const user_id = await uid();
    const { error } = await supabase.from("alfred_configs").upsert(
      { user_id, ...next }, { onConflict: "user_id" },
    );
    if (error) throw error;
    setConfig(next);
  }, []);

  /** Cria/conecta o chip dedicado do Alfred e devolve o QR Code (base64). */
  const connectWhatsapp = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("alfred-connect", { body: {} });
    if (error) throw error;
    await load();
    return (data?.qrcode as string | null) ?? null;
  }, [load]);

  /** Sincroniza o status do chip consultando a Evolution (fallback do webhook). */
  const checkStatus = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("alfred-status", { body: {} });
    if (error) return null;
    await load();
    return (data?.status as string) ?? null;
  }, [load]);

  /** Lista os grupos de WhatsApp em que o chip do Alfred está (id + nome). */
  const listarGruposWhatsapp = useCallback(async (): Promise<{ id: string; subject: string }[]> => {
    const { data, error } = await supabase.functions.invoke("alfred-grupos", { body: {} });
    if (error) throw error;
    return (data?.grupos as { id: string; subject: string }[]) ?? [];
  }, []);

  // ---- grupos ----
  const addGroup = useCallback(async (remote_jid: string, client_name: string, evolution_instance?: string) => {
    const user_id = await uid();
    const { error } = await supabase.from("alfred_groups").insert({
      user_id, remote_jid: remote_jid.trim(), client_name: client_name.trim(),
      evolution_instance: evolution_instance?.trim() || null, active: true,
    });
    if (error) throw error;
    await load();
  }, [load]);

  const toggleGroup = useCallback(async (id: string, active: boolean) => {
    // otimista
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, active } : g)));
    const { error } = await supabase.from("alfred_groups").update({ active }).eq("id", id);
    if (error) { await load(); throw error; }
  }, [load]);

  const removeGroup = useCallback(async (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    const { error } = await supabase.from("alfred_groups").delete().eq("id", id);
    if (error) { await load(); throw error; }
  }, [load]);

  /** Define a fase do grupo: 'onboarding' | 'manutencao' | null (automático). */
  const setFase = useCallback(async (id: string, fase: Fase | null) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, fase_override: fase } : g)));
    const { error } = await supabase.from("alfred_groups").update({ fase_override: fase }).eq("id", id);
    if (error) { await load(); throw error; }
  }, [load]);

  // ---- ativos/campanhas do cliente (estado vivo da operação) ----
  const addAsset = useCallback(async (groupId: string, titulo: string, tipo: AssetTipo, descricao?: string) => {
    const user_id = await uid();
    if (!titulo.trim()) throw new Error("Informe o nome da campanha.");
    const { error } = await supabase.from("alfred_assets").insert({
      user_id, group_id: groupId, titulo: titulo.trim(), tipo, descricao: descricao?.trim() || null,
      status: "ativa", origem: "manual", started_at: new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
    await load();
  }, [load]);

  const updateAsset = useCallback(async (id: string, groupId: string, patch: Partial<Pick<AlfredAsset, "status" | "titulo" | "tipo" | "descricao">>) => {
    setAssets((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
    const next: Record<string, unknown> = { ...patch };
    if (patch.status === "encerrada" || patch.status === "substituida") next.ended_at = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("alfred_assets").update(next).eq("id", id);
    if (error) await load();
  }, [load]);

  const deleteAsset = useCallback(async (id: string, groupId: string) => {
    setAssets((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).filter((a) => a.id !== id) }));
    const { error } = await supabase.from("alfred_assets").delete().eq("id", id);
    if (error) await load();
  }, [load]);

  // ---- checklist (tarefas do cronograma por grupo) ----
  const toggleTask = useCallback(async (task: AlfredTask) => {
    const done = !task.done;
    setTasks((prev) => ({
      ...prev,
      [task.group_id]: (prev[task.group_id] ?? []).map((t) => (t.id === task.id ? { ...t, done } : t)),
    }));
    const { error } = await supabase.from("alfred_tasks")
      .update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", task.id);
    if (error) { await load(); throw error; }
  }, [load]);

  /** Apaga todo o histórico de mensagens de um grupo (alfred_messages). */
  const clearHistory = useCallback(async (groupId: string) => {
    const { error } = await supabase.from("alfred_messages").delete().eq("group_id", groupId);
    if (error) throw error;
  }, []);

  // ---- equipe do grupo (quem é membro x cliente) ----
  const addMember = useCallback(async (groupId: string, numero: string, nome?: string) => {
    const user_id = await uid();
    const dig = numero.replace(/\D/g, "").replace(/^0+/, "");
    if (!dig) throw new Error("Informe um número válido.");
    const { error } = await supabase.from("alfred_group_members").insert({
      user_id, group_id: groupId, numero: dig, nome: nome?.trim() || null,
    });
    if (error) throw error;
    await load();
  }, [load]);

  const removeMember = useCallback(async (id: string, groupId: string) => {
    setMembers((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).filter((m) => m.id !== id) }));
    const { error } = await supabase.from("alfred_group_members").delete().eq("id", id);
    if (error) await load();
  }, [load]);

  // ---- demandas avulsas (Kanban) ----
  const addDemand = useCallback(async (groupId: string, titulo: string, prazo: string, descricao?: string) => {
    const user_id = await uid();
    if (!titulo.trim()) throw new Error("Informe o título da demanda.");
    if (!prazo) throw new Error("Defina o prazo de entrega.");
    const { error } = await supabase.from("alfred_demands").insert({
      user_id, group_id: groupId, titulo: titulo.trim(), descricao: descricao?.trim() || null, prazo, origem: "manual",
    });
    if (error) throw error;
    await load();
  }, [load]);

  const updateDemand = useCallback(async (id: string, groupId: string, patch: Partial<Pick<AlfredDemand, "status" | "prazo" | "titulo">>) => {
    setDemands((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    const { error } = await supabase.from("alfred_demands").update(patch).eq("id", id);
    if (error) await load();
  }, [load]);

  const deleteDemand = useCallback(async (id: string, groupId: string) => {
    setDemands((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).filter((d) => d.id !== id) }));
    const { error } = await supabase.from("alfred_demands").delete().eq("id", id);
    if (error) await load();
  }, [load]);

  /** Remove um item da memória aprendida (ex.: dado sensível que não quer guardar). */
  const deleteMemory = useCallback(async (id: string, groupId: string) => {
    setMemory((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).filter((m) => m.id !== id) }));
    const { error } = await supabase.from("alfred_memory").delete().eq("id", id);
    if (error) await load();
  }, [load]);

  // ---- contexto (1 por grupo) ----
  const saveContext = useCallback(async (group_id: string, patch: Omit<AlfredContext, "group_id">) => {
    const user_id = await uid();
    const { error } = await supabase.from("alfred_context").upsert(
      { user_id, group_id, ...patch }, { onConflict: "group_id" },
    );
    if (error) throw error;
    setContexts((prev) => ({ ...prev, [group_id]: { group_id, ...patch } }));
  }, []);

  // ---- proposta/plano contratado (1 por grupo) ----
  const saveProposal = useCallback(async (group_id: string, patch: Omit<AlfredProposal, "group_id">) => {
    const user_id = await uid();
    const { error } = await supabase.from("alfred_proposals").upsert(
      { user_id, group_id, ...patch, entregaveis: patch.entregaveis ?? [] }, { onConflict: "group_id" },
    );
    if (error) throw error;
    setProposals((prev) => ({ ...prev, [group_id]: { group_id, ...patch } }));
  }, []);

  return {
    config, connection, groups, contexts, tasks, memory, members, demands, assets, proposals, loading,
    saveConfig, connectWhatsapp, checkStatus, listarGruposWhatsapp,
    addGroup, toggleGroup, removeGroup, setFase, saveContext, saveProposal, toggleTask, clearHistory, deleteMemory,
    addMember, removeMember, addDemand, updateDemand, deleteDemand,
    addAsset, updateAsset, deleteAsset, reload: load,
  };
}
