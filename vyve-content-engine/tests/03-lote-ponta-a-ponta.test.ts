import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { newTeam, settle, FIXTURES } from "./helpers";
import {
  closePool, createClient, createBriefing, startBatch, getBatch, decideResearch, decideScripts, decidePiece, planCalendar, publishDue,
  analyzePerformance, uploadAsset, setIntegration, withCtx, many, one, absolutePath,
} from "../packages/engine/src/index";
import { probe } from "../packages/engine/src/media/ffmpeg";

after(() => closePool());

test("lote fictício: pesquisa → aprovação → roteiros → produção real → revisão → aprovação → calendário → publicação bloqueada → análise sem dados", { timeout: 15 * 60_000 }, async () => {
  const ctx = await newTeam("E2E");
  const client = await createClient(ctx, { name: "Cliente E2E (fictício)" });
  await uploadAsset(ctx, { clientId: client.id, kind: "logo", fileName: "logo.png", srcPath: path.join(FIXTURES, "logo-teste.png"), label: "logo", rightsStatus: "own" });
  const b = await createBriefing(ctx, { clientId: client.id, title: "Lote E2E", theme: "rotina de estudos", mix: { reel: 1, carousel: 1, card: 1, story_sequence: 1, newsletter: 1 } });
  const { batch, created } = await startBatch(ctx, { briefingId: b.id, mode: "fixture" });
  assert.equal(created, true);
  assert.equal((await startBatch(ctx, { briefingId: b.id, mode: "fixture" })).created, false, "mesmo briefing+mix+modo não cria lote duplicado");

  await settle();
  let d = (await getBatch(ctx, batch.id))!;
  assert.equal(d.batch.status, "awaiting_approval", "para na aprovação da pesquisa");
  assert.equal(d.research.is_fictitious, true);
  assert.ok(d.research.dropped_claims.length >= 1, "tendência sem fonte foi descartada");
  assert.equal(d.pieces.length, 0, "nenhum roteiro antes da pesquisa aprovada");

  await decideResearch(ctx, d.research.id, "aprovado");
  await settle();
  d = (await getBatch(ctx, batch.id))!;
  assert.equal(d.pieces.length, 5);
  assert.ok(d.pieces.every((p: any) => p.production_status === "aguardando"), "produção só depois dos roteiros aprovados");

  await decideScripts(ctx, d.pieces.map((p: any) => p.script_id), "aprovado");
  await settle();
  d = (await getBatch(ctx, batch.id))!;

  const reel = d.pieces.find((p: any) => p.format === "reel");
  assert.equal(reel.production_mode, "C", "sem vídeo original: caso C");
  assert.equal(reel.production_status, "pendente_producao", "nunca 'pronto' sem material");
  assert.ok(reel.pending_reasons.some((r: string) => r.startsWith("PENDENTE DE PRODUÇÃO")));

  const carousel = d.pieces.find((p: any) => p.format === "carousel");
  assert.equal(carousel.production_status, "pronto");
  const slides = await withCtx(ctx, (tx) => many(tx, "select * from vyve.media_assets where id = any($1::uuid[]) and mime = 'image/png'", [carousel.output_asset_ids]));
  assert.ok(slides.length >= 3, "carrossel renderizado");
  for (const s of slides) {
    const pr = await probe(absolutePath(s.storage_path));
    assert.deepEqual([pr.width, pr.height], [1080, 1350], `slide ${s.label} em 1080x1350`);
  }
  const story = d.pieces.find((p: any) => p.format === "story_sequence");
  const frames = await withCtx(ctx, (tx) => many(tx, "select * from vyve.media_assets where id = any($1::uuid[]) and mime = 'image/png'", [story.output_asset_ids]));
  assert.ok(frames.every((f: any) => f.width === 1080 && f.height === 1920), "stories em 1080x1920");
  const news = d.pieces.find((p: any) => p.format === "newsletter");
  assert.ok(news.body.length > 50, "newsletter com texto final");

  const ready = d.pieces.filter((p: any) => p.production_status === "pronto");
  assert.ok(ready.every((p: any) => p.approval === "pendente" && p.stage === "APROVACAO"));
  assert.equal(reel.approval, "nao_solicitada", "peça pendente não vai para aprovação");

  // Calendário só aceita peças aprovadas por uma pessoa.
  assert.equal((await planCalendar(ctx, client.id)).scheduled.length, 0);
  await decidePiece(ctx, carousel.id, "aprovado");
  await decidePiece(ctx, story.id, "alteracao_solicitada", "Trocar o gancho");
  const plan = await planCalendar(ctx, client.id);
  assert.equal(plan.scheduled.length, 1);

  // Publicação: sem credenciais do Instagram, fica bloqueada com o motivo.
  const future = new Date(Date.now() + 120 * 86400000);
  const out = await publishDue(ctx, { now: future, requestedBy: ctx.userId });
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "bloqueado");
  assert.match(out[0].reason!, /credenciais/);
  const pubs = await withCtx(ctx, (tx) => many(tx, "select * from vyve.publications where client_id = $1", [client.id]));
  assert.ok(pubs.every((p: any) => p.status === "bloqueado"));

  const report = await analyzePerformance(ctx, client.id, { start: "2026-01-01", end: "2026-12-31" });
  assert.equal(report.hasData, false);
  assert.equal(report.byFormat.length, 0, "sem métricas, nenhum número");
});

test("publicação com credenciais usa o fluxo oficial da Graph API (fetch simulado no teste) e não repete", { timeout: 15 * 60_000 }, async () => {
  const ctx = await newTeam("PUB");
  const client = await createClient(ctx, { name: "Cliente PUB (fictício)", requireResearchApproval: false, requireScriptApproval: false });
  const b = await createBriefing(ctx, { clientId: client.id, title: "Lote PUB", theme: "café", mix: { card: 1 } });
  const { batch } = await startBatch(ctx, { briefingId: b.id, mode: "fixture" });
  await settle();
  const d = (await getBatch(ctx, batch.id))!;
  const card = d.pieces[0];
  assert.equal(card.production_status, "pronto");
  await decidePiece(ctx, card.id, "aprovado");
  await planCalendar(ctx, client.id);

  process.env.IG_TOKEN_TESTE = "token-ficticio";
  process.env.VYVE_PUBLIC_BASE_URL = "https://painel.exemplo";
  await setIntegration(ctx, { clientId: client.id, provider: "instagram", secretEnv: "IG_TOKEN_TESTE", config: { ig_user_id: "1784000000" } });
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init: any) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    const body = url.includes("media_publish") ? { id: "IG_MEDIA_123" } : (init?.method ?? "GET") === "GET" ? { status_code: "FINISHED" } : { id: "CONTAINER_1" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const future = new Date(Date.now() + 120 * 86400000);
    const dry = await publishDue(ctx, { now: future, dryRun: true, fetchImpl: fakeFetch });
    assert.equal(dry[0].status, "bloqueado");
    assert.equal(calls.length, 0, "simulação não chama a API");
    const out = await publishDue(ctx, { now: future, fetchImpl: fakeFetch });
    assert.deepEqual(out.map((o) => o.status), ["publicado"]);
    assert.equal(out[0].external_id, "IG_MEDIA_123");
    assert.ok(calls.some((c) => c.endsWith("/1784000000/media")) && calls.some((c) => c.endsWith("/media_publish")));
    const pub = await withCtx(ctx, (tx) => one(tx, "select * from vyve.publications where piece_id = $1", [card.id]));
    assert.equal(pub.status, "publicado");
    assert.ok(pub.approved_by, "registra quem aprovou");
    assert.equal((await publishDue(ctx, { now: future, fetchImpl: fakeFetch })).length, 0, "não publica duas vezes");
  } finally {
    delete process.env.IG_TOKEN_TESTE;
    delete process.env.VYVE_PUBLIC_BASE_URL;
  }
});

test("orçamento estourado bloqueia a etapa antes de qualquer chamada paga", async () => {
  const ctx = await newTeam("BUDGET");
  const client = await createClient(ctx, { name: "Cliente orçamento" });
  const b = await createBriefing(ctx, { clientId: client.id, title: "Lote caro", theme: "x", mix: { card: 1 } });
  process.env.ANTHROPIC_API_KEY = "sk-ant-teste-nao-usada";
  try {
    const { batch } = await startBatch(ctx, { briefingId: b.id, mode: "anthropic", budgetUsd: 0.0001 });
    await settle(2);
    const d = (await getBatch(ctx, batch.id))!;
    assert.equal(d.batch.status, "blocked");
    const r = d.runs.find((x: any) => x.step === "pesquisa");
    assert.equal(r.status, "blocked");
    assert.match(r.error, /Orçamento do lote/);
    assert.equal(d.costs.length, 0);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("modo Claude Code: etapa vira tarefa; resposta fora do esquema é recusada", async () => {
  const { listExternalTasks, externalTask, submitExternal } = await import("../packages/engine/src/index");
  const ctx = await newTeam("CC");
  const client = await createClient(ctx, { name: "Cliente CC" });
  const b = await createBriefing(ctx, { clientId: client.id, title: "Lote CC", theme: "jardinagem", mix: { card: 1 } });
  const { batch } = await startBatch(ctx, { briefingId: b.id, mode: "claude-code" });
  await settle(2);
  const tasks = (await listExternalTasks(ctx)).filter((t: any) => t.batch_id === batch.id);
  assert.deepEqual(tasks.map((t: any) => t.step), ["pesquisa"]);
  const t = await externalTask(ctx, tasks[0].id);
  assert.equal(t.schemaName, "research");
  assert.ok(t.jsonSchema && t.prompt.includes("jardinagem"));
  await assert.rejects(submitExternal(ctx, tasks[0].id, { theme: "faltando campos" }), /fora do esquema/);
  const empty = { theme: "jardinagem", segment: "s", executive_summary: "Sem dados verificáveis.", trends: [], audience_questions: [], competitors: [], opportunities: [], faqs_objections: [], approaches: [], keywords: [], conversion_opportunities: [], facts: [], opinions: [], hypotheses: [], recommendations: [], sources: [], limitations: ["teste"] };
  await submitExternal(ctx, tasks[0].id, empty);
  const d = (await getBatch(ctx, batch.id))!;
  assert.equal(d.research.provider, "claude-code");
  assert.equal(d.research.is_fictitious, false);
});

test("arquivo de vídeo corrompido: novas tentativas e depois falha, nunca 'pronto'", { timeout: 10 * 60_000 }, async () => {
  const ctx = await newTeam("RETRY");
  const client = await createClient(ctx, { name: "Cliente retry", requireResearchApproval: false, requireScriptApproval: false });
  const bad = path.join(FIXTURES, "..", "..", "storage-tmp-corrompido.mp4");
  fs.writeFileSync(bad, "isto não é um vídeo");
  try {
    await uploadAsset(ctx, { clientId: client.id, kind: "video", fileName: "gravacao.mp4", srcPath: bad, label: "gravação", rightsStatus: "own" });
  } finally { fs.rmSync(bad, { force: true }); }
  const b = await createBriefing(ctx, { clientId: client.id, title: "Lote retry", theme: "x", mix: { reel: 1 } });
  const { batch } = await startBatch(ctx, { briefingId: b.id, mode: "fixture" });
  await settle(10);
  const d = (await getBatch(ctx, batch.id))!;
  const piece = d.pieces[0];
  assert.notEqual(piece.production_status, "pronto");
  const run = d.runs.find((r: any) => r.step.startsWith("producao"));
  assert.ok(["failed", "succeeded"].includes(run.status));
  if (run.status === "failed") assert.equal(run.attempt, run.max_attempts, "esgotou as tentativas");
});
