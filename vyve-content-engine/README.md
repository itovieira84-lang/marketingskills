# VYVE Content Engine

Sistema multiagente de produção de conteúdo para agência. Um briefing vira até 30 peças (Reels, carrosséis, cards, Stories, newsletters), passando por pesquisa com fontes verificadas, roteiro, produção real (Remotion + FFmpeg), revisão automática, aprovação humana, calendário, publicação oficial e análise de métricas reais.

- **Arquitetura:** [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- **O que falta configurar (credenciais):** [docs/INTEGRACOES-PENDENTES.md](docs/INTEGRACOES-PENDENTES.md)
- **Limitações, custos e próximos passos:** [docs/LIMITACOES-E-CUSTOS.md](docs/LIMITACOES-E-CUSTOS.md)
- **Testes e resultados:** [docs/TESTES.md](docs/TESTES.md)

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `packages/engine` | Orquestrador, 6 agentes, fila, banco, regras de segurança, CLI `vyve` |
| `packages/video` | Composições Remotion (artes estáticas, Reels editado, Reels por cenas) |
| `apps/web` | Painel Next.js (15 telas, login, papéis) e API `/api/v1` para o n8n |
| `supabase/migrations` | Esquema Postgres com RLS (compatível com Supabase) |
| `n8n/workflows` | 4 workflows importáveis |
| `.claude/agents` | Orquestrador + 6 subagentes do Claude Code |
| `.claude/skills` | Skills internas (`vyve-*`) e as instaladas (frontend-design, skill-creator, remotion) |
| `tests` | Testes com dados fictícios, sem publicação real |

## Instalação

Requisitos: Node 22+, Postgres 15+ (local ou Supabase), FFmpeg, Git. Opcional: Python 3.10+ para transcrição local.

### Windows

1. Instale [Node.js LTS](https://nodejs.org), [Git](https://git-scm.com) e o FFmpeg (`winget install Gyan.FFmpeg`). Feche e abra o terminal.
2. Banco: crie um projeto no Supabase **ou** instale o [PostgreSQL](https://www.postgresql.org/download/windows/).
3. No PowerShell, dentro da pasta do projeto:
   ```powershell
   npm install
   copy .env.example .env   # edite DATABASE_URL, DATABASE_ADMIN_URL e VYVE_SESSION_SECRET
   ```
4. Crie o papel de login sem privilégios (no SQL Editor do Supabase ou no `psql`):
   ```sql
   create role vyve_login login password 'uma-senha-forte';
   ```
5. Rode as migrações e libere o papel:
   ```powershell
   npm run db:migrate
   ```
   ```sql
   grant vyve_app to vyve_login;
   ```
6. Crie a agência e o primeiro usuário (só funciona com o banco vazio):
   ```powershell
   npm run vyve -- bootstrap --team "Sua Agência" --email voce@agencia.com --name "Seu Nome" --password "senha-forte"
   ```
7. Suba o painel e o worker (dois terminais):
   ```powershell
   npm run web      # http://localhost:3100
   npm run worker   # processa a fila dos agentes
   ```

macOS/Linux: os mesmos passos; `scripts/reset-dev-db.sh` cria um banco local completo (apaga o que existir).

### Transcrição local (opcional)

```bash
python -m venv .venv && .venv/bin/pip install faster-whisper "av<16"
# no .env:
VYVE_TRANSCRIBER=faster-whisper
VYVE_PYTHON=.venv/bin/python
```

Sem isso, os Reels saem sem legenda sincronizada e o motivo fica registrado na peça.

## Como operar

1. **Clientes → Cadastrar.** Defina frequência, se pesquisa e roteiros exigem aprovação, e o orçamento de IA por lote.
2. **Cliente → Biblioteca de marca.** Envie logo, cores, fontes, tom e restrições (`não usar: termo` vira bloqueio automático).
3. **Cliente → Consentimentos.** Registre autorização de imagem/voz com a evidência. Materiais com pessoa só entram com consentimento ativo.
4. **Cliente → Materiais.** Envie vídeos, fotos e áudios com o direito de uso. "Desconhecido" ou "restrito" ficam fora da produção.
5. **Briefings → Novo briefing.** Escolha o mix (até 30) e o modo de IA:
   - **Anthropic API**: o worker roda tudo sozinho (exige `ANTHROPIC_API_KEY`).
   - **Claude Code**: cada etapa de IA vira uma tarefa; no terminal, peça ao Claude Code "responda as tarefas pendentes do VYVE".
   - **Teste**: dados fictícios marcados como tal.
6. **Lote.** Acompanhe a régua de etapas, aprove a pesquisa e os roteiros quando o cliente exigir.
7. **Aprovações.** Aprove, peça alteração ou rejeite cada peça. Só peças aprovadas por uma pessoa seguem.
8. **Calendário → Distribuir.** Espalha as aprovadas pela frequência do cliente, respeitando bloqueios.
9. **Publicações.** Comece em simulação. O envio real exige aprovação humana, token oficial do Instagram, `ig_user_id` e `VYVE_PUBLIC_BASE_URL`.
10. **Análise.** Colete pela API ou importe CSV. Sem dados, o relatório diz "sem métricas" e não estima nada.

### CLI

```bash
npm run vyve -- help
npm run vyve -- task list            # tarefas para os subagentes do Claude Code
npm run vyve -- status --batch <id>
npm run vyve -- publish-due --dry-run
```

### n8n

Importe `n8n/workflows/*.json`, edite o nó **Config** (`base_url`) e crie a credencial *Header Auth* com `Authorization: Bearer <chave>` (gerada em **Configurações → Chaves de API**). Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#n8n).

## Testes

```bash
npm test                      # recria o banco vyve_test e roda tudo (~3 min)
VYVE_TEST_FULL=1 npm test     # inclui o lote completo de 30 peças (~2 min a mais)
npm run typecheck
```
