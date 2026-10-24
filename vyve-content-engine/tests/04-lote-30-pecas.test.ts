import { test, after } from "node:test";
import assert from "node:assert/strict";
import { newTeam, settle } from "./helpers";
import { closePool, createClient, createBriefing, startBatch, getBatch, decideResearch, decideScripts, DEFAULT_MIX } from "../packages/engine/src/index";

after(() => closePool());

// Lote completo do prompt mestre (10 Reels, 6 carrosséis, 6 cards, 6 Stories, 2 newsletters).
// Renderiza tudo de verdade (vários minutos): rode com VYVE_TEST_FULL=1.
test("um briefing vira 30 peças com status honestos", { skip: !process.env.VYVE_TEST_FULL, timeout: 60 * 60_000 }, async () => {
  const ctx = await newTeam("30");
  const client = await createClient(ctx, { name: "Cliente 30 peças (fictício)" });
  const b = await createBriefing(ctx, { clientId: client.id, title: "Lote 30", theme: "finanças pessoais para autônomos", mix: DEFAULT_MIX });
  const { batch } = await startBatch(ctx, { briefingId: b.id, mode: "fixture" });
  await settle();
  let d = (await getBatch(ctx, batch.id))!;
  await decideResearch(ctx, d.research.id, "aprovado");
  await settle();
  d = (await getBatch(ctx, batch.id))!;
  assert.equal(d.pieces.length, 30);
  await decideScripts(ctx, d.pieces.map((p: any) => p.script_id), "aprovado");
  const t0 = Date.now();
  await settle(10);
  d = (await getBatch(ctx, batch.id))!;
  const by = (f: string) => d.pieces.filter((p: any) => p.format === f);
  assert.equal(by("reel").length, 10);
  assert.ok(by("reel").every((p: any) => p.production_mode === "C" && p.production_status === "pendente_producao"), "sem vídeo: 10 Reels pendentes, nenhum 'pronto'");
  for (const f of ["carousel", "card", "story_sequence", "newsletter"]) assert.ok(by(f).every((p: any) => p.production_status === "pronto"), `${f} pronto`);
  assert.ok(d.pieces.filter((p: any) => p.production_status === "pronto").every((p: any) => p.output_asset_ids.length > 0), "todo 'pronto' tem arquivo");
  assert.equal(new Set(d.pieces.map((p: any) => p.title)).size >= 20, true, "títulos variados");
  console.log(`# produção de 30 peças: ${((Date.now() - t0) / 1000).toFixed(0)} s; status do lote: ${d.batch.status}`);
});
