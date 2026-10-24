import { getBatch } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApiKey(req, async (ctx) => {
    const d = await getBatch(ctx, id);
    if (!d) throw new Error("Lote não encontrado");
    const count = (k: string) => Object.entries(d.pieces.reduce((a: Record<string, number>, p: any) => ({ ...a, [p[k]]: (a[p[k]] ?? 0) + 1 }), {}));
    return {
      id: d.batch.id, status: d.batch.status, client: d.batch.client_name, title: d.batch.title, provider: d.batch.provider, isFictitious: d.batch.is_fictitious,
      costUsd: Number(d.batch.cost_usd), pieces: d.pieces.length, byStage: Object.fromEntries(count("stage")), byProduction: Object.fromEntries(count("production_status")),
      waiting: d.runs.filter((r: any) => ["awaiting_approval", "awaiting_external"].includes(r.status)).map((r: any) => ({ step: r.step, status: r.status })),
      failed: d.runs.filter((r: any) => r.status === "failed").map((r: any) => ({ step: r.step, error: r.error })),
    };
  });
}
