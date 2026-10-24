import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { config, repoRoot } from "./config";

export type Role = "owner" | "admin" | "strategist" | "creator" | "reviewer" | "client" | "system";

/** Quem está agindo. Toda consulta de negócio roda dentro deste contexto (RLS). */
export interface Ctx {
  teamId: string;
  userId: string | null;
  role: Role;
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on("error", (err) => console.error("[vyve:db] erro no pool", err.message));
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

export type Tx = pg.PoolClient;

/**
 * Executa `fn` numa transação com o contexto de equipe/usuário/papel aplicado.
 * As políticas RLS leem esses valores; sem eles nenhuma linha aparece.
 */
export async function withCtx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.team_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true)",
      [ctx.teamId, ctx.userId ?? "", ctx.role],
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Consulta sem contexto (só funções security definer como auth_lookup respondem). */
export async function anonQuery<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = []) {
  return getPool().query<T>(sql, params);
}

export async function one<T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tx.query(sql, params);
  if (r.rowCount === 0) throw new Error(`Registro não encontrado: ${sql.slice(0, 80)}`);
  return r.rows[0] as T;
}

export async function maybe<T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await tx.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await tx.query(sql, params);
  return r.rows as T[];
}

/** Aplica as migrações em ordem com a URL administrativa (dona das tabelas). */
export async function migrate(adminUrl = config.databaseAdminUrl): Promise<string[]> {
  const dir = path.join(repoRoot(), "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("create table if not exists public.vyve_migrations (name text primary key, applied_at timestamptz default now())");
    for (const f of files) {
      const done = await client.query("select 1 from public.vyve_migrations where name = $1", [f]);
      if (done.rowCount) continue;
      await client.query("begin");
      await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await client.query("insert into public.vyve_migrations(name) values ($1)", [f]);
      await client.query("commit");
      applied.push(f);
    }
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
  return applied;
}
