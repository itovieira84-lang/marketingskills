import { publishDue } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

/** n8n (cron): publica o que venceu. Cada peça ainda precisa de aprovação humana e credenciais; sem isso, fica bloqueada com o motivo. */
export async function POST(req: Request) {
  return withApiKey(req, async (ctx, b) => ({ results: await publishDue(ctx, { requestedBy: null, dryRun: b.dryRun !== false }) }));
}
