import crypto from "node:crypto";
import { anonQuery, type Ctx, type Role } from "./db";
import { config } from "./config";

// ---------------------------------------------------------------- senhas (scrypt)
export function hashPassword(password: string): string {
  if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

// ---------------------------------------------------------------- sessão assinada (HMAC)
export interface Session extends Ctx {
  name: string;
  exp: number;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signSession(s: Omit<Session, "exp">, ttlHours = 12): string {
  const payload = b64url(JSON.stringify({ ...s, exp: Date.now() + ttlHours * 3600_000 }));
  const sig = crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof s.exp !== "number" || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<Session | null> {
  const r = await anonQuery("select * from vyve.auth_lookup($1)", [email.trim()]);
  const u = r.rows[0];
  // Mesmo custo de CPU quando o e-mail não existe, para não revelar quais contas existem.
  if (!u) {
    verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    return null;
  }
  if (!u.active || !verifyPassword(password, u.password_hash)) return null;
  return { teamId: u.team_id, userId: u.id, role: u.role, name: u.name, exp: 0 };
}

// ---------------------------------------------------------------- chaves de API (n8n)
export function newApiKey(): { token: string; hash: string } {
  const token = "vyve_" + crypto.randomBytes(24).toString("base64url");
  return { token, hash: sha256(token) };
}

export function sha256(s: string | Buffer): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function ctxFromApiKey(token: string | null | undefined): Promise<Ctx | null> {
  if (!token) return null;
  const r = await anonQuery("select * from vyve.api_key_lookup($1)", [sha256(token)]);
  const k = r.rows[0];
  return k ? { teamId: k.team_id, userId: null, role: "system" } : null;
}

// ---------------------------------------------------------------- permissões por função
export type Permission =
  | "client.manage"
  | "brand.edit"
  | "asset.upload"
  | "briefing.create"
  | "batch.start"
  | "research.approve"
  | "script.approve"
  | "piece.approve"
  | "piece.request_change"
  | "calendar.schedule"
  | "publish"
  | "integrations.manage"
  | "users.manage"
  | "costs.view";

const MATRIX: Record<Role, Permission[]> = {
  owner: ["client.manage", "brand.edit", "asset.upload", "briefing.create", "batch.start", "research.approve", "script.approve", "piece.approve", "piece.request_change", "calendar.schedule", "publish", "integrations.manage", "users.manage", "costs.view"],
  admin: ["client.manage", "brand.edit", "asset.upload", "briefing.create", "batch.start", "research.approve", "script.approve", "piece.approve", "piece.request_change", "calendar.schedule", "publish", "integrations.manage", "users.manage", "costs.view"],
  strategist: ["brand.edit", "asset.upload", "briefing.create", "batch.start", "research.approve", "script.approve", "piece.request_change", "calendar.schedule", "costs.view"],
  creator: ["asset.upload", "briefing.create", "piece.request_change"],
  reviewer: ["research.approve", "script.approve", "piece.approve", "piece.request_change"],
  client: ["piece.approve", "piece.request_change", "asset.upload"],
  system: ["briefing.create", "batch.start", "calendar.schedule", "publish"],
};

export function can(role: Role, perm: Permission): boolean {
  return MATRIX[role]?.includes(perm) ?? false;
}

export class ForbiddenError extends Error {
  constructor(perm: Permission) {
    super(`Sem permissão para: ${perm}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(ctx: Ctx, perm: Permission) {
  if (!can(ctx.role, perm)) throw new ForbiddenError(perm);
}

/** Assinatura da URL pública de mídia (a Meta baixa o arquivo por ela). HMAC com o segredo da sessão. */
export function publicMediaSig(assetId: string): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(`public-media:${assetId}`).digest("hex").slice(0, 32);
}

export function verifyPublicMediaSig(assetId: string, sig: string | null | undefined): boolean {
  const want = Buffer.from(publicMediaSig(assetId));
  const got = Buffer.from(String(sig ?? ""));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
