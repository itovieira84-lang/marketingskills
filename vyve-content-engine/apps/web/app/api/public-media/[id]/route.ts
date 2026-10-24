import { anonQuery, verifyPublicMediaSig } from "@vyve/engine";
import { serveFile } from "@/lib/serve";

/**
 * URL pública usada só na publicação oficial (a Meta baixa a mídia daqui).
 * Exige assinatura HMAC e só entrega arquivos de peças APROVADAS (função vyve.public_asset).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("ID inválido", { status: 400 });
  if (!verifyPublicMediaSig(id, new URL(req.url).searchParams.get("sig"))) return new Response("Assinatura inválida", { status: 403 });
  const { rows } = await anonQuery("select storage_path, mime from vyve.public_asset($1)", [id]);
  if (!rows[0]) return new Response("Não disponível", { status: 404 });
  return serveFile(req, rows[0].storage_path, rows[0].mime, { cache: "public, max-age=3600" });
}
