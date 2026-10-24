import { createBriefing, startBatch, sha256, withCtx, maybe } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

/**
 * n8n: briefing recebido (formulário, e-mail, planilha) vira lote.
 * A mesma entrada reenviada (retry do webhook) devolve o lote existente em vez de criar outro.
 */
export async function POST(req: Request) {
  return withApiKey(req, async (ctx, b) => {
    const key = `api:${b.idempotencyKey ?? sha256(JSON.stringify([b.clientId, b.title, b.theme, b.objective ?? "", b.body ?? "", b.mix ?? null, b.mode ?? null]))}`;
    const existing = await withCtx(ctx, (tx) => maybe(tx, "select id, briefing_id, status, provider from vyve.batches where idempotency_key = $1", [key]));
    if (existing) return { briefingId: existing.briefing_id, batchId: existing.id, status: existing.status, created: false, provider: existing.provider };
    const briefing = await createBriefing(ctx, { clientId: b.clientId, title: b.title, theme: b.theme, objective: b.objective ?? "", body: b.body ?? "", mix: b.mix });
    const { batch, created } = await startBatch(ctx, { briefingId: briefing.id, mode: b.mode, idempotencyKey: key });
    return { briefingId: briefing.id, batchId: batch.id, status: batch.status, created, provider: batch.provider };
  });
}
