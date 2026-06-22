// =====================================================================
// Helpers de mídia: detectar tipo no payload do webhook e subir ao Storage.
// =====================================================================
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type MediaKind = "image" | "audio" | "video" | "document";
export interface MediaInfo { kind: MediaKind; mime: string; name: string | null }

/** Identifica o tipo de mídia numa mensagem da Evolution (ou null se for texto). */
// deno-lint-ignore no-explicit-any
export function detectMedia(message: any): MediaInfo | null {
  if (!message) return null;
  const doc = message.documentMessage ?? message.documentWithCaptionMessage?.message?.documentMessage;
  if (message.imageMessage) return { kind: "image", mime: message.imageMessage.mimetype ?? "image/jpeg", name: null };
  if (message.videoMessage) return { kind: "video", mime: message.videoMessage.mimetype ?? "video/mp4", name: null };
  if (message.audioMessage || message.pttMessage) {
    const a = message.audioMessage ?? message.pttMessage;
    return { kind: "audio", mime: a?.mimetype ?? "audio/ogg", name: null };
  }
  if (doc) return { kind: "document", mime: doc.mimetype ?? "application/octet-stream", name: doc.fileName ?? "documento" };
  if (message.stickerMessage) return { kind: "image", mime: message.stickerMessage.mimetype ?? "image/webp", name: null };
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr",
  "video/mp4": "mp4", "application/pdf": "pdf",
};

/** Sobe um base64 ao bucket 'chat-media' e devolve a URL pública (ou null). */
export async function uploadBase64(
  supabase: SupabaseClient,
  base64: string,
  mime: string,
  pathPrefix: string,
  name?: string | null,
): Promise<string | null> {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = EXT[mime.split(";")[0]] ?? (name?.includes(".") ? name.split(".").pop() : "bin");
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("chat-media")
      .upload(path, bytes, { contentType: mime.split(";")[0], upsert: false });
    if (error) { console.error("[media] upload falhou:", error.message); return null; }
    const base = Deno.env.get("SUPABASE_URL")!;
    return `${base}/storage/v1/object/public/chat-media/${path}`;
  } catch (e) {
    console.error("[media] uploadBase64 erro:", e instanceof Error ? e.message : e);
    return null;
  }
}
