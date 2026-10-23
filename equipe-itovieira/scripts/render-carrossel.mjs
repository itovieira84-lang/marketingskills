#!/usr/bin/env node
// Renderiza um carrossel do @itovieira em PNG 1080x1350.
// Uso: node equipe-itovieira/scripts/render-carrossel.mjs <slides.json> [pasta-de-saida]
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(process.execPath, '../../lib/node_modules/playwright')));
}

const [entrada, saidaArg] = process.argv.slice(2);
if (!entrada) {
  console.error('Uso: node render-carrossel.mjs <slides.json> [pasta-de-saida]');
  process.exit(1);
}

const dados = JSON.parse(await readFile(entrada, 'utf8'));
const base = path.dirname(path.resolve(entrada));
// Fotos com caminho relativo são resolvidas a partir da raiz do repositório.
const raiz = path.resolve(fileURLToPath(import.meta.url), '../../..');
for (const s of dados.slides) {
  if (s.foto && !/^(https?|file|data):/.test(s.foto)) s.foto = pathToFileURL(path.resolve(raiz, s.foto)).href;
}

const saida = path.resolve(saidaArg || base);
await mkdir(saida, { recursive: true });

const modelo = pathToFileURL(path.resolve(fileURLToPath(import.meta.url), '../../modelos/carrossel.html')).href;
const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto(modelo, { waitUntil: 'networkidle' }).catch(() => page.goto(modelo));
await page.evaluate((d) => window.renderCarrossel(d), dados);
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState('networkidle').catch(() => {});

const slides = await page.$$('.slide');
for (const [i, el] of slides.entries()) {
  const arquivo = path.join(saida, String(i + 1).padStart(2, '0') + '.png');
  await el.screenshot({ path: arquivo });
  console.log(arquivo);
}
await browser.close();
