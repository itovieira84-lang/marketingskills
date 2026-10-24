import { collectMetrics, listClients } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

export async function POST(req: Request) {
  return withApiKey(req, async (ctx, b) => {
    const ids: string[] = b.clientId ? [b.clientId] : (await listClients(ctx)).map((c: any) => c.id);
    const results = [];
    for (const id of ids) results.push({ clientId: id, ...(await collectMetrics(ctx, id)) });
    return { results };
  });
}
