# Ativar o Supabase (4 etapas)

O app já funciona 100% local (`localStorage`). Quando terminar os testes:

1. **Criar o projeto** em https://supabase.com → *New project*. Aguarde finalizar.
2. **Criar as tabelas:** no painel, abra *SQL Editor* → *New query*, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas, as políticas RLS e ativa o Realtime nas 3 tabelas.
3. **Configurar as chaves:** em *Project Settings → API*, copie a **Project URL** e a chave **anon public**. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Reinicie com `npm run dev`. O badge no topo muda para **Supabase Online**.
4. **Migrar os testes locais:** clique em **Config (engrenagem) → "Sincronizar dados locais para o Supabase"**. A partir daí, todos os supervisores veem em tempo real os "OK" e edições uns dos outros.

> Observação: as políticas RLS do schema liberam leitura/escrita para a chave `anon` (uso interno). Para produção, restrinja a usuários autenticados.
