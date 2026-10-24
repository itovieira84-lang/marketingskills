# Limitações, custos e próximos passos

## Limitações conhecidas

- **Publicação real nunca executada.** O caminho até a Graph API está implementado e testado com respostas simuladas; o primeiro envio real deve ser acompanhado.
- **Pesquisa em perfis do Instagram** (concorrentes, comentários) não é feita: exige acesso logado. O agente registra isso em "limitações" em vez de inventar.
- **Escolha do trecho do vídeo (caso A)** é automática: detecta fala por silêncio e divide falas contínuas em blocos do tamanho pedido. Pode cortar no meio de uma frase; o roteirista não escolhe o trecho exato ainda.
- **Legendas** dependem da transcrição local; sem ela, o Reels sai sem legenda e o motivo fica na peça.
- **Caso B** usa narração enviada pelo cliente; o sistema não gera narração sintética.
- **Briefing por arquivo** aceita `.txt` e `.md` (PDF e DOCX ainda não).
- **Arquivos em disco local.** Para várias máquinas ou serverless, é preciso um adaptador de storage.
- **Fixture** gera títulos repetidos; serve só para testar o fluxo.
- **Painel** sem atualização em tempo real (atualize a página ou use "Processar fila").

## Custos estimados (modo Anthropic)

Tabela usada pelo sistema (`llm/pricing.ts`), por milhão de tokens: Opus 5.5 US$ 4 entrada / US$ 20 saída; Sonnet 5.5 US$ 2 / US$ 10; Haiku 5.5 US$ 0,10 / US$ 0,50; busca na web US$ 10 por 1.000 buscas.

Ordem de grandeza de um lote de 30 peças, **estimada, não medida** (nenhum lote real rodou na API):

| Etapa | Chamadas | Estimativa (Opus 5.5) |
|---|---|---|
| Pesquisa | 1 com até 8 buscas | ~US$ 0,20 a 0,50 |
| Roteiros | 5 (um por formato) | ~US$ 1,00 a 2,50 |
| Total por lote | | **~US$ 1,50 a 3,00** |

Render, transcrição e FFmpeg rodam na sua máquina (sem custo de API). O teto por lote (padrão US$ 5) e o orçamento mensal da equipe bloqueiam a etapa antes de chamar a API. Os custos reais ficam em **Custos e logs**.

No modo Claude Code o custo é a assinatura; não há cobrança por chamada no sistema.

## Próximos passos sugeridos

1. Criar a chave da Anthropic e rodar um lote real pequeno para medir custo.
2. Publicar o painel com HTTPS (Vercel + Supabase, ou um servidor com disco) e definir `VYVE_PUBLIC_BASE_URL`.
3. Criar o app da Meta e pedir as permissões de publicação e insights.
4. Importar os workflows no n8n e ligar o 04 (avisos) primeiro.
5. Deixar o roteiro escolher o trecho do vídeo (campo de início/fim) usando a transcrição completa.
6. Adaptador de Supabase Storage e leitura de briefing em PDF/DOCX.
