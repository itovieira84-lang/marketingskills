import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { checkText, forbiddenTerms } from "../packages/engine/src/qa";
import { verifyResearch } from "../packages/engine/src/sources";
import { backoffMs } from "../packages/engine/src/llm/ratelimit";
import { estimateUsd } from "../packages/engine/src/llm/pricing";
import { Mix, ResearchOutput, publicMediaSig, verifyPublicMediaSig } from "../packages/engine/src/index";

test("QA de texto: dados pessoais bloqueiam, promessas viram aviso, termos proibidos bloqueiam", () => {
  const r = checkText("Resultado garantido! Fale no 11 98888-7777 ou fulano@exemplo.com");
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => w.includes("garantia")));
  assert.ok(r.blocking.some((b) => b.includes("Telefone")));
  assert.ok(r.blocking.some((b) => b.includes("E-mail")));
  const terms = forbiddenTerms("Tom leve\nnão usar: coach\nnão usar: hack");
  assert.deepEqual(terms, ["coach", "hack"]);
  assert.equal(checkText("Sou coach de vida", { forbidden: terms }).ok, false);
});

const emptyResearch = (): ResearchOutput => ({
  theme: "t", segment: "s", executive_summary: "r", trends: [], audience_questions: [], competitors: [], opportunities: [], faqs_objections: [],
  approaches: [], keywords: [], conversion_opportunities: [], facts: [], opinions: [], hypotheses: [], recommendations: [], sources: [], limitations: [],
});

test("pesquisa: item sem fonte é descartado; item com fonte vinda da busca é mantido", async () => {
  const r = emptyResearch();
  r.trends = [
    { title: "Com fonte", summary: "x", evidence_type: "fato", confidence: "media", source_urls: ["https://fonte.exemplo/a"] },
    { title: "Inventada", summary: "y", evidence_type: "fato", confidence: "alta", source_urls: [] },
  ];
  r.sources = [{ url: "https://fonte.exemplo/a", title: "A", publisher: "P", published_at: "" }];
  const v = await verifyResearch(r, [{ url: "https://fonte.exemplo/a", title: "A" }], { checkHttp: false, fictitious: false });
  assert.deepEqual(v.research.trends.map((t) => t.title), ["Com fonte"]);
  assert.equal(v.dropped.length, 1);
  assert.match(v.dropped[0].reason, /sem fonte/);
});

test("pesquisa: URL citada que não veio da busca e não foi verificada também cai", async () => {
  const r = emptyResearch();
  r.facts = [{ claim: "Dado X", source_urls: ["https://nao-veio-da-busca.exemplo/x"] }];
  const v = await verifyResearch(r, [], { checkHttp: false, fictitious: false });
  assert.equal(v.research.facts.length, 0);
  assert.equal(v.dropped.length, 1);
});

test("mix: no máximo 30 peças e pelo menos 1", () => {
  assert.equal(Mix.safeParse({ reel: 10, carousel: 6, card: 6, story_sequence: 6, newsletter: 2 }).success, true);
  assert.equal(Mix.safeParse({ reel: 31 }).success, false);
  assert.equal(Mix.safeParse({ reel: 20, card: 11 }).success, false);
  assert.equal(Mix.safeParse({}).success, false);
});

test("nova tentativa com espera exponencial e teto", () => {
  assert.ok(backoffMs(2, 1000) > backoffMs(1, 1000));
  assert.ok(backoffMs(30, 1000, 60_000) <= 60_000);
});

test("custo estimado pela tabela de preços", () => {
  const usd = estimateUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000, web_searches: 10 });
  assert.ok(Math.abs(usd - (4 + 2 + 0.1)) < 1e-6, `obtido ${usd}`);
});

test("URL pública de mídia exige assinatura correta", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(verifyPublicMediaSig(id, publicMediaSig(id)), true);
  assert.equal(verifyPublicMediaSig(id, "0".repeat(32)), false);
  assert.equal(verifyPublicMediaSig(id, null), false);
});
