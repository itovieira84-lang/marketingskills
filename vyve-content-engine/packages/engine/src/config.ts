import path from "node:path";
import fs from "node:fs";

// Carrega .env da raiz do monorepo sem dependência externa (só chaves ainda não definidas).
function loadDotEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const file = path.join(dir, ".env");
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m || line.trim().startsWith("#")) continue;
        const value = m[2].replace(/^["']|["']$/g, "");
        if (process.env[m[1]] === undefined) process.env[m[1]] = value;
      }
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

const envDir = loadDotEnv();

export function repoRoot(): string {
  if (process.env.VYVE_ROOT) return process.env.VYVE_ROOT;
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, "supabase", "migrations"))) return dir;
    dir = path.dirname(dir);
  }
  return envDir ?? process.cwd();
}

export type LlmMode = "anthropic" | "claude-code" | "fixture";

export const config = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://vyve_login:vyve_dev@localhost:5432/vyve";
  },
  get databaseAdminUrl() {
    return process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/vyve";
  },
  get storageDir() {
    return path.resolve(repoRoot(), process.env.VYVE_STORAGE_DIR ?? "storage");
  },
  get sessionSecret() {
    const s = process.env.VYVE_SESSION_SECRET;
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === "production") throw new Error("VYVE_SESSION_SECRET ausente ou curto (mínimo 32 caracteres)");
      return "dev-only-insecure-secret-change-me-0000000000";
    }
    return s;
  },
  /** Modo padrão dos agentes de IA quando o lote não especifica. */
  get defaultLlmMode(): LlmMode {
    const m = process.env.VYVE_LLM_MODE as LlmMode | undefined;
    if (m) return m;
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : "claude-code";
  },
  get model() {
    return process.env.VYVE_MODEL ?? "claude-opus-5-5";
  },
  get bulkModel() {
    // Modelo para tarefas de volume (roteiros em lote). Por padrão o mesmo modelo principal;
    // trocar para um mais barato é decisão do dono da conta (VYVE_BULK_MODEL).
    return process.env.VYVE_BULK_MODEL ?? this.model;
  },
  get maxRequestsPerMinute() {
    return Number(process.env.VYVE_MAX_RPM ?? 20);
  },
  get browserExecutable(): string | null {
    if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
    const pw = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
    return fs.existsSync(pw) ? pw : null;
  },
  get ffmpeg() {
    return process.env.FFMPEG_PATH ?? "ffmpeg";
  },
  get ffprobe() {
    return process.env.FFPROBE_PATH ?? "ffprobe";
  },
  get transcriber(): "none" | "faster-whisper" {
    return (process.env.VYVE_TRANSCRIBER as "faster-whisper") ?? "none";
  },
  get publicBaseUrl() {
    return process.env.VYVE_PUBLIC_BASE_URL ?? "";
  },
};
