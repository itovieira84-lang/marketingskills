import { withCtx, one, many, maybe, type Ctx, type Tx } from "../db";
import type { LlmResult, LlmTask } from "../llm/types";

export interface BatchContext {
  ctx: Ctx;
  batch: any;
  client: any;
  brand: any;
  briefing: any;
  run: any;
}

export async function loadBatchContext(ctx: Ctx, runId: string): Promise<BatchContext> {
  return withCtx(ctx, async (tx) => {
    const run = await one(tx, "select * from vyve.agent_runs where id = $1", [runId]);
    const batch = await one(tx, "select * from vyve.batches where id = $1", [run.batch_id]);
    const client = await one(tx, "select * from vyve.clients where id = $1", [batch.client_id]);
    const brand = await maybe(tx, "select * from vyve.brands where client_id = $1", [batch.client_id]);
    const briefing = await one(tx, "select * from vyve.briefings where id = $1", [batch.briefing_id]);
    return { ctx, batch, client, brand, briefing, run };
  });
}

/** Etapa que usa IA: monta a tarefa e, quando a resposta chega, grava o resultado. */
export interface LlmStep<T> {
  agent: string;
  schemaName: string;
  build(bc: BatchContext): Promise<LlmTask<T>>;
  finish(bc: BatchContext, result: LlmResult<T>): Promise<Record<string, unknown>>;
}

export async function latestResearch(tx: Tx, batchId: string) {
  return maybe(tx, "select * from vyve.research where batch_id = $1 order by created_at desc limit 1", [batchId]);
}

export async function clientLearnings(tx: Tx, clientId: string, limit = 12) {
  return many(tx, "select kind, insight, evidence, created_at from vyve.learnings where client_id = $1 order by created_at desc limit $2", [clientId, limit]);
}

export function clientProfile(client: any, brand: any): string {
  return [
    `Cliente: ${client.name}`,
    `Segmento: ${client.segment || "(não informado)"}`,
    `Público-alvo: ${client.audience || "(não informado)"}`,
    `Objetivos: ${client.objectives || "(não informado)"}`,
    `Tom de voz: ${client.tone || brand?.voice || "(não informado)"}`,
    brand?.restrictions ? `Restrições da marca: ${brand.restrictions}` : "",
  ].filter(Boolean).join("\n");
}

export async function recordHistory(tx: Tx, piece: { id: string; team_id: string; client_id: string }, from: string | null, to: string, actor: { userId?: string | null; agent?: string }, note = "") {
  await tx.query(
    "insert into vyve.piece_history(team_id, client_id, piece_id, from_stage, to_stage, actor_user_id, actor_agent, note) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [piece.team_id, piece.client_id, piece.id, from, to, actor.userId ?? null, actor.agent ?? null, note],
  );
}

export function brandProps(client: any, brand: any, urls: { logo?: string | null; heading?: string | null; body?: string | null }) {
  return {
    clientName: client.name,
    colors: brand?.colors ?? { primary: "#1F3A5F", secondary: "#F2C14E", background: "#FAFAF7", text: "#121212" },
    fonts: brand?.fonts ?? { heading: "Inter Display", body: "Inter" },
    fontUrls: { heading: urls.heading ?? null, body: urls.body ?? null },
    logoUrl: urls.logo ?? null,
  };
}
