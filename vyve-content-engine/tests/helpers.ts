// Ambiente de teste: banco próprio (vyve_test), storage temporário, sem transcrição, sem chamadas pagas.
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

process.env.DATABASE_URL = process.env.VYVE_TEST_DATABASE_URL ?? "postgres://vyve_login:vyve_dev@localhost:5432/vyve_test";
process.env.DATABASE_ADMIN_URL = process.env.VYVE_TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/vyve_test";
process.env.VYVE_STORAGE_DIR = process.env.VYVE_STORAGE_DIR ?? path.join(os.tmpdir(), "vyve-test-storage");
process.env.VYVE_TRANSCRIBER = "none";
process.env.VYVE_QUIET = "1";
process.env.VYVE_RETRY_BASE_MS = "1";
process.env.VYVE_SESSION_SECRET = "teste-".padEnd(48, "x");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.VYVE_PUBLIC_BASE_URL;

import { hashPassword, type Ctx } from "../packages/engine/src/index";

export const FIXTURES = path.join(import.meta.dirname, "fixtures");

/** Cria uma equipe isolada com um usuário dono (direto pelo admin: bootstrap só vale uma vez por banco). */
export async function newTeam(label = "Equipe"): Promise<Ctx & { email: string }> {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    const tag = crypto.randomUUID().slice(0, 8);
    const t = await admin.query("insert into vyve.teams(name) values ($1) returning id", [`${label} ${tag}`]);
    const email = `dono-${tag}@teste.local`;
    const u = await admin.query("insert into vyve.users(team_id, email, name, password_hash, role) values ($1,$2,$3,$4,'owner') returning id",
      [t.rows[0].id, email, `Dono ${tag}`, hashPassword("senha-de-teste-123")]);
    return { teamId: t.rows[0].id, userId: u.rows[0].id, role: "owner", email };
  } finally {
    await admin.end();
  }
}

export async function adminQuery(sql: string, params: unknown[] = []) {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  try { return (await admin.query(sql, params)).rows; } finally { await admin.end(); }
}

/** Processa só a fila dos lotes informados (outros arquivos de teste podem rodar no mesmo banco). */
export { drain } from "../packages/engine/src/index";

import { drain as drainOnce } from "../packages/engine/src/index";
/** Drena a fila várias vezes (novas tentativas têm espera exponencial curta nos testes). */
export async function settle(rounds = 6) {
  const all: string[] = [];
  for (let i = 0; i < rounds; i++) {
    const s = await drainOnce(500);
    all.push(...s);
    if (!s.length) await new Promise((r) => setTimeout(r, 50));
  }
  return all;
}
