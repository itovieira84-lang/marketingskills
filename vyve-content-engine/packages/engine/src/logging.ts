import type { Tx } from "./db";

export interface LogScope {
  teamId: string;
  clientId?: string | null;
  batchId?: string | null;
  runId?: string | null;
}

/** Registra no banco (aparece no histórico do painel) e no console do worker. */
export async function log(
  tx: Tx,
  scope: LogScope,
  level: "debug" | "info" | "warn" | "error",
  event: string,
  message: string,
  data: Record<string, unknown> = {},
) {
  if (process.env.VYVE_QUIET !== "1") {
    const tag = scope.batchId ? `lote ${scope.batchId.slice(0, 8)}` : "geral";
    console[level === "error" ? "error" : "log"](`[vyve:${level}] ${tag} ${event}: ${message}`);
  }
  await tx.query(
    "insert into vyve.logs(team_id, client_id, batch_id, agent_run_id, level, event, message, data) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [scope.teamId, scope.clientId ?? null, scope.batchId ?? null, scope.runId ?? null, level, event, message, JSON.stringify(data)],
  );
}
