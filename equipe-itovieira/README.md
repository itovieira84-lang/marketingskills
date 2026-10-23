# Equipe de marketing do @itovieira

Agentes que cuidam do Instagram do Ítalo Vieira. Meta: **1 carrossel + 1 vídeo por dia**, 90% no posicionamento novo e 10% fé e família.

Arquitetura aprovada a partir do doc "Equipe de marketing do @itovieira — arquitetura"
(https://claude.ai/artifact/21TUPUcrzSTkcRHK4WM2v7).

## Arquivos

| Caminho | O que é |
|---|---|
| `marca.md` | Posicionamento, voz, estética e pilares. Fonte única para todos os agentes |
| `calendario.md` | Mix semanal e regras de rodízio de pilares |
| `agentes/*/SKILL.md` | Uma skill por agente |
| `modelos/carrossel.html` | Modelo do carrossel no padrão visual |
| `scripts/render-carrossel.mjs` | Renderiza o carrossel em PNG 1080×1350 |
| `entrada/` | Fotos (`fotos/`) e vídeos brutos (`videos/`) do dia a dia |
| `pacotes/AAAA-MM-DD/` | Saída de cada dia (pautas, brief, slides, vídeo, legendas, status) |

## Os agentes

| Agente | Skill | Lê | Escreve em `pacotes/<dia>/` |
|---|---|---|---|
| Diretor | `agentes/diretor` | calendário, histórico, métricas | `status.md` |
| Pesquisa | `agentes/pesquisa` | marca, métricas, comentários | `pautas.md` |
| Copy e planejamento | `agentes/copy` | pautas, marca | `brief.md` |
| Designer | `agentes/designer` | brief, marca, fotos | `carrossel/*.png` |
| Vídeo | `agentes/video` | brief, vídeo bruto ou fotos+voz | `video/` |
| Revisor de marca | `agentes/revisor` | tudo acima | `revisao.md` |
| Social media | `agentes/social-media` | pacote aprovado | `publicacao.md`, `metricas.md` |
| Atendimento | `agentes/atendimento` | comentários e directs | `atendimento-HHh.md` |

## Fluxo do dia (Brasília)

1. **19h da véspera:** Diretor → Pesquisa → Copy → Designer + Vídeo → Revisor. Pacote pronto.
2. **Até 22h:** o italo aprova, ajusta ou troca a pauta (um card só).
3. **Dia:** Social media agenda o carrossel ~12h e o reel ~19h (ou o melhor horário medido).
4. **9h, 14h, 21h:** Atendimento faz a ronda e manda o lote de respostas.
5. **8h diário / segunda:** Social media manda métricas de 48h e o relatório semanal.

## Modo de aprovação

**Escolha do italo em 23/10/2026: `APROVACAO=auto`.** Posts e respostas saem sem esperar o ok dele.
O pacote do dia é publicado no horário mesmo sem resposta; o italo recebe o pacote às 19h (pode vetar ou trocar até o horário de publicação) e um resumo diário do que saiu.

Rede de segurança (ativa por padrão, o italo pode desligar): estes casos **não** são respondidos sozinhos, vão para ele:
- direct ou comentário com proposta, preço, parceria ou contratação (vira lead);
- crítica pesada, ataque, polêmica política ou religiosa;
- qualquer coisa sobre as filhas ou a esposa além de um elogio simples;
- imprensa, assunto jurídico ou de saúde.

Outros modos possíveis, se ele pedir: `APROVACAO=total` (nada sai sem ok) e `APROVACAO=parcial` (posts com ok, respostas simples automáticas).

## Conexões necessárias

| Para | Ferramenta | Estado (23/10/2026) |
|---|---|---|
| Agendar/publicar carrossel e reel, métricas | Metricool (conta profissional do IG) | Conta existe, Instagram **não conectado** |
| Alternativa para reel + insights | vidIQ | Instagram **não conectado** |
| Comentários e directs | Navegador logado do italo (Claude in Chrome) | Depende do computador ligado |
| Voz dele | VoiceStudio local | Falta amostra de áudio |
| Imagem dele em outro cenário, lip sync | Open-Higgsfield-AI (Muapi.ai) | Falta chave Muapi |

## Referências fixas do Ítalo

Rosto, voz e gestos padrão ficam na pasta compartilhada do projeto `/mnt/project-files/italo-referencias/`
(no PC do italo: `V:\cloudecode\italo-referencias`):

- `rosto/` — fotos de rosto; principal: `rosto-estudio-fundo-escuro.png`.
- `video/` — vídeo de movimentos e gestos (só no PC, 147 MB).
- `voz/` — trecho limpo de 15 s + transcrição para clonagem; perfil de voz "Ítalo Vieira" no VoiceStudio.
- `README.md` — descrição do rosto e dos gestos para usar em prompts.
