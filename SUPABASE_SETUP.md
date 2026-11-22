# Configurar e Ativar o Supabase (Fase 1 — Segurança & Auth Real)

O app funciona em modo local (`localStorage`) quando as variáveis de ambiente não estão preenchidas. Para operar conectado ao Supabase com autenticação real e RLS:

## 1. Desabilitar cadastro público e criar usuários no Supabase Auth
1. No painel do seu projeto Supabase (`https://sgydwilbtyktthzjsiqg.supabase.co`), abra **Authentication → Sign In / Providers** (ou **Auth Settings**).
2. Desative **Allow new users to sign up** para impedir que qualquer pessoa crie contas por fora.
3. Em **Authentication → Users → Add user**, crie as contas individuais dos supervisores e administradores (marque **Auto Confirm User**).

## 2. Aplicar o schema / migration de segurança (RLS)
- **Se o banco já existe** (tabelas `workstations`, `operator_shifts`, `alert_logs` já criadas):
  Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/migrations/20261122000001_phase1_security_rls.sql` e clique em **Run**.
  Esse script:
  - Adiciona colunas de auditoria (`updated_by`, `created_by`, `acknowledged_by`) com triggers `SECURITY INVOKER`.
  - Remove a função/cabeçalho antigo `is_pa_authorized` (`x-pa-client`).
  - Revoga o acesso da role `anon` e exige sessão válida (`TO authenticated`, não anônima) via RLS para leitura e escrita.
  - Garante as 3 tabelas na publicação `supabase_realtime`.
- **Se for um projeto novo do zero:** execute `supabase/schema.sql` no **SQL Editor**.

## 3. Configurar as variáveis de ambiente
Em **Project Settings → API Keys**, copie a **Project URL** e a **Publishable Key** (`sb_publishable_...`, ou a `anon public` legada). Copie `.env.example` para `.env` (ou configure na Vercel) e preencha:
```env
VITE_SUPABASE_URL=https://sgydwilbtyktthzjsiqg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
> Se o projeto mudar de URL no Supabase, atualize também o domínio em `connect-src` da diretiva `Content-Security-Policy` no arquivo `vercel.json`.

## 4. Iniciar / Publicar e migrar testes locais
1. Reinicie com `npm run dev` (ou faça o deploy na Vercel após aplicar a migration).
2. Faça login com o e-mail e senha criados no **Supabase Auth**.
3. O badge no topo exibirá **Supabase Online**.
4. Caso queira enviar dados locais antigos de testes para a nuvem, clique em **Config (engrenagem) → "Sincronizar dados locais para o Supabase"**.
