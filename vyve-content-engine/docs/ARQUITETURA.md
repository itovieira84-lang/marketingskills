# Arquitetura

## Visão geral

```
Briefing (painel, CLI ou n8n)
   │
   ▼
Orquestrador ── fila agent_runs (Postgres, com dependências, travas e novas tentativas)
   │
   ├─ validar ──► 01 Pesquisa ──► [aprovação da pesquisa]
   │                                  │
   │              02 Roteiros (um por formato) ──► [aprovação dos roteiros]
   │                                  │
   │              produção por peça: 03 Audiovisual (Reels) · 04 Design (artes) · texto (newsletter)
   │                                  │
   │              revisão automática (QA de texto e mídia) ──► [aprovação de cada peça]
   │                                  │
   └──────────────────────────────── 05 Calendário ──► publicação oficial ──► 06 Análise
                                                                         │
                                         aprendizados ◄──────────────────┘ (voltam para a 01)
```

Etapas obrigatórias de cada peça: IDEIA → PESQUISA → ROTEIRO → PRODUÇÃO → REVISÃO → APROVAÇÃO → AGENDAMENTO → PUBLICAÇÃO → ANÁLISE. Cada mudança grava `piece_history` (data, quem, agente, nota).

## Componentes

| Componente | Onde | Papel |
|---|---|---|
| Orquestrador | `packages/engine/src/orchestrator.ts` | Cria o grafo do lote, processa a fila, gates, custos, retries, status |
| 01 Pesquisa | `agents/research.ts`, `sources.ts` | Gera o briefing estratégico; só mantém itens com URL verificada |
| 02 Roteiros | `agents/strategy.ts` | Um passo por formato; remove referências que não vieram da pesquisa |
| 03 Audiovisual | `agents/audiovisual.ts`, `media/*` | Casos A/B/C (abaixo) com Remotion e FFmpeg |
| 04 Design | `agents/design.ts`, `packages/video` | Carrossel 1080×1350, card, Stories 1080×1920, capas |
| 05 Calendário | `agents/calendar.ts`, `integrations/instagram.ts` | Distribuição, validação por canal, publicação oficial |
| 06 Análise | `agents/analytics.ts` | Relatório só com métricas gravadas; correlação ≠ causa |
| Painel | `apps/web` | Next.js 16 + Tailwind 4, server actions, RLS por sessão |
| API n8n | `apps/web/app/api/v1` | Chave Bearer com papel `system` |

### Casos do audiovisual

- **A, vídeo original:** detecta fala por silêncio, escolhe um trecho diferente para cada Reels, corta e reenquadra para 1080×1920, transcreve localmente (faster-whisper) e renderiza com título, legendas sincronizadas e CTA. Valida dimensões, duração, codec e decodificação completa.
- **B, imagens + narração autorizada:** monta cenas com as imagens do cliente sobre a narração enviada (nunca sintetizada).
- **C, nada disponível:** gera storyboard e quadros de referência e marca **PENDENTE DE PRODUÇÃO**.

Voz de pessoa real nunca é clonada nem sintetizada pelo sistema.

## Modos de IA

| Modo | Como roda | Custo |
|---|---|---|
| `anthropic` | Worker chama a API (Claude, busca na web, saída estruturada Zod, streaming) | Medido por chamada em `api_costs`, com teto por lote e mensal |
| `claude-code` | A etapa vira tarefa (`vyve task show`); o subagente responde (`vyve task submit`), passando pelo mesmo esquema e verificações | Assinatura do Claude Code |
| `fixture` | Saída determinística marcada `[FICTÍCIO]` | Zero; só para teste |

## Banco e segurança

- Postgres com esquema `vyve`, 25 tabelas, migrações em `supabase/migrations`.
- **RLS em todas as tabelas.** Cada transação define `app.team_id`, `app.user_id` e `app.role`; o app conecta como `vyve_login` (sem ser dono das tabelas), então as políticas valem de verdade. Papel `client` só vê clientes dos quais é membro.
- Papéis: dono, administrador, estrategista, criador, revisor, cliente, sistema. Matriz em `packages/engine/src/auth.ts`.
- Senhas com scrypt; sessão em cookie HMAC httpOnly; chaves de API guardadas como hash.
- Segredos só em variáveis de ambiente; o banco guarda apenas o **nome** da variável.
- Publicação exige: aprovação humana da versão atual, credencial oficial, URL pública assinada (HMAC) que só entrega mídia de peça aprovada, e idempotência por peça+versão+canal.
- Direitos de uso e consentimento conferidos antes de cada produção; consentimento revogado tira o material da fila.
- QA de texto: CPF, e-mail e telefone bloqueiam; promessas de resultado, saúde e superlativos viram aviso ao revisor; termos proibidos da marca bloqueiam.

## Fila

`agent_runs` guarda cada etapa com `depends_on` (`passo`, `prefixo:*` = todos concluídos, `~` = basta terminar). `claim_next_run` usa `for update skip locked`, então vários workers podem rodar juntos. Falhas temporárias voltam para a fila com espera exponencial; travas esquecidas são liberadas após 30 min. A chave de idempotência do lote é `sha256(briefing + mix + modo)`.

## n8n

| Workflow | Gatilho | Chama |
|---|---|---|
| 01 Briefing → lote | Webhook POST | `POST /api/v1/briefings` (reenvio devolve o mesmo lote) |
| 02 Fila e publicação | A cada 15 min | `POST /api/v1/queue/drain`, `POST /api/v1/publish-due` (começa com `dryRun: true`) |
| 03 Métricas e análise | Diário 8h | `POST /api/v1/metrics/collect`, `GET /api/v1/clients`, `POST /api/v1/analyze` |
| 04 Avisos de aprovação | De hora em hora | `GET /api/v1/approvals` → e-mail |

A chave de API não aprova nada: aprovar é sempre uma pessoa no painel. Os JSON são gerados por `node n8n/build-workflows.mjs`.
