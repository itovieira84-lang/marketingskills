import { analyzePerformance } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

export async function POST(req: Request) {
  return withApiKey(req, async (ctx, b) => {
    const end = b.end ?? new Date().toISOString().slice(0, 10);
    const start = b.start ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const r = await analyzePerformance(ctx, b.clientId, { start, end });
    return { hasData: r.hasData, publications: r.publications, patterns: r.patterns, hypotheses: r.hypotheses, recommendations: r.recommendations, markdown: r.markdown };
  });
}
