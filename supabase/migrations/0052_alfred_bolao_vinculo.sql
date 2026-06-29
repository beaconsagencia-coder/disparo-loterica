-- =====================================================================
-- 0052 · Alfred × Bolão Gestor: vincular grupo a uma conta do Bolão Gestor
-- ---------------------------------------------------------------------
-- O grupo do Alfred pode apontar para uma conta do Bolão Gestor (outro
-- projeto Supabase). Quando o cliente perguntar sobre vendas, bolões,
-- premiações ou assinatura, o Alfred consulta a ponte (alfred-bridge) e
-- responde com dados AO VIVO daquela conta.
--   • bolao_account_id   : user_id da conta no Bolão Gestor (chave de leitura).
--   • bolao_account_nome : nome exibível da conta (cache p/ o painel).
-- =====================================================================
alter table public.alfred_groups
  add column if not exists bolao_account_id   text,
  add column if not exists bolao_account_nome text;
