import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";
import type { Tx } from "./db";
import { probe } from "./media/ffmpeg";

/**
 * Armazenamento local de arquivos (pasta storage/). Organização:
 *   storage/<team>/<client>/<kind>/<uuid>-<nome>
 * Para produção, trocar por Supabase Storage mantendo storage_path como chave.
 */
export function absolutePath(storagePath: string): string {
  const abs = path.resolve(config.storageDir, storagePath);
  if (!abs.startsWith(path.resolve(config.storageDir) + path.sep)) throw new Error("Caminho fora do armazenamento");
  return abs;
}

function safeName(name: string) {
  const base = path.basename(name).normalize("NFKD").replace(/[^\w.\-]+/g, "_");
  return base.slice(-80) || "arquivo";
}

export function newStoragePath(teamId: string, clientId: string, kind: string, fileName: string): string {
  return path.posix.join(teamId, clientId, kind, `${crypto.randomUUID()}-${safeName(fileName)}`);
}

export function ensureDirFor(storagePath: string) {
  fs.mkdirSync(path.dirname(absolutePath(storagePath)), { recursive: true });
}

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".srt": "application/x-subrip",
};
export const mimeOf = (file: string) => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

export interface RegisterAssetInput {
  teamId: string;
  clientId: string;
  kind: "image" | "video" | "audio" | "logo" | "font" | "document" | "render" | "reference";
  label?: string;
  rightsStatus?: "own" | "licensed" | "authorized" | "unknown" | "restricted";
  rightsNotes?: string;
  consentId?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

/** Copia/move um arquivo para o armazenamento, mede com ffprobe e registra em media_assets. */
export async function registerFile(tx: Tx, srcPath: string, input: RegisterAssetInput, opts: { move?: boolean; fileName?: string } = {}) {
  const storagePath = newStoragePath(input.teamId, input.clientId, input.kind, opts.fileName ?? srcPath);
  ensureDirFor(storagePath);
  const dest = absolutePath(storagePath);
  if (opts.move) fs.renameSync(srcPath, dest);
  else fs.copyFileSync(srcPath, dest);
  return insertAsset(tx, storagePath, { ...input, label: input.label ?? path.basename(opts.fileName ?? srcPath) });
}

export async function registerBuffer(tx: Tx, buf: Buffer, fileName: string, input: RegisterAssetInput) {
  const storagePath = newStoragePath(input.teamId, input.clientId, input.kind, fileName);
  ensureDirFor(storagePath);
  fs.writeFileSync(absolutePath(storagePath), buf);
  return insertAsset(tx, storagePath, { ...input, label: input.label ?? fileName });
}

async function insertAsset(tx: Tx, storagePath: string, input: RegisterAssetInput) {
  const abs = absolutePath(storagePath);
  const buf = fs.readFileSync(abs);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const mime = mimeOf(abs);
  let width: number | null = null, height: number | null = null, duration: number | null = null;
  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (/^(image|video|audio)\//.test(mime) && mime !== "image/svg+xml") {
    try {
      const p = await probe(abs);
      width = p.width; height = p.height; duration = p.durationS;
      meta.probe = p;
    } catch (e) {
      meta.probe_error = (e as Error).message;
    }
  }
  const r = await tx.query(
    `insert into vyve.media_assets(team_id, client_id, kind, label, storage_path, mime, bytes, sha256, width, height, duration_s,
       rights_status, rights_notes, consent_id, metadata, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
    [input.teamId, input.clientId, input.kind, input.label ?? path.basename(abs), storagePath, mime, buf.length, sha, width, height, duration,
      input.rightsStatus ?? "unknown", input.rightsNotes ?? "", input.consentId ?? null, JSON.stringify(meta), input.createdBy ?? null],
  );
  return r.rows[0];
}

export function scratchDir(name: string): string {
  const dir = path.join(config.storageDir, "_tmp", `${name}-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
