import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// ---- Tipos isolados do módulo Alfred (não tocam no types.ts global) ----
export interface AlfredConfig {
  gemini_api_key: string | null;
  evolution_api_key: string | null;
  evolution_api_url: string | null;
  system_prompt: string;
}
export interface AlfredGroup {
  id: string;
  remote_jid: string;
  client_name: string;
  evolution_instance: string | null;
  active: boolean;
  created_at: string;
}
export interface AlfredContext {
  group_id: string;
  drive_link: string | null;
  cronograma: string | null;
  financeiro: string | null;
  observacoes: string | null;
}
export interface AlfredConnection {
  evolution_instance: string | null;
  connection_status: string;   // desconectado | conectando | conectado
  numero: string | null;
}

const CONFIG_DEFAULT: AlfredConfig = {
  gemini_api_key: "", evolution_api_key: "", evolution_api_url: "", system_prompt: "",
};

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: cfg }, { data: grp }, { data: ctx }] = await Promise.all([
      supabase.from("alfred_configs")
        .select("gemini_api_key, evolution_api_key, evolution_api_url, system_prompt, evolution_instance, connection_status, numero")
        .maybeSingle(),
      supabase.from("alfred_groups").select("*").order("created_at", { ascending: false }),
      supabase.from("alfred_context").select("group_id, drive_link, cronograma, financeiro, observacoes"),
    ]);
    if (cfg) {
      setConfig({
        gemini_api_key: cfg.gemini_api_key ?? "",
        evolution_api_key: cfg.evolution_api_key ?? "",
        evolution_api_url: cfg.evolution_api_url ?? "",
        system_prompt: cfg.system_prompt ?? "",
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
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("alfred")
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_groups" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_context" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alfred_configs" }, () => load())
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

  // ---- contexto (1 por grupo) ----
  const saveContext = useCallback(async (group_id: string, patch: Omit<AlfredContext, "group_id">) => {
    const user_id = await uid();
    const { error } = await supabase.from("alfred_context").upsert(
      { user_id, group_id, ...patch }, { onConflict: "group_id" },
    );
    if (error) throw error;
    setContexts((prev) => ({ ...prev, [group_id]: { group_id, ...patch } }));
  }, []);

  return {
    config, connection, groups, contexts, loading,
    saveConfig, connectWhatsapp, addGroup, toggleGroup, removeGroup, saveContext, reload: load,
  };
}
