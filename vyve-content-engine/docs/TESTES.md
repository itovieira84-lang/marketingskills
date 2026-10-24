# Testes e resultados

Todos os testes usam um banco próprio (`vyve_test`, recriado a cada rodada), dados marcados como fictícios e nenhuma publicação real. A única "API externa" exercitada é a Graph API do Instagram, com **respostas simuladas** dentro do teste.

```bash
npm test                     # tudo, menos o lote de 30
VYVE_TEST_FULL=1 npm test    # inclui o lote completo de 30 peças
```

## Resultado (24/10/2026, Postgres 16, Node 22, Linux)

| # | Teste | Resultado |
|---|---|---|
| 1 | Equipes não enxergam dados umas das outras (RLS) | ok |
| 2 | Papel Cliente só vê o próprio cliente | ok |
| 3 | Criador não cadastra cliente (permissões) | ok |
| 4 | Login com senha e chave de API com papel sistema | ok |
| 5 | QA de texto: dados pessoais bloqueiam, promessas viram aviso, termos proibidos bloqueiam | ok |
| 6 | Pesquisa: item sem fonte é descartado; com fonte da busca é mantido | ok |
| 7 | Pesquisa: URL citada que não veio da busca nem foi verificada cai | ok |
| 8 | Mix: máximo 30, mínimo 1 | ok |
| 9 | Nova tentativa com espera exponencial e teto | ok |
| 10 | Custo pela tabela de preços | ok |
| 11 | URL pública de mídia exige assinatura correta | ok |
| 12 | **Ponta a ponta:** pesquisa → aprovação → roteiros → produção real → revisão → aprovação → calendário → publicação bloqueada sem credenciais → análise "sem dados" | ok |
| 13 | Publicação com credenciais segue o fluxo oficial (respostas simuladas), registra quem aprovou e não publica duas vezes | ok |
| 14 | Orçamento estourado bloqueia a etapa antes de qualquer chamada paga | ok |
| 15 | Modo Claude Code: etapa vira tarefa; resposta fora do esquema é recusada | ok |
| 16 | Vídeo corrompido: novas tentativas e depois falha, nunca "pronto" | ok |
| 17 | **Lote de 30 peças** (10 Reels, 6 carrosséis, 6 cards, 6 Stories, 2 newsletters) | ok, 129 s de produção |
| 18 | ffprobe lê dimensões e duração reais | ok |
| 19 | Validação de mídia aponta dimensão errada | ok |
| 20 | Detecção de fala encontra trechos com som | ok |

No teste 17, sem vídeo do cliente, os 10 Reels terminam como **caso C, pendente de produção** (storyboard + quadros), e as 20 artes e textos ficam prontos com arquivo. Nenhuma peça aparece como "pronto" sem arquivo.

O teste 12 confere as dimensões reais dos arquivos renderizados: slides do carrossel em 1080×1350 e Stories em 1080×1920.

## Outras verificações

- `npm run typecheck`: sem erros (engine e painel).
- Painel: as 15 telas abriram com status 200 e sem erro no console (Playwright, logado como administrador).
- API do n8n testada por HTTP com chave real: sem chave → 401; briefing reenviado devolve o mesmo lote; fila, publicação em simulação, coleta de métricas (sem credencial: nada coletado) e análise (sem dados: nada estimado).
