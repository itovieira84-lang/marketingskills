import { drain } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

/** n8n: processa a fila quando não há worker contínuo rodando. */
export async function POST(req: Request) {
  return withApiKey(req, async (_ctx, b) => ({ steps: await drain(Math.min(Number(b.maxSteps ?? 50), 200)) }));
}
