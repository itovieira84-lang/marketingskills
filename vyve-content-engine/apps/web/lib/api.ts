import "server-only";
import { ctxFromApiKey, ForbiddenError, type Ctx } from "@vyve/engine";

/** API para o n8n: Authorization: Bearer <chave criada em Configurações>. Age com o papel "system". */
export async function withApiKey(req: Request, fn: (ctx: Ctx, body: any) => Promise<unknown>): Promise<Response> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const ctx = await ctxFromApiKey(token);
  if (!ctx) return Response.json({ error: "Chave de API ausente, inválida ou revogada" }, { status: 401 });
  let body: any = {};
  if (req.method !== "GET") {
    const raw = await req.text();
    try { body = raw ? JSON.parse(raw) : {}; } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  }
  try {
    return Response.json(await fn(ctx, body));
  } catch (e) {
    const err = e as Error;
    const status = err instanceof ForbiddenError ? 403 : err.name === "ZodError" ? 422 : 400;
    return Response.json({ error: err.message }, { status });
  }
}
