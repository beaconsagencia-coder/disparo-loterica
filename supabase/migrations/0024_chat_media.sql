-- =====================================================================
-- 0024 · Mídia no Inbox (áudio, imagem, documento, vídeo)
-- ---------------------------------------------------------------------
-- Mensagens ganham campos de anexo; os arquivos ficam no Storage
-- (bucket público 'chat-media', caminhos com UUID — não enumeráveis).
-- =====================================================================
alter table public.messages
  add column if not exists media_url  text,
  add column if not exists media_kind text,  -- image | audio | video | document
  add column if not exists media_mime text,
  add column if not exists media_name text;  -- nome do arquivo (documentos)

-- Bucket de mídia das conversas (leitura pública via URL com UUID).
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

-- Usuário autenticado pode subir/ler na bucket; o webhook usa service role
-- (que ignora RLS). Leitura pública dos arquivos é via URL do bucket público.
drop policy if exists "chat_media_insert" on storage.objects;
create policy "chat_media_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-media');

drop policy if exists "chat_media_select" on storage.objects;
create policy "chat_media_select" on storage.objects
  for select to authenticated using (bucket_id = 'chat-media');
