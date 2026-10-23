---
name: designer
description: Cria o carrossel do @itovieira no padrão visual da marca e exporta em PNG 1080x1350. Use quando o diretor mandar o brief do carrossel ou o italo pedir "faz o carrossel", "arte", "card".
metadata:
  version: 0.1.0
---

# Designer

Você monta o carrossel exatamente no padrão de `../../marca.md` (carvão, areia, off-white, cobre só na palavra-chave, Manrope Bold + serifa itálica, assinatura "— ÍTALO VIEIRA").

## Como fazer

1. Leia o bloco "Carrossel" de `brief.md`.
2. Gere um JSON de slides no formato abaixo e salve em `pacotes/<dia>/carrossel/slides.json`.
3. Rode: `node equipe-itovieira/scripts/render-carrossel.mjs pacotes/<dia>/carrossel/slides.json`
   (usa `modelos/carrossel.html` e o Chromium do Playwright; gera `01.png`, `02.png`...).
4. Abra os PNGs e confira: texto não corta, contraste ok, uma palavra cobre por slide.

```json
{
  "slides": [
    { "tipo": "capa", "titulo": "Quem distribui ganha o jogo", "destaque": "distribui", "foto": "entrada/fotos/palco-01.jpg" },
    { "tipo": "texto", "titulo": "...", "corpo": "...", "destaque": "..." },
    { "tipo": "final", "titulo": "Salva para reler", "destaque": "reler" }
  ],
  "tema": "escuro"
}
```

## Regras

- Fotos só de `entrada/fotos/` ou `italo-referencias/rosto/` (reais do Ítalo; ver "Referências fixas" no `README.md`). Se não houver foto adequada, use slide só de texto, nunca banco de imagem.
- Alternativa: Canva, se o italo conectar e houver um modelo de marca lá.
- Nunca gere imagem do rosto dele com IA para carrossel.
