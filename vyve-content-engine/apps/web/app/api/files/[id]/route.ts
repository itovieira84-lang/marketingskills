import { getAsset } from "@vyve/engine";
import { getSession, ctxOf } from "@/lib/session";
import { serveFile } from "@/lib/serve";

/** Arquivos para o painel: exige sessão e passa pelo RLS (cliente só baixa o que é dele). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("ID inválido", { status: 400 });
  const a = await getAsset(ctxOf(s), id);
  if (!a) return new Response("Não encontrado", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") ? (a.label?.includes(".") ? a.label : a.storage_path.split("/").pop()) : null;
  return serveFile(req, a.storage_path, a.mime, { download });
}
