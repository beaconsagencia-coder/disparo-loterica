# 🚀 Passo a passo do deploy (para leigos)

Este guia leva o sistema do zero ao ar. Siga **na ordem**, sem pular. Cada passo tem
o comando exato e o que você deve ver na tela. Tempo estimado: 30–45 min.

> 💡 **Como rodar comandos:** abra o **PowerShell** (botão Iniciar → digite "PowerShell" → Enter).
> Para colar um comando, clique com o botão direito dentro da janela preta. Pressione **Enter** para executar.

---

## 🧩 Visão geral (o que é cada peça)

| Peça | O que faz | Onde mora |
|------|-----------|-----------|
| **Supabase** | Banco de dados + login + os "robôs" (Edge Functions) | Nuvem (grátis) |
| **Evolution API** | Conecta os WhatsApps (chips) e envia/recebe mensagens | A mesma que você já usa nos bolões |
| **Site (React)** | A telinha bonita onde você importa leads e responde | Seu PC (teste) e depois na nuvem |

Você vai precisar de **3 coisas anotadas** ao final do Passo 1 e 5:
1. **URL do Supabase** (ex: `https://abcdxyz.supabase.co`)
2. **Chave anon** do Supabase
3. **URL e chave da Evolution API**

Anote tudo num bloco de notas conforme for pegando. 📝

---

## ✅ Passo 1 — Criar o projeto no Supabase

1. Acesse **https://supabase.com** e clique em **Start your project** (entre com o Google, é mais rápido).
2. Clique em **New project**.
   - **Name:** `disparo-loterica`
   - **Database Password:** crie uma senha forte e **anote** (você quase não vai usar, mas guarde).
   - **Region:** escolha **South America (São Paulo)**.
3. Clique em **Create new project** e espere ~2 minutos (ele "monta" o banco).
4. Quando abrir, vá no menu **Settings (engrenagem) → Data API**. Anote:
   - **Project URL** → essa é a sua **URL do Supabase**.
   - **anon public** (em *Project API Keys*) → essa é a sua **chave anon**.

> ✅ **Você deve ter agora:** a URL e a chave anon anotadas.

---

## ✅ Passo 2 — Desligar a confirmação de e-mail (para testar rápido)

Por padrão o Supabase exige confirmar o e-mail antes de entrar. Para testar sem dor de cabeça:

1. No Supabase, vá em **Authentication → Sign In / Providers → Email**.
2. Desligue a opção **Confirm email**.
3. Salve.

> ✅ Agora você consegue criar conta e entrar na hora. (Pode religar isso depois, quando for pra valer.)

---

## ✅ Passo 3 — Instalar a ferramenta do Supabase no seu PC

No PowerShell, cole e rode:

```powershell
npm install -g supabase
```

Confira se instalou:

```powershell
supabase --version
```

> ✅ Deve aparecer um número de versão (ex: `1.x.x`). Se der erro, feche e reabra o PowerShell e tente de novo.

---

## ✅ Passo 4 — Conectar seu projeto local ao Supabase

1. Entre na pasta do projeto:

```powershell
cd "C:\Users\pedro\Desktop\disparo-loterica"
```

2. Faça login (abre o navegador, é só confirmar):

```powershell
supabase login
```

3. Descubra o "ID" do seu projeto: no painel do Supabase, vá em **Settings → General** e copie o **Reference ID** (algo como `abcdxyzabcdxyz`).

4. Conecte (troque `SEU_REF_ID` pelo que você copiou):

```powershell
supabase link --project-ref SEU_REF_ID
```

> Ele pode pedir a **Database Password** que você criou no Passo 1.
> ✅ Deve aparecer algo como `Finished supabase link`.

---

## ✅ Passo 5 — Criar as tabelas no banco

Cole e rode:

```powershell
supabase db push
```

> ✅ Deve listar `0001_init.sql`, `0002_cron.sql`, `0003_daily_limit.sql` e dizer `Finished`.
> Isso cria todas as tabelas, as regras de segurança e o agendador automático.

---

## ✅ Passo 6 — Pegar os dados da Evolution API

Você **já usa** a Evolution API nos seus projetos de bolão. Use a **mesma**:

- **URL da Evolution:** o endereço do seu servidor Evolution (ex: `https://evolution.seudominio.com`).
- **Chave (apikey global):** a chave de API global que você configurou na Evolution.

> 🔎 Não lembra onde está? Geralmente fica no painel do servidor onde a Evolution roda
> (Hostinger/VPS/Easypanel) ou no arquivo de configuração dela (`AUTHENTICATION_API_KEY`).
> Se não tiver uma Evolution rodando, me avise que eu te explico como subir uma.

Anote a **URL** e a **chave**.

---

## ✅ Passo 7 — Guardar os "segredos" no Supabase

Esses comandos guardam as senhas de forma segura. **Troque os valores** pelos seus.
Crie também um token qualquer para o agendador (invente uma frase, ex: `meu-token-secreto-123`).

```powershell
supabase secrets set EVOLUTION_API_URL=https://SUA-EVOLUTION
supabase secrets set EVOLUTION_API_KEY=SUA-CHAVE-EVOLUTION
supabase secrets set DISPATCHER_CRON_SECRET=meu-token-secreto-123
```

> ✅ Cada comando deve dizer `Finished`. Guarde o `DISPATCHER_CRON_SECRET`, usamos ele já já.

---

## ✅ Passo 8 — Ligar o agendador automático (Cron)

O agendador (que dispara as mensagens a cada minuto) precisa saber sua URL e o token.
Vamos guardar isso num cofre interno do banco:

1. No Supabase, vá em **SQL Editor → New query**.
2. Cole o texto abaixo, **trocando** a URL e o token pelos seus, e clique em **Run**:

```sql
select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
select vault.create_secret('meu-token-secreto-123', 'dispatcher_cron_secret');
```

> ✅ Deve aparecer um resultado com um código (uuid). Pronto, o cofre está configurado.
> O agendador já foi criado no Passo 5; agora ele tem as credenciais para funcionar.

---

## ✅ Passo 9 — Publicar os 4 robôs (Edge Functions)

Cole e rode (um de cada vez, ou todos juntos):

```powershell
supabase functions deploy dispatcher --no-verify-jwt
supabase functions deploy evolution-webhook --no-verify-jwt
supabase functions deploy send-reply
supabase functions deploy instance-connect
```

> ✅ Cada um deve dizer `Deployed Function`. O `--no-verify-jwt` é necessário porque o
> agendador e a Evolution chamam essas funções "de fora".

---

## ✅ Passo 10 — Configurar e testar o site no seu PC

1. Na pasta do projeto, crie o arquivo de configuração:

```powershell
Copy-Item .env.example .env
```

2. Abra o arquivo `.env` (clique duas vezes nele dentro da pasta, ou use o Bloco de Notas)
   e preencha **só estas duas linhas** com o que você anotou no Passo 1:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=cole-sua-chave-anon-aqui
```

Salve o arquivo.

3. Instale e rode o site:

```powershell
npm install
npm run dev
```

> ✅ Deve aparecer algo como `Local: http://localhost:5173`.
> Segure **Ctrl** e clique no link, ou copie no navegador. Vai abrir a **tela de login**. 🎉

---

## ✅ Passo 11 — Primeiro uso

1. Na tela de login, clique em **"Não tem conta? Criar agora"**, coloque um e-mail e senha (mín. 6 letras) e crie.
2. Entre com esse e-mail e senha.
3. Vá em **Instâncias → Conectar chip**, dê um nome (ex: "Chip 1") e clique em **Gerar QR Code**.
   - No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → escaneie o QR.
   - ✅ O status vira **conectado** sozinho em alguns segundos.
4. Vá em **Importar Leads**, suba sua planilha (CSV ou Excel), confira o mapeamento das colunas,
   ajuste a mensagem se quiser e clique em **Importar e enfileirar**.
5. Pronto! O sistema começa a disparar **1 mensagem por chip a cada 30–45 min**.
   As respostas aparecem no **Inbox CRM**.

---

## ✅ Passo 12 — Colocar o site no ar (opcional, para usar de qualquer lugar)

Enquanto o site roda só no seu PC (Passo 10), ele funciona, mas fecha quando você desliga.
Para deixá-lo online de graça:

1. Instale a ferramenta da Vercel:

```powershell
npm install -g vercel
```

2. Na pasta do projeto, rode e siga as perguntas (aceite os padrões com Enter):

```powershell
vercel
```

3. Quando ele perguntar das variáveis de ambiente, adicione as mesmas duas do `.env`
   (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`). Depois rode `vercel --prod` para a versão final.

> ✅ Ele te dá um link `https://...vercel.app` que funciona de qualquer celular ou PC.

---

## 🆘 Deu erro? Checklist rápido

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Tela de login não carrega | `.env` errado | Confira URL e chave anon (Passo 10) |
| "Faça login para importar" | Não está logado | Crie conta / entre (Passo 11) |
| QR não aparece | Evolution offline ou chave errada | Confira Passo 6 e 7 |
| Chip fica em "conectando" | Webhook não chegou | Veja se `evolution-webhook` foi publicado (Passo 9) |
| Mensagens não saem | Agendador sem credencial | Refaça o Passo 8 (cofre/Vault) |
| Erro ao criar conta | Confirmação de e-mail ligada | Desligue (Passo 2) |

> Para ver o que os robôs estão fazendo: Supabase → **Edge Functions → (nome) → Logs**.

---

Qualquer passo que travar, me mande **o print do erro** que eu te ajudo a destravar. 💪
