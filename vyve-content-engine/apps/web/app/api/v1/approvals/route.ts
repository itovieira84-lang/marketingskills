import { listPieces, listScripts, pendingResearch } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

/** n8n: o que espera decisão humana (para avisar a equipe ou o cliente). Só leitura; a chave não aprova nada. */
export async function GET(req: Request) {
  return withApiKey(req, async (ctx) => {
    const [research, scripts, pieces] = await Promise.all([pendingResearch(ctx), listScripts(ctx, { approval: "pendente" }), listPieces(ctx, { approval: "pendente" })]);
    const base = process.env.VYVE_PANEL_URL?.replace(/\/$/, "") ?? "";
    return {
      research: research.map((r: any) => ({ id: r.id, client: r.client_name, title: r.title, url: `${base}/pesquisa/${r.id}` })),
      scripts: scripts.map((s: any) => ({ id: s.id, client: s.client_name, title: s.payload?.title, format: s.format, url: `${base}/roteiros/${s.id}` })),
      pieces: pieces.map((p: any) => ({ id: p.id, client: p.client_name, title: p.title, format: p.format, url: `${base}/pecas/${p.id}` })),
    };
  });
}
