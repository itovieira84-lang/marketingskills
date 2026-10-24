import os from "node:os";
import { z } from "zod";
import { withCtx, anonQuery, one, many, maybe, type Ctx, type Tx } from "./db";
import { assertCan, sha256 } from "./auth";
import { config, type LlmMode } from "./config";
import { BriefingInput, FORMATS, FORMAT_LABEL, ResearchOutput, StrategyOutput, type Format, type Mix } from "./schemas";
import { providerFor, AwaitingExternalError, BudgetExceededError, preflightUsd, type LlmResult, type LlmTask } from "./llm";
import { backoffMs } from "./llm/ratelimit";
import { log } from "./logging";
import { loadBatchContext, recordHistory, type LlmStep } from "./agents/common";
import { researchStep } from "./agents/research";
import { strategyStep } from "./agents/strategy";
import { produceDesignPiece } from "./agents/design";
import { produceVideoPiece } from "./agents/audiovisual";
import { planCalendar } from "./agents/calendar";
import { loadProductionAssets } from "./agents/assets";
import { checkText, forbiddenTerms } from "./qa";

const VIDEO_FORMATS = new Set<Format>(["reel", "long_video"]);
const LLM_STEPS: Record<string, LlmStep<any>> = { pesquisa: researchStep, roteiros: strategyStep };
const SCHEMAS: Record<string, z.ZodType> = { research: ResearchOutput, strategy: StrategyOutput };
const stepKind = (step: string) => step.split(":")[0];

// ---------------------------------------------------------------- briefing e lote
export async function createBriefing(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "briefing.create");
  const input = BriefingInput.parse(raw);
  return withCtx(ctx, async (tx) => {
    const client = await maybe(tx, "select id, active from vyve.clients where id = $1", [input.clientId]);
    if (!client) throw new Error("Cliente não encontrado ou sem acesso");
    if (!client.active) throw new Error("Cliente inativo");
    return one(tx,
      `insert into vyve.briefings(team_id, client_id, title, theme, objective, body, mix, source_asset_id, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'validado',$9) returning *`,
      [ctx.teamId, input.clientId, input.title, input.theme, input.objective, input.body, JSON.stringify(input.mix), input.sourceAssetId ?? null, ctx.userId]);
  });
}

export function mixPlan(mix: Mix) {
  const plan: Array<{ format: Format; count: number; seqStart: number }> = [];
  let seq = 1;
  for (const f of FORMATS) {
    const count = mix[f] ?? 0;
    if (count > 0) { plan.push({ format: f, count, seqStart: seq }); seq += count; }
  }
  return plan;
}

/**
 * Inicia um lote. Idempotente: o mesmo briefing + mix + modo (ou a mesma chave
 * enviada pelo n8n) devolve o lote existente em vez de duplicar a execução.
 */
export async function startBatch(ctx: Ctx, opts: { briefingId: string; mode?: LlmMode; idempotencyKey?: string; budgetUsd?: number }) {
  assertCan(ctx, "batch.start");
  const mode = opts.mode ?? config.defaultLlmMode;
  if (mode === "anthropic") providerFor("anthropic"); // falha cedo se não houver chave
  return withCtx(ctx, async (tx) => {
    const briefing = await one(tx, "select * from vyve.briefings where id = $1", [opts.briefingId]);
    const client = await one(tx, "select * from vyve.clients where id = $1", [briefing.client_id]);
    const mix = briefing.mix as Mix;
    const key = opts.idempotencyKey ?? sha256(`${briefing.id}:${JSON.stringify(mix)}:${mode}`);
    const existing = await maybe(tx, "select * from vyve.batches where idempotency_key = $1", [key]);
    if (existing) return { batch: existing, created: false };

    const batch = await one(tx,
      `insert into vyve.batches(team_id, client_id, briefing_id, mix, provider, idempotency_key, budget_usd, is_fictitious, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [ctx.teamId, client.id, briefing.id, JSON.stringify(mix), mode, key, opts.budgetUsd ?? client.batch_budget_usd, mode === "fixture", ctx.userId]);
    const add = (agent: string, step: string, deps: string[], input: Record<string, unknown> = {}, maxAttempts = 3) =>
      tx.query(
        `insert into vyve.agent_runs(team_id, client_id, batch_id, agent, step, depends_on, input, idempotency_key, max_attempts)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ctx.teamId, client.id, batch.id, agent, step, deps, JSON.stringify(input), `${batch.id}:${step}`, maxAttempts]);

    await add("orquestrador", "validar", [], {}, 1);
    await add("pesquisa", "pesquisa", ["validar"]);
    await add("orquestrador", "gate_pesquisa", ["pesquisa"], {}, 1);
    const plan = mixPlan(mix);
    for (const p of plan) await add("estrategia", `roteiros:${p.format}`, ["gate_pesquisa"], p);
    await add("orquestrador", "gate_roteiros", ["roteiros:*"], {}, 1);
    for (const p of plan) {
      for (let i = 0; i < p.count; i++) {
        const seq = p.seqStart + i;
        await add(VIDEO_FORMATS.has(p.format) ? "audiovisual" : "design", `producao:${String(seq).padStart(3, "0")}`, ["gate_roteiros"], { seq, format: p.format }, 2);
      }
    }
    await add("orquestrador", "revisao", ["~producao:*"], {}, 1);
    await add("orquestrador", "gate_aprovacao", ["revisao"], {}, 1);
    await add("calendario", "calendario", ["gate_aprovacao"], {}, 2);
    await tx.query("update vyve.briefings set status = 'em_producao' where id = $1", [briefing.id]);
    await log(tx, { teamId: ctx.teamId, clientId: client.id, batchId: batch.id }, "info", "lote.criado",
      `Lote criado (${plan.map((p) => `${p.count} ${FORMAT_LABEL[p.format]}`).join(", ")}) no modo ${mode}.`);
    return { batch, created: true };
  });
}

// ---------------------------------------------------------------- execução de etapas
async function setRun(tx: Tx, runId: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await tx.query(`update vyve.agent_runs set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [runId, ...keys.map((k) => fields[k])]);
}

async function completeRun(ctx: Ctx, run: any, output: Record<string, unknown>, status: "succeeded" | "skipped" = "succeeded") {
  await withCtx(ctx, async (tx) => {
    await setRun(tx, run.id, { status, output: JSON.stringify(output), error: null, finished_at: new Date().toISOString(), locked_by: null });
    await log(tx, { teamId: run.team_id, clientId: run.client_id, batchId: run.batch_id, runId: run.id }, "info", `etapa.${status}`, `${run.step} concluída`, output);
  });
  await refreshBatch(ctx, run.batch_id);
}

async function waitRun(ctx: Ctx, run: any, status: "awaiting_approval" | "awaiting_external" | "blocked", reason: string, extra: Record<string, unknown> = {}) {
  await withCtx(ctx, async (tx) => {
    const input = { ...(run.input ?? {}), ...extra };
    await setRun(tx, run.id, { status, error: status === "blocked" ? reason : null, input: JSON.stringify(input), locked_by: null, attempt: status === "blocked" ? run.attempt : Math.max(0, run.attempt - 1) });
    await log(tx, { teamId: run.team_id, clientId: run.client_id, batchId: run.batch_id, runId: run.id }, status === "blocked" ? "error" : "info", `etapa.${status}`, `${run.step}: ${reason}`);
  });
  await refreshBatch(ctx, run.batch_id);
}

async function failRun(ctx: Ctx, run: any, err: Error) {
  const permanent = run.attempt >= run.max_attempts;
  await withCtx(ctx, async (tx) => {
    if (permanent) {
      await setRun(tx, run.id, { status: "failed", error: err.message, finished_at: new Date().toISOString(), locked_by: null });
      if (stepKind(run.step) === "producao") {
        await tx.query("update vyve.pieces set production_status = 'falhou', qa = qa || $3 where batch_id = $1 and seq = $2",
          [run.batch_id, run.input.seq, JSON.stringify({ production_error: err.message })]);
      }
    } else {
      const next = new Date(Date.now() + backoffMs(run.attempt, Number(process.env.VYVE_RETRY_BASE_MS ?? 2000))).toISOString();
      await setRun(tx, run.id, { status: "queued", error: err.message, next_attempt_at: next, locked_by: null });
    }
    await log(tx, { teamId: run.team_id, clientId: run.client_id, batchId: run.batch_id, runId: run.id }, "error",
      permanent ? "etapa.falhou" : "etapa.nova_tentativa", `${run.step} (tentativa ${run.attempt}/${run.max_attempts}): ${err.message}`);
  });
  await refreshBatch(ctx, run.batch_id);
}

async function checkBudget(ctx: Ctx, batchId: string, task: LlmTask<unknown>) {
  await withCtx(ctx, async (tx) => {
    const b = await one(tx, "select cost_usd, budget_usd from vyve.batches where id = $1", [batchId]);
    const est = preflightUsd(task.model, task.system.length + task.prompt.length, task.maxTokens ?? 16000, task.webSearch?.maxUses ?? 0);
    if (Number(b.cost_usd) + est > Number(b.budget_usd)) {
      throw new BudgetExceededError(`Orçamento do lote: gasto US$ ${Number(b.cost_usd).toFixed(4)} + estimativa US$ ${est.toFixed(4)} > limite US$ ${Number(b.budget_usd).toFixed(2)}`);
    }
    const m = await one(tx, "select coalesce(sum(usd),0) as spent from vyve.api_costs where date_trunc('month', at) = date_trunc('month', now())");
    const t = await one(tx, "select monthly_budget_usd from vyve.teams where id = $1", [ctx.teamId]);
    if (Number(m.spent) + est > Number(t.monthly_budget_usd)) throw new BudgetExceededError(`Orçamento mensal da agência atingido (US$ ${Number(t.monthly_budget_usd).toFixed(2)})`);
  });
}

async function recordUsage(ctx: Ctx, run: any, result: LlmResult<unknown>) {
  await withCtx(ctx, async (tx) => {
    let total = 0;
    for (const u of result.usage) {
      total += u.usd;
      await tx.query(
        `insert into vyve.api_costs(team_id, client_id, batch_id, agent_run_id, provider, model, input_tokens, output_tokens, cache_read_tokens, web_searches, usd)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [run.team_id, run.client_id, run.batch_id, run.id, u.provider, u.model, u.input_tokens, u.output_tokens, u.cache_read_tokens, u.web_searches, u.usd]);
    }
    await tx.query("update vyve.batches set cost_usd = cost_usd + $2 where id = $1", [run.batch_id, total]);
  });
}

async function runLlmStep(ctx: Ctx, run: any) {
  const step = LLM_STEPS[stepKind(run.step)];
  const bc = await loadBatchContext(ctx, run.id);
  const provider = providerFor(bc.batch.provider);
  const task = await step.build(bc);
  try {
    if (provider.name === "anthropic") await checkBudget(ctx, run.batch_id, task);
    const result = await provider.run(task);
    await recordUsage(ctx, run, result);
    const output = await step.finish(bc, result);
    await completeRun(ctx, run, { ...output, provider: result.provider });
  } catch (err) {
    if (err instanceof AwaitingExternalError) return waitRun(ctx, run, "awaiting_external", "aguardando subagente do Claude Code (vyve task show / submit)", { external_task: err.task });
    if (err instanceof BudgetExceededError) {
      await waitRun(ctx, run, "blocked", err.message);
      await withCtx(ctx, (tx) => tx.query("update vyve.batches set status = 'blocked' where id = $1", [run.batch_id]));
      return;
    }
    throw err;
  }
}

async function runValidate(ctx: Ctx, run: any) {
  const bc = await loadBatchContext(ctx, run.id);
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!bc.client.active) problems.push("Cliente inativo");
  if (!bc.briefing.theme?.trim()) problems.push("Briefing sem tema");
  const total = Object.values(bc.batch.mix as Record<string, number>).reduce((a, b) => a + b, 0);
  if (total < 1 || total > 30) problems.push(`Lote com ${total} peças (permitido: 1 a 30)`);
  if (!bc.brand) warnings.push("Cliente sem biblioteca de marca: artes usarão cores neutras e sem logo");
  const assets = await withCtx(ctx, (tx) => loadProductionAssets(tx, bc.client.id));
  if (!assets.logo) warnings.push("Sem logo cadastrado: nenhuma arte terá logo (nada será recriado)");
  for (const ex of assets.excluded) warnings.push(`Ativo "${ex.label}" fora da produção: ${ex.reason}`);
  const videoCount = Object.entries(bc.batch.mix as Record<string, number>).filter(([f]) => VIDEO_FORMATS.has(f as Format)).reduce((a, [, n]) => a + n, 0);
  if (videoCount && !assets.videos.length && !(assets.photos.length && assets.narration.length)) {
    warnings.push(`${videoCount} vídeo(s) pedidos sem material autorizado: sairão como storyboard (PENDENTE DE PRODUÇÃO)`);
  }
  if (problems.length) return waitRun(ctx, run, "blocked", problems.join("; "));
  await completeRun(ctx, run, { warnings, assets: { videos: assets.videos.length, photos: assets.photos.length, narration: assets.narration.length, music: assets.music.length, excluded: assets.excluded.length } });
}

async function runGate(ctx: Ctx, run: any) {
  const kind = run.step;
  const r = await withCtx(ctx, async (tx) => {
    if (kind === "gate_pesquisa") {
      const res = await maybe(tx, "select approval from vyve.research where batch_id = $1 order by created_at desc limit 1", [run.batch_id]);
      return { ok: res && ["aprovado", "dispensada"].includes(res.approval), why: "aguardando aprovação humana da pesquisa" };
    }
    if (kind === "gate_roteiros") {
      const s = await one(tx, "select count(*) filter (where approval not in ('aprovado','dispensada'))::int as pend, count(*)::int as total from vyve.scripts where batch_id = $1", [run.batch_id]);
      return { ok: s.total > 0 && s.pend === 0, why: `aguardando aprovação de ${s.pend} de ${s.total} roteiro(s)` };
    }
    const p = await one(tx, "select count(*)::int as pend from vyve.pieces where batch_id = $1 and approval in ('pendente','alteracao_solicitada')", [run.batch_id]);
    return { ok: p.pend === 0, why: `aguardando decisão em ${p.pend} peça(s)` };
  });
  if (r.ok) return completeRun(ctx, run, { gate: "liberado" });
  return waitRun(ctx, run, "awaiting_approval", r.why);
}

async function runProduction(ctx: Ctx, run: any) {
  const piece = await withCtx(ctx, (tx) => maybe(tx, "select id, format, production_status from vyve.pieces where batch_id = $1 and seq = $2", [run.batch_id, run.input.seq]));
  if (!piece) return completeRun(ctx, run, { reason: "peça não criada pelo roteirista" }, "skipped");
  await withCtx(ctx, (tx) => tx.query("update vyve.pieces set stage = 'PRODUCAO', production_status = 'em_producao', updated_at = now() where id = $1", [piece.id]));
  const out: Record<string, unknown> = VIDEO_FORMATS.has(piece.format) ? await produceVideoPiece(ctx, piece.id, run.id) : await produceDesignPiece(ctx, piece.id, run.id);
  // Reprodução depois de pedido de alteração: a peça volta direto para revisão/aprovação.
  if (stepKind(run.step) === "reproducao") out.review = await reviewPieces(ctx, { pieceId: piece.id }, run.id);
  await completeRun(ctx, run, out);
}

/** QA de texto e envio para aprovação humana das peças prontas. */
export async function reviewPieces(ctx: Ctx, where: { batchId?: string; pieceId?: string }, runId: string | null = null) {
  return withCtx(ctx, async (tx) => {
    const pieces = await many(tx,
      `select p.*, s.payload from vyve.pieces p left join vyve.scripts s on s.id = p.script_id
        where p.production_status = 'pronto' and p.approval in ('nao_solicitada','alteracao_solicitada')
          and ($1::uuid is null or p.batch_id = $1) and ($2::uuid is null or p.id = $2)`, [where.batchId ?? null, where.pieceId ?? null]);
    let sent = 0, held = 0;
    for (const p of pieces) {
      const brand = await maybe(tx, "select restrictions from vyve.brands where client_id = $1", [p.client_id]);
      const texts = [p.caption, p.body, p.payload?.hook, p.payload?.cta, ...(p.payload?.beats ?? []).flatMap((b: any) => [b.voiceover, b.on_screen_text])].filter(Boolean).join("\n");
      const qa = checkText(texts, { forbidden: forbiddenTerms(brand?.restrictions ?? "") });
      const mediaProblems: string[] = p.qa?.media_problems ?? [];
      if (!qa.ok || mediaProblems.length) {
        await tx.query("update vyve.pieces set qa = qa || $2, stage = 'REVISAO', updated_at = now() where id = $1", [p.id, JSON.stringify({ text: qa })]);
        held++;
        continue;
      }
      await tx.query("update vyve.pieces set qa = qa || $2, stage = 'APROVACAO', approval = 'pendente', updated_at = now() where id = $1", [p.id, JSON.stringify({ text: qa })]);
      await tx.query("insert into vyve.approvals(team_id, client_id, piece_id, piece_version) values ($1,$2,$3,$4)", [p.team_id, p.client_id, p.id, p.version]);
      await recordHistory(tx, p, p.stage, "APROVACAO", { agent: "orquestrador" }, qa.warnings.length ? `Avisos para o revisor: ${qa.warnings.join("; ")}` : "QA sem avisos");
      sent++;
    }
    const pending = await one(tx, "select count(*)::int as n from vyve.pieces where ($1::uuid is null or batch_id = $1) and ($2::uuid is null or id = $2) and production_status in ('pendente_producao','falhou')", [where.batchId ?? null, where.pieceId ?? null]);
    if (where.batchId) await log(tx, { teamId: ctx.teamId, batchId: where.batchId, runId }, "info", "revisao.concluida", `${sent} peça(s) enviadas para aprovação; ${held} retidas na revisão; ${pending.n} pendentes de produção ou com falha.`);
    return { sent, held, pending: pending.n };
  });
}

async function runCalendar(ctx: Ctx, run: any) {
  const out = await planCalendar(ctx, run.client_id, {});
  await completeRun(ctx, run, out);
}

async function processRun(ctx: Ctx, run: any) {
  const kind = stepKind(run.step);
  if (kind === "validar") return runValidate(ctx, run);
  if (kind in LLM_STEPS) return runLlmStep(ctx, run);
  if (kind.startsWith("gate_")) return runGate(ctx, run);
  if (kind === "producao" || kind === "reproducao") return runProduction(ctx, run);
  if (kind === "revisao") return completeRun(ctx, run, await reviewPieces(ctx, { batchId: run.batch_id }, run.id));
  if (kind === "calendario") return runCalendar(ctx, run);
  throw new Error(`Etapa desconhecida: ${run.step}`);
}

/** Pega a próxima etapa pronta (de qualquer equipe) e executa no contexto da equipe dona. */
export async function tick(workerId = `${os.hostname()}:${process.pid}`): Promise<{ ran: boolean; step?: string; batchId?: string }> {
  const claimed = (await anonQuery("select * from vyve.claim_next_run($1)", [workerId])).rows[0];
  if (!claimed) return { ran: false };
  const ctx: Ctx = { teamId: claimed.team_id, userId: null, role: "system" };
  const run = await withCtx(ctx, (tx) => one(tx, "select * from vyve.agent_runs where id = $1", [claimed.run_id]));
  try {
    await processRun(ctx, run);
  } catch (err) {
    await failRun(ctx, run, err as Error);
  }
  return { ran: true, step: run.step, batchId: run.batch_id };
}

/** Processa a fila até não haver nada executável (útil para CLI, testes e n8n). */
export async function drain(maxSteps = 500): Promise<string[]> {
  const steps: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const r = await tick();
    if (!r.ran) break;
    steps.push(r.step!);
  }
  return steps;
}

export async function runWorker(opts: { idleMs?: number; signal?: AbortSignal } = {}) {
  const idle = opts.idleMs ?? 3000;
  console.log(`[vyve] worker iniciado (${os.hostname()}:${process.pid})`);
  while (!opts.signal?.aborted) {
    const r = await tick().catch((e) => { console.error("[vyve] erro no worker", e); return { ran: false }; });
    if (!r.ran) await new Promise((res) => setTimeout(res, idle));
  }
}

// ---------------------------------------------------------------- status do lote
export async function refreshBatch(ctx: Ctx, batchId: string) {
  await withCtx(ctx, async (tx) => {
    const runs = await many(tx, "select step, status from vyve.agent_runs where batch_id = $1", [batchId]);
    const b = await one(tx, "select status from vyve.batches where id = $1", [batchId]);
    if (b.status === "cancelled") return;
    const nonProdFailed = runs.some((r) => r.status === "failed" && !["producao", "reproducao"].includes(stepKind(r.step)));
    let status: string;
    if (nonProdFailed) status = "failed";
    else if (runs.some((r) => r.status === "blocked")) status = "blocked";
    else if (runs.every((r) => ["succeeded", "skipped", "failed"].includes(r.status))) {
      const pend = await one(tx, "select count(*)::int as n from vyve.pieces where batch_id = $1 and production_status <> 'pronto'", [batchId]);
      status = pend.n > 0 ? "completed_with_pending" : "completed";
    } else if (runs.some((r) => r.status === "awaiting_external")) status = "awaiting_external";
    else if (runs.some((r) => r.status === "awaiting_approval") && !runs.some((r) => r.status === "running") &&
      (await one(tx, "select count(*)::int as n from vyve.agent_runs where batch_id = $1 and status = 'queued' and vyve.deps_satisfied(id)", [batchId])).n === 0) status = "awaiting_approval";
    else status = "running";
    const done = ["completed", "completed_with_pending", "failed"].includes(status);
    await tx.query("update vyve.batches set status = $2, finished_at = case when $3 then coalesce(finished_at, now()) else null end where id = $1", [batchId, status, done]);
    if (done) {
      const brief = await one(tx, "select briefing_id from vyve.batches where id = $1", [batchId]);
      await tx.query("update vyve.briefings set status = 'concluido' where id = $1 and status = 'em_producao'", [brief.briefing_id]);
    }
  });
}

async function requeueGates(tx: Tx, batchId: string) {
  await tx.query("update vyve.agent_runs set status = 'queued', next_attempt_at = now() where batch_id = $1 and status = 'awaiting_approval'", [batchId]);
}

// ---------------------------------------------------------------- aprovações humanas
type Decision = "aprovado" | "alteracao_solicitada" | "rejeitado";

export async function decideResearch(ctx: Ctx, researchId: string, decision: Exclude<Decision, "rejeitado">) {
  assertCan(ctx, "research.approve");
  const batchId = await withCtx(ctx, async (tx) => {
    const r = await one(tx, "update vyve.research set approval = $2, approved_by = $3, approved_at = now() where id = $1 returning batch_id, client_id", [researchId, decision, ctx.userId]);
    await log(tx, { teamId: ctx.teamId, clientId: r.client_id, batchId: r.batch_id }, "info", "pesquisa.decisao", `Pesquisa: ${decision}`);
    if (decision === "aprovado") await requeueGates(tx, r.batch_id);
    else {
      // Pedido de alteração: refaz a pesquisa (nova tentativa) e volta a aguardar aprovação.
      await tx.query("update vyve.agent_runs set status = 'queued', attempt = 0, next_attempt_at = now(), output = null where batch_id = $1 and step = 'pesquisa'", [r.batch_id]);
    }
    return r.batch_id;
  });
  await refreshBatch(ctx, batchId);
}

export async function decideScripts(ctx: Ctx, scriptIds: string[], decision: Exclude<Decision, "rejeitado">, comment = "") {
  assertCan(ctx, "script.approve");
  const batchIds = await withCtx(ctx, async (tx) => {
    const rows = await many(tx, "update vyve.scripts set approval = $2, approved_by = $3, approved_at = now() where id = any($1::uuid[]) returning batch_id, client_id, id", [scriptIds, decision, ctx.userId]);
    const ids = [...new Set(rows.map((r) => r.batch_id))];
    for (const b of ids) {
      await log(tx, { teamId: ctx.teamId, clientId: rows[0].client_id, batchId: b }, "info", "roteiros.decisao", `${rows.length} roteiro(s): ${decision}${comment ? ` — ${comment}` : ""}`);
      await requeueGates(tx, b);
    }
    return ids;
  });
  for (const b of batchIds) await refreshBatch(ctx, b);
}

/** Atualiza campos do roteiro (pedido de alteração atendido pela equipe) antes de aprovar ou reproduzir. */
export async function editScript(ctx: Ctx, scriptId: string, patch: Record<string, unknown>) {
  assertCan(ctx, "piece.request_change");
  return withCtx(ctx, async (tx) => {
    const s = await one(tx, "select * from vyve.scripts where id = $1", [scriptId]);
    const payload = { ...s.payload, ...patch };
    await tx.query("update vyve.scripts set payload = $2, version = version + 1, approval = case when approval = 'dispensada' then 'dispensada' else 'pendente' end where id = $1", [scriptId, JSON.stringify(payload)]);
    return payload;
  });
}

export async function decidePiece(ctx: Ctx, pieceId: string, decision: Decision, comment = "") {
  assertCan(ctx, decision === "aprovado" ? "piece.approve" : "piece.request_change");
  if (!ctx.userId) throw new Error("Aprovação de peça exige um usuário humano autenticado");
  const batchId = await withCtx(ctx, async (tx) => {
    const p = await one(tx, "select * from vyve.pieces where id = $1", [pieceId]);
    if (p.approval !== "pendente" && decision === "aprovado") throw new Error("Esta peça não está aguardando aprovação");
    await tx.query(
      `update vyve.approvals set decision = $3, comment = $4, decided_by = $5, decided_at = now()
        where piece_id = $1 and piece_version = $2 and decision = 'pendente'`, [pieceId, p.version, decision, comment, ctx.userId]);
    if (decision === "aprovado") {
      await tx.query("update vyve.pieces set approval = 'aprovado', updated_at = now() where id = $1", [pieceId]);
      await recordHistory(tx, p, p.stage, "APROVACAO", { userId: ctx.userId }, `Aprovada${comment ? `: ${comment}` : ""}`);
    } else {
      await tx.query("update vyve.pieces set approval = $2, stage = 'PRODUCAO', updated_at = now() where id = $1", [pieceId, decision === "rejeitado" ? "rejeitado" : "alteracao_solicitada"]);
      await recordHistory(tx, p, p.stage, "PRODUCAO", { userId: ctx.userId }, `${decision === "rejeitado" ? "Rejeitada" : "Alteração solicitada"}: ${comment}`);
    }
    if (p.batch_id) await requeueGates(tx, p.batch_id);
    return p.batch_id;
  });
  if (batchId) await refreshBatch(ctx, batchId);
}

/** Depois de editar o roteiro, refaz a produção da peça (nova versão) e reenvia para aprovação. */
export async function reproducePiece(ctx: Ctx, pieceId: string) {
  assertCan(ctx, "piece.request_change");
  const run = await withCtx(ctx, async (tx) => {
    const p = await one(tx, "update vyve.pieces set version = version + 1, approval = 'nao_solicitada', production_status = 'aguardando', updated_at = now() where id = $1 returning *", [pieceId]);
    await tx.query(
      `insert into vyve.agent_runs(team_id, client_id, batch_id, agent, step, input, idempotency_key, max_attempts)
       values ($1,$2,$3,$4,$5,$6,$7,2) on conflict (idempotency_key) do nothing`,
      [p.team_id, p.client_id, p.batch_id, VIDEO_FORMATS.has(p.format) ? "audiovisual" : "design", `reproducao:${String(p.seq).padStart(3, "0")}:v${p.version}`,
        JSON.stringify({ seq: p.seq, format: p.format }), `${p.batch_id}:reproducao:${p.seq}:v${p.version}`]);
    await tx.query("update vyve.batches set status = 'running', finished_at = null where id = $1", [p.batch_id]);
    return p;
  });
  return run;
}

// ---------------------------------------------------------------- modo Claude Code (sem chave de API)
export async function externalTask(ctx: Ctx, runId: string) {
  return withCtx(ctx, async (tx) => {
    const run = await one(tx, "select id, step, status, input, batch_id from vyve.agent_runs where id = $1", [runId]);
    if (run.status !== "awaiting_external") throw new Error(`Etapa ${run.step} não está aguardando resposta externa (status ${run.status})`);
    return { runId: run.id, step: run.step, batchId: run.batch_id, ...run.input.external_task };
  });
}

export async function listExternalTasks(ctx: Ctx, agent?: string) {
  return withCtx(ctx, (tx) => many(tx,
    `select r.id, r.agent, r.step, r.batch_id, c.name as client from vyve.agent_runs r join vyve.clients c on c.id = r.client_id
      where r.status = 'awaiting_external' and ($1::text is null or r.agent = $1) order by r.created_at`, [agent ?? null]));
}

/** Recebe a resposta de um subagente do Claude Code, valida no esquema e conclui a etapa. */
export async function submitExternal(ctx: Ctx, runId: string, data: unknown) {
  const run = await withCtx(ctx, (tx) => one(tx, "select * from vyve.agent_runs where id = $1", [runId]));
  if (run.status !== "awaiting_external") throw new Error(`Etapa ${run.step} não está aguardando resposta externa (status ${run.status})`);
  const step = LLM_STEPS[stepKind(run.step)];
  const schema = SCHEMAS[step.schemaName];
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`Resposta fora do esquema ${step.schemaName}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const bc = await loadBatchContext(ctx, runId);
  const result: LlmResult<unknown> = {
    data: parsed.data,
    usage: [{ provider: "claude-code", model: "claude-code-subagent", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, web_searches: 0, usd: 0 }],
    retrievedSources: null,
    provider: "claude-code",
    isFictitious: false,
  };
  await recordUsage(ctx, run, result);
  const output = await step.finish(bc, result as any);
  await completeRun(ctx, run, { ...output, provider: "claude-code" });
  return output;
}

export async function cancelBatch(ctx: Ctx, batchId: string) {
  assertCan(ctx, "batch.start");
  await withCtx(ctx, async (tx) => {
    await tx.query("update vyve.batches set status = 'cancelled', finished_at = now() where id = $1", [batchId]);
    await tx.query("update vyve.agent_runs set status = 'skipped' where batch_id = $1 and status in ('queued','awaiting_approval','awaiting_external')", [batchId]);
    await log(tx, { teamId: ctx.teamId, batchId }, "warn", "lote.cancelado", "Lote cancelado por usuário");
  });
}
