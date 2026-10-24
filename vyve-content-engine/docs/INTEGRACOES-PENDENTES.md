# Integrações que dependem de credenciais

Status em 24/10/2026. "Testado" significa chamada real ou teste automatizado executado; nada aqui é dado como funcionando sem isso.

| Integração | Situação | O que falta | Onde configurar |
|---|---|---|---|
| **Anthropic API** (agentes autônomos) | Código pronto; testado só o bloqueio por orçamento. **Nenhuma chamada real feita** (não havia chave) | Criar chave em console.anthropic.com e pôr `ANTHROPIC_API_KEY` no `.env`; depois clicar em **Configurações → Testar Anthropic API** | `.env` |
| **Claude Code** (subagentes) | **Testado de verdade**: a pesquisa e os roteiros do lote de demonstração foram respondidos por esse modo | Nada | — |
| **Instagram Graph API** (publicar e coletar métricas) | Fluxo implementado (imagem, carrossel, Reels, Stories, insights). Testado **só com respostas simuladas** da Graph API. Nunca publicou de verdade | App na Meta com `instagram_business_content_publish` e `instagram_business_manage_insights` aprovados; conta profissional; token de longa duração por cliente numa variável (`IG_TOKEN_...`); `ig_user_id` | Meta for Developers; **Cliente → Integrações** |
| **URL pública das mídias** | Rota `/api/public-media/:id` com assinatura HMAC, só para peças aprovadas. Testada a assinatura | Painel publicado com HTTPS e `VYVE_PUBLIC_BASE_URL` apontando para ele (a Meta baixa os arquivos por URL) | Hospedagem + `.env` |
| **Supabase** | Migrações escritas para Postgres puro e compatíveis com Supabase; testadas em Postgres 16 local | Criar projeto, rodar `npm run db:migrate` com a URL de serviço, criar `vyve_login` e `grant vyve_app to vyve_login` | Supabase |
| **Supabase Storage** | Não usado: os arquivos ficam no disco do servidor (`storage/`) | Para hospedar em servidor sem disco persistente, trocar `storage.ts` por um adaptador de bucket | Próximo passo |
| **Supabase Auth** | Não usado: login próprio (scrypt + cookie assinado) | Se quiser SSO/Google, adaptar `login()` e `readSession()` | Próximo passo |
| **n8n** | 4 workflows gerados; todas as rotas que eles chamam foram testadas via HTTP com chave real. **Os JSON não foram importados num n8n** | Instância n8n, importar, editar `base_url`, criar credencial Header Auth | n8n |
| **E-mail de avisos** (workflow 04) | Nó de e-mail com placeholders | Credencial SMTP no n8n ou trocar por Slack/WhatsApp | n8n |
| **Transcrição local** | **Testada** (faster-whisper, modelo `small`, português) | Instalar no servidor de produção | `.env` |
| **Metricool / vidIQ** | Não integrados ao VYVE (existem como conectores desta conta do Claude, fora do sistema) | Avaliar se viram fonte de métricas via CSV ou API | — |
