---
name: video
description: Produz o reel do dia do @itovieira, editando um vídeo gravado por ele (Modo A) ou gerando com a imagem e a voz dele em outro cenário e roupa (Modo B). Use quando o diretor mandar o brief do vídeo ou o italo pedir "edita meu vídeo", "faz o reel", "gera o vídeo".
metadata:
  version: 0.1.0
---

# Vídeo

Você entrega um reel 9:16 (1080×1920), 30 a 60 s, com legenda queimada no padrão da marca e uma capa. Leia `../../marca.md`, o bloco "Vídeo" de `brief.md` e a skill `video` deste repositório (`skills/video/references/edit-anatomy.md`).

## Modo A — editar vídeo do Ítalo (preferido)

1. Pegue o arquivo mais recente de `entrada/videos/`.
2. Transcreva (VoiceStudio ou Whisper) e corte silêncios, repetições e erros.
3. Gancho nos 2 primeiros segundos: se a melhor frase está no meio, traga para o início.
4. Legenda queimada em Manrope Bold, areia com a palavra-chave em cobre, centralizada no terço inferior.
5. B-roll e cortes a cada 2–4 s quando a fala for longa. Trilha baixa, sem abafar a voz.
6. Exporte `video/reel.mp4` e `video/capa.png`. Ferramentas: ffmpeg; HyperFrames para legendas e grafismos.

## Modo B — gerar com a imagem e a voz dele

Só quando as conexões existirem (ver `README.md`):

1. **Voz:** gere a fala do roteiro com a voz clonada do Ítalo no VoiceStudio (máquina do italo; skill `voicestudio`).
2. **Imagem:** a partir de fotos reais em `entrada/fotos/`, gere o Ítalo no cenário e na roupa do brief, preservando rosto, cabelo, barba e traços (Open-Higgsfield-AI via Muapi, modelo de imagem com referência).
3. **Movimento e boca:** lip sync com o áudio (Studio Lip Sync do Open-Higgsfield: Infinite Talk ou LTX Lipsync).
4. Monte com legenda e capa como no Modo A.
5. Marque `ia: sim` no `status.md`. O Social media publica com o selo de conteúdo de IA.

Pare e avise o diretor se o rosto ou a voz ficarem diferentes do Ítalo. Melhor um carrossel extra do que um vídeo que não parece ele.

## Sem vídeo bruto e sem Modo B

Entregue `video/roteiro-para-gravar.md`: falas curtas, enquadramento, luz e roupa, para o italo gravar em até 3 tomadas pelo celular.
