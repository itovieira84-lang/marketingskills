import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { config } from "../config";
import { mimeOf } from "../storage";

/**
 * Servidor HTTP local (127.0.0.1, porta aleatória) que expõe a pasta storage/
 * somente para o navegador headless do Remotion durante a renderização.
 * Suporta Range, necessário para vídeo.
 */
let server: http.Server | null = null;
let baseUrl = "";

export async function startFileServer(): Promise<string> {
  if (server) return baseUrl;
  const root = path.resolve(config.storageDir);
  server = http.createServer((req, res) => {
    try {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      const size = fs.statSync(file).size;
      const headers: Record<string, string | number> = { "Content-Type": mimeOf(file), "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, "Content-Length": size });
        fs.createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return baseUrl;
}

export function fileUrl(storagePath: string): string {
  if (!baseUrl) throw new Error("Servidor de arquivos não iniciado");
  return `${baseUrl}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

export async function stopFileServer() {
  if (!server) return;
  const s = server;
  server = null;
  baseUrl = "";
  await new Promise<void>((r) => s.close(() => r()));
}
