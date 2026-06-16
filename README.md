# Disparo Lotérica · SaaS de prospecção B2B no WhatsApp

Disparo de mensagens B2B via WhatsApp (Evolution API) com **round-robin entre chips**,
rate limit anti-ban (**1 mensagem por chip a cada 30–45 min**), importação de leads
por CSV/Excel, geração de mensagens com **Spintax** + saudação dinâmica, e um
**CRM Inbox unificado** (todas as instâncias num só painel).

Substitui o fluxo antigo do n8n por uma infra Supabase + Edge Functions.

## Stack
- **Frontend:** React (Vite) + Tailwind + Lucide. UI clean estilo Apple, Bento Grid, Glassmorphism.
- **Backend:** Supabase (Postgres + RLS), Edge Functions (Deno), pg_cron.
- **WhatsApp:** Evolution API (múltiplas instâncias).

## Estrutura
```
supabase/
  migrations/
    0001_init.sql        Tabelas, índices, triggers, RLS, RPC claim_next_message
    0002_cron.sql        Agenda o dispatcher (pg_cron + pg_net), a cada 1 min
  functions/
    _shared/             cors, spintax/saudação, cliente Evolution
    dispatcher/          Fila + round-robin + regra dos 30–45 min  (cron)
    evolution-webhook/   Recebe respostas -> Inbox unificado
    send-reply/          Atendente responde pela MESMA instância (RLS por JWT)
    instance-connect/    Cria instância na Evolution e devolve QR Code
src/
  pages/                 Dashboard (Bento), UploadPage (CSV/XLSX), Inbox (CRM), Instances (QR)
  components/ui/         Bento, Sidebar, StatusBadge (glassmorphism)
  components/upload/     Parser CSV/XLSX + mapeamento de colunas
  lib/                   supabase, types, phone, spintax (preview)
```

## Como o rate limit funciona (a "Regra de Ouro")
1. O Cron chama `dispatcher` a cada **1 minuto**.
2. O dispatcher lista as instâncias **conectadas** cujo `next_allowed_send_at` já venceu,
   ordenadas pela menos recentemente usada (**round-robin**).
3. Cada instância elegível reivindica **1** mensagem pendente (RPC atômico com `SKIP LOCKED`)
   e a envia.
4. Após enviar, grava `next_allowed_send_at = agora + random(30..45) min`.

➡️ Com 3 chips conectados, saem **3 mensagens** por janela, uma por chip. Rodar de minuto
em minuto é seguro: chips fora da janela são ignorados.

## Setup

### 1. Banco
```bash
supabase db push        # aplica migrations/0001_init.sql e 0002_cron.sql
```
Antes do cron (0002), crie os secrets do Vault (uma vez):
```sql
select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
select vault.create_secret('SEU_TOKEN', 'dispatcher_cron_secret');
```

### 2. Secrets das Edge Functions
```bash
supabase secrets set EVOLUTION_API_URL=https://sua-evolution
supabase secrets set EVOLUTION_API_KEY=sua-key
supabase secrets set DISPATCHER_CRON_SECRET=SEU_TOKEN   # = ao do Vault
```

### 3. Deploy das functions
```bash
supabase functions deploy dispatcher
supabase functions deploy evolution-webhook
supabase functions deploy send-reply
supabase functions deploy instance-connect
```
> `dispatcher` valida `x-cron-secret`; pode rodar com `--no-verify-jwt`.
> `evolution-webhook` recebe POST da Evolution; configure com `--no-verify-jwt`.

### 4. Frontend
```bash
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Fluxo de uso
1. **Instâncias** → conectar 1–3 chips por QR Code.
2. **Importar Leads** → subir CSV/XLSX, mapear colunas, escrever o template Spintax → enfileira.
3. O **dispatcher** dispara respeitando o rate limit, distribuindo entre os chips.
4. Respostas caem no **Inbox CRM** unificado; o atendente responde pela mesma instância.

## Notas de produção
- A confirmação `conectando → conectado` chega pelo evento `CONNECTION_UPDATE` da Evolution e é
  tratada no `evolution-webhook` (atualiza `status` e captura o `numero` do dono quando `state=open`).
  O `instance-connect` já registra o webhook com os eventos `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- **Teto diário anti-ban:** cada chip tem `daily_limit` (padrão 40). O dispatcher pula instâncias que
  já atingiram o teto no dia (reset no fuso `America/Sao_Paulo`). Ajuste por chip direto na tabela.
- Spintax e saudação são renderizados no servidor (`_shared/spintax.ts`); o frontend só faz prévia.
