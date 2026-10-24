import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { absolutePath } from "@vyve/engine";

/** Entrega um arquivo do storage com suporte a Range (necessário para <video> e para a Meta). */
export function serveFile(req: Request, storagePath: string, mime: string, opts: { download?: string | null; cache?: string } = {}): Response {
  const abs = absolutePath(storagePath);
  if (!fs.existsSync(abs)) return new Response("Arquivo não encontrado no storage", { status: 404 });
  const size = fs.statSync(abs).size;
  const headers: Record<string, string> = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": opts.cache ?? "private, max-age=300",
    "x-content-type-options": "nosniff",
  };
  if (opts.download) headers["content-disposition"] = `attachment; filename="${path.basename(opts.download).replace(/[^\w.\- ]/g, "_")}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(abs, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "content-length": String(size) } });
}
