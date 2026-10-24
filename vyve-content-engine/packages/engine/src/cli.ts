#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { migrate, closePool, withCtx, many, type Ctx } from "./db";
import { login } from "./auth";
import { bootstrap, createClient, uploadAsset, addConsent, getBatch, setIntegration, integrationStatus, createApiKey } from "./repo";
import { createBriefing, startBatch, drain, runWorker, externalTask, listExternalTasks, submitExternal, decideResearch, decideScripts, decidePiece } from "./orchestrator";
import { planCalendar, publishDue } from "./agents/calendar";
import { analyzePerformance, collectMetrics } from "./agents/analytics";
import { stopFileServer } from "./media/fileserver";
import { DEFAULT_MIX } from "./schemas";
import type { LlmMode } from "./config";

const HELP = `VYVE Content Engine — linha de comando

  db migrate                                  aplica as migrações (DATABASE_ADMIN_URL)
  bootstrap --team T --email E --name N --password P   cria a agência e o dono (banco vazio)
  client create --name N [--segment S --audience A --objectives O --tone T]
  asset upload --client ID --file F --kind image|video|audio|logo|font|reference --rights own|licensed|authorized|unknown [--person --consent ID --role narration|music|body]
  consent add --client ID --person NOME --scope image|voice|likeness --granted-by QUEM --evidence TEXTO
  briefing --client ID --title T --theme TEMA [--objective O --mix JSON --mode anthropic|claude-code|fixture]
  worker                                      processa a fila continuamente
  drain                                       processa até não haver etapa executável
  status --batch ID                           mostra etapas, peças e custos do lote
  task list [--agent pesquisa|estrategia]     tarefas aguardando subagente do Claude Code
  task show --run ID                          imprime a tarefa (sistema, prompt, esquema JSON)
  task submit --run ID --file resposta.json   envia a resposta do subagente
  approve research --id ID | scripts --batch ID | piece --id ID [--decision aprovado|alteracao_solicitada|rejeitado --comment C]
  calendar --client ID [--start AAAA-MM-DD]   distribui as peças aprovadas no calendário
  publish-due [--dry-run]                     publica o que venceu (exige aprovação + credenciais)
  metrics --client ID                         coleta métricas pela integração oficial
  analyze --client ID --from AAAA-MM-DD --to AAAA-MM-DD
  integration set --client ID --provider instagram --env NOME_DA_VARIAVEL --ig-user-id N
  integration status
  apikey create --label n8n

Autenticação da CLI: VYVE_CLI_EMAIL e VYVE_CLI_PASSWORD (ou --email/--password).`;

async function cliCtx(values: Record<string, any>): Promise<Ctx> {
  const email = values.email ?? process.env.VYVE_CLI_EMAIL;
  const password = values.password ?? process.env.VYVE_CLI_PASSWORD;
  if (!email || !password) throw new Error("Defina VYVE_CLI_EMAIL e VYVE_CLI_PASSWORD (ou --email/--password)");
  const s = await login(email, password);
  if (!s) throw new Error("Login inválido");
  return { teamId: s.teamId, userId: s.userId, role: s.role };
}

async function main() {
  const argv = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      email: { type: "string" }, password: { type: "string" }, team: { type: "string" }, name: { type: "string" },
      client: { type: "string" }, file: { type: "string" }, kind: { type: "string" }, rights: { type: "string" }, person: { type: "boolean" },
      consent: { type: "string" }, role: { type: "string" }, scope: { type: "string" }, "granted-by": { type: "string" }, evidence: { type: "string" },
      title: { type: "string" }, theme: { type: "string" }, objective: { type: "string" }, mix: { type: "string" }, mode: { type: "string" },
      batch: { type: "string" }, run: { type: "string" }, agent: { type: "string" }, id: { type: "string" }, decision: { type: "string" },
      comment: { type: "string" }, start: { type: "string" }, from: { type: "string" }, to: { type: "string" }, "dry-run": { type: "boolean" },
      segment: { type: "string" }, audience: { type: "string" }, objectives: { type: "string" }, tone: { type: "string" },
      provider: { type: "string" }, env: { type: "string" }, "ig-user-id": { type: "string" }, label: { type: "string" }, voice: { type: "boolean" },
    },
  });
  const [cmd, sub] = positionals;
  const v = values as Record<string, any>;
  const out = (x: unknown) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));

  switch (cmd) {
    case undefined:
    case "help":
      return out(HELP);
    case "db":
      if (sub === "migrate") return out({ aplicadas: await migrate() });
      break;
    case "bootstrap":
      return out({ team_id: await bootstrap(v.team, v.email, v.name, v.password) });
    case "client":
      if (sub === "create") return out(await createClient(await cliCtx(v), { name: v.name, segment: v.segment, audience: v.audience, objectives: v.objectives, tone: v.tone }));
      break;
    case "asset":
      if (sub === "upload") {
        const meta: Record<string, unknown> = {};
        if (v.person) meta.has_person = true;
        if (v.voice) meta.voice_of_person = true;
        if (v.role) meta.role = v.role;
        return out(await uploadAsset(await cliCtx(v), { clientId: v.client, srcPath: v.file, fileName: path.basename(v.file), kind: v.kind, rightsStatus: v.rights, consentId: v.consent ?? null, metadata: meta }));
      }
      break;
    case "consent":
      if (sub === "add") return out(await addConsent(await cliCtx(v), { clientId: v.client, personName: v.person ?? v.name, scope: v.scope, grantedBy: v["granted-by"], evidence: v.evidence }));
      break;
    case "briefing": {
      const ctx = await cliCtx(v);
      const b = await createBriefing(ctx, { clientId: v.client, title: v.title, theme: v.theme, objective: v.objective ?? "", mix: v.mix ? JSON.parse(v.mix) : DEFAULT_MIX });
      const r = await startBatch(ctx, { briefingId: b.id, mode: v.mode as LlmMode | undefined });
      return out({ briefing_id: b.id, batch_id: r.batch.id, created: r.created, mode: r.batch.provider });
    }
    case "worker":
      return runWorker();
    case "drain":
      return out({ etapas: await drain() });
    case "status": {
      const d = await getBatch(await cliCtx(v), v.batch);
      if (!d) throw new Error("Lote não encontrado");
      return out({
        lote: { id: d.batch.id, status: d.batch.status, modo: d.batch.provider, custo_usd: Number(d.batch.cost_usd), ficticio: d.batch.is_fictitious },
        etapas: d.runs.map((r: any) => `${r.status.padEnd(18)} ${r.step}${r.error ? `  (${r.error})` : ""}`),
        pecas: d.pieces.map((p: any) => `${String(p.seq).padStart(2)} ${p.format.padEnd(15)} ${p.stage.padEnd(12)} ${p.production_status.padEnd(18)} ${p.approval}`),
      });
    }
    case "task": {
      const ctx = await cliCtx(v);
      if (sub === "list") return out(await listExternalTasks(ctx, v.agent));
      if (sub === "show") return out(await externalTask(ctx, v.run));
      if (sub === "submit") return out(await submitExternal(ctx, v.run, JSON.parse(fs.readFileSync(v.file, "utf8"))));
      break;
    }
    case "approve": {
      const ctx = await cliCtx(v);
      const decision = (v.decision ?? "aprovado") as any;
      if (sub === "research") return out(await decideResearch(ctx, v.id, decision));
      if (sub === "scripts") {
        const ids = await withCtx(ctx, (tx) => many(tx, "select id from vyve.scripts where batch_id = $1 and approval = 'pendente'", [v.batch]));
        return out(await decideScripts(ctx, ids.map((r) => r.id), decision, v.comment ?? ""));
      }
      if (sub === "piece") return out(await decidePiece(ctx, v.id, decision, v.comment ?? ""));
      break;
    }
    case "calendar":
      return out(await planCalendar(await cliCtx(v), v.client, { startDate: v.start }));
    case "publish-due":
      return out(await publishDue(await cliCtx(v), { dryRun: Boolean(v["dry-run"]) }));
    case "metrics":
      return out(await collectMetrics(await cliCtx(v), v.client));
    case "analyze":
      return out((await analyzePerformance(await cliCtx(v), v.client, { start: v.from, end: v.to })).markdown);
    case "integration": {
      const ctx = await cliCtx(v);
      if (sub === "set") return out(await setIntegration(ctx, { clientId: v.client ?? null, provider: v.provider, secretEnv: v.env, config: v["ig-user-id"] ? { ig_user_id: v["ig-user-id"] } : {} }));
      if (sub === "status") return out(await integrationStatus(ctx));
      break;
    }
    case "apikey":
      if (sub === "create") return out({ token: await createApiKey(await cliCtx(v), v.label ?? "n8n"), aviso: "Guarde agora: o token não é mostrado de novo." });
      break;
  }
  out(HELP);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`Erro: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.argv[2] !== "worker") {
      await stopFileServer();
      await closePool();
    }
  });
