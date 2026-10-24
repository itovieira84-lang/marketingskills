import { withCtx, anonQuery, one, many, maybe, type Ctx } from "./db";
import { assertCan, hashPassword, newApiKey, type Permission } from "./auth";
import { registerBuffer, registerFile, type RegisterAssetInput } from "./storage";
import { config } from "./config";

// ---------------------------------------------------------------- equipe e usuários
export async function bootstrap(team: string, email: string, name: string, password: string): Promise<string> {
  const r = await anonQuery("select vyve.bootstrap_team($1,$2,$3,$4) as id", [team, email.toLowerCase(), name, hashPassword(password)]);
  return r.rows[0].id;
}

export async function createUser(ctx: Ctx, u: { email: string; name: string; password: string; role: string; clientIds?: string[] }) {
  assertCan(ctx, "users.manage");
  return withCtx(ctx, async (tx) => {
    const user = await one(tx, "insert into vyve.users(team_id, email, name, password_hash, role) values ($1,$2,$3,$4,$5) returning id, email, name, role",
      [ctx.teamId, u.email.toLowerCase(), u.name, hashPassword(u.password), u.role]);
    for (const c of u.clientIds ?? []) await tx.query("insert into vyve.client_members(client_id, user_id) values ($1,$2)", [c, user.id]);
    return user;
  });
}

export async function listUsers(ctx: Ctx) {
  return withCtx(ctx, (tx) => many(tx, "select id, email, name, role, active, created_at from vyve.users order by created_at"));
}

export async function createApiKey(ctx: Ctx, label: string) {
  assertCan(ctx, "integrations.manage");
  const k = newApiKey();
  await withCtx(ctx, (tx) => tx.query("insert into vyve.api_keys(team_id, label, key_hash, created_by) values ($1,$2,$3,$4)", [ctx.teamId, label, k.hash, ctx.userId]));
  return k.token; // mostrado uma única vez
}

// ---------------------------------------------------------------- clientes, marca, ativos, consentimentos
export interface ClientInput {
  name: string;
  slug?: string;
  segment?: string;
  audience?: string;
  objectives?: string;
  tone?: string;
  postingFrequency?: Record<string, number>;
  requireResearchApproval?: boolean;
  requireScriptApproval?: boolean;
  batchBudgetUsd?: number;
  timezone?: string;
}

const slugify = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function createClient(ctx: Ctx, c: ClientInput) {
  assertCan(ctx, "client.manage");
  if (!c.name?.trim()) throw new Error("Informe o nome do cliente");
  return withCtx(ctx, async (tx) => {
    const client = await one(tx,
      `insert into vyve.clients(team_id, name, slug, segment, audience, objectives, tone, posting_frequency, require_research_approval, require_script_approval, batch_budget_usd, timezone)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [ctx.teamId, c.name.trim(), c.slug ?? slugify(c.name), c.segment ?? "", c.audience ?? "", c.objectives ?? "", c.tone ?? "",
        JSON.stringify(c.postingFrequency ?? {}), c.requireResearchApproval ?? true, c.requireScriptApproval ?? true, c.batchBudgetUsd ?? 5, c.timezone ?? "America/Sao_Paulo"]);
    await tx.query("insert into vyve.brands(team_id, client_id) values ($1,$2)", [ctx.teamId, client.id]);
    return client;
  });
}

export async function updateClient(ctx: Ctx, clientId: string, c: Partial<ClientInput>) {
  assertCan(ctx, "client.manage");
  const map: Record<string, string> = { name: "name", segment: "segment", audience: "audience", objectives: "objectives", tone: "tone", requireResearchApproval: "require_research_approval", requireScriptApproval: "require_script_approval", batchBudgetUsd: "batch_budget_usd", timezone: "timezone" };
  const sets: string[] = [], vals: unknown[] = [clientId];
  for (const [k, col] of Object.entries(map)) if ((c as any)[k] !== undefined) { vals.push((c as any)[k]); sets.push(`${col} = $${vals.length}`); }
  if (c.postingFrequency) { vals.push(JSON.stringify(c.postingFrequency)); sets.push(`posting_frequency = $${vals.length}`); }
  if (!sets.length) return;
  await withCtx(ctx, (tx) => tx.query(`update vyve.clients set ${sets.join(", ")} where id = $1`, vals));
}

export async function listClients(ctx: Ctx) {
  return withCtx(ctx, (tx) => many(tx,
    `select c.*, (select count(*) from vyve.pieces p where p.client_id = c.id)::int as pieces,
            (select count(*) from vyve.pieces p where p.client_id = c.id and p.approval = 'pendente')::int as awaiting
       from vyve.clients c order by c.name`));
}

export async function getClient(ctx: Ctx, clientId: string) {
  return withCtx(ctx, async (tx) => {
    const client = await maybe(tx, "select * from vyve.clients where id = $1", [clientId]);
    if (!client) return null;
    const brand = await maybe(tx, "select * from vyve.brands where client_id = $1", [clientId]);
    const assets = await many(tx, "select * from vyve.media_assets where client_id = $1 and kind <> 'render' order by created_at desc", [clientId]);
    const consents = await many(tx, "select * from vyve.consents where client_id = $1 order by granted_at desc", [clientId]);
    const integrations = await many(tx, "select provider, status, secret_env, config, last_checked_at, last_error from vyve.integrations where client_id = $1", [clientId]);
    return { client, brand, assets, consents, integrations };
  });
}

export async function updateBrand(ctx: Ctx, clientId: string, b: { colors?: Record<string, string>; fonts?: Record<string, string>; voice?: string; restrictions?: string; visualElements?: string[] }) {
  assertCan(ctx, "brand.edit");
  for (const v of Object.values(b.colors ?? {})) if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`Cor inválida: ${v} (use #RRGGBB)`);
  await withCtx(ctx, (tx) => tx.query(
    `update vyve.brands set colors = coalesce($2, colors), fonts = coalesce($3, fonts), voice = coalesce($4, voice),
       restrictions = coalesce($5, restrictions), visual_elements = coalesce($6, visual_elements), updated_at = now() where client_id = $1`,
    [clientId, b.colors ? JSON.stringify(b.colors) : null, b.fonts ? JSON.stringify(b.fonts) : null, b.voice ?? null, b.restrictions ?? null, b.visualElements ? JSON.stringify(b.visualElements) : null]));
}

export async function addConsent(ctx: Ctx, c: { clientId: string; personName: string; scope: "image" | "voice" | "likeness"; grantedBy: string; evidence: string }) {
  assertCan(ctx, "brand.edit");
  if (!c.evidence?.trim()) throw new Error("Registre a evidência do consentimento (documento, link ou mensagem)");
  return withCtx(ctx, (tx) => one(tx,
    "insert into vyve.consents(team_id, client_id, person_name, scope, granted_by, evidence, recorded_by) values ($1,$2,$3,$4,$5,$6,$7) returning *",
    [ctx.teamId, c.clientId, c.personName, c.scope, c.grantedBy, c.evidence, ctx.userId]));
}

export async function revokeConsent(ctx: Ctx, consentId: string) {
  assertCan(ctx, "brand.edit");
  await withCtx(ctx, (tx) => tx.query("update vyve.consents set revoked_at = now() where id = $1", [consentId]));
}

export type UploadInput = Omit<RegisterAssetInput, "teamId" | "createdBy"> & { srcPath?: string; buffer?: Buffer; fileName: string };

export async function uploadAsset(ctx: Ctx, u: UploadInput) {
  assertCan(ctx, "asset.upload");
  if (u.kind === "render") throw new Error("Arquivos renderizados são criados pelos agentes");
  const MAX = Number(process.env.VYVE_MAX_UPLOAD_MB ?? 500) * 1024 * 1024;
  if (u.buffer && u.buffer.length > MAX) throw new Error("Arquivo acima do limite de upload");
  return withCtx(ctx, async (tx) => {
    const input: RegisterAssetInput = { ...u, teamId: ctx.teamId, createdBy: ctx.userId };
    const asset = u.buffer ? await registerBuffer(tx, u.buffer, u.fileName, input) : await registerFile(tx, u.srcPath!, input, { fileName: u.fileName });
    if (u.kind === "logo") await tx.query("update vyve.brands set logo_asset_id = $2, updated_at = now() where client_id = $1", [u.clientId, asset.id]);
    return asset;
  });
}

export async function getAsset(ctx: Ctx, assetId: string) {
  return withCtx(ctx, (tx) => maybe(tx, "select * from vyve.media_assets where id = $1", [assetId]));
}

export async function updateAssetRights(ctx: Ctx, assetId: string, r: { rightsStatus: string; rightsNotes?: string; consentId?: string | null; hasPerson?: boolean }) {
  assertCan(ctx, "brand.edit");
  await withCtx(ctx, (tx) => tx.query(
    `update vyve.media_assets set rights_status = $2, rights_notes = coalesce($3, rights_notes), consent_id = $4,
       metadata = case when $5::boolean is null then metadata else metadata || jsonb_build_object('has_person', $5::boolean) end where id = $1`,
    [assetId, r.rightsStatus, r.rightsNotes ?? null, r.consentId ?? null, r.hasPerson ?? null]));
}

// ---------------------------------------------------------------- integrações (sem segredos no banco)
export const KNOWN_INTEGRATIONS = [
  { provider: "anthropic", scope: "agency", label: "Anthropic API (agentes de IA)", env: ["ANTHROPIC_API_KEY"], doc: "Chave em console.anthropic.com. Sem ela, use o modo Claude Code." },
  { provider: "transcriber", scope: "agency", label: "Transcrição local (faster-whisper)", env: ["VYVE_TRANSCRIBER"], doc: "pip install faster-whisper; VYVE_TRANSCRIBER=faster-whisper" },
  { provider: "public_media", scope: "agency", label: "URL pública das mídias", env: ["VYVE_PUBLIC_BASE_URL"], doc: "Necessária para a Meta baixar vídeos e imagens na publicação." },
  { provider: "n8n", scope: "agency", label: "n8n (automações)", env: ["N8N_BASE_URL"], doc: "Importe os workflows de n8n/workflows e crie uma chave de API do VYVE." },
  { provider: "supabase", scope: "agency", label: "Supabase (banco)", env: ["DATABASE_URL"], doc: "String de conexão do Postgres do Supabase com o papel vyve_login." },
  { provider: "instagram", scope: "client", label: "Instagram Graph API (publicação e métricas)", env: [], doc: "Token de longa duração em variável de ambiente + ig_user_id; app da Meta aprovado." },
] as const;

export async function setIntegration(ctx: Ctx, i: { clientId?: string | null; provider: string; secretEnv?: string | null; config?: Record<string, unknown> }) {
  assertCan(ctx, "integrations.manage");
  if (i.secretEnv && !/^[A-Z][A-Z0-9_]{2,63}$/.test(i.secretEnv)) throw new Error("Informe o NOME da variável de ambiente (ex.: IG_TOKEN_CLIENTE), nunca o segredo");
  const configured = i.secretEnv ? Boolean(process.env[i.secretEnv]) : false;
  return withCtx(ctx, (tx) => one(tx,
    `insert into vyve.integrations(team_id, client_id, provider, secret_env, config, status)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (team_id, client_id, provider) do update set secret_env = excluded.secret_env, config = excluded.config, status = excluded.status
     returning *`,
    [ctx.teamId, i.clientId ?? null, i.provider, i.secretEnv ?? null, JSON.stringify(i.config ?? {}), configured ? "configured" : "not_configured"]));
}

/** Estado real de cada integração: só "verificada" depois de uma chamada de teste bem-sucedida. */
export async function integrationStatus(ctx: Ctx) {
  const rows = await withCtx(ctx, (tx) => many(tx, "select i.*, c.name as client_name from vyve.integrations i left join vyve.clients c on c.id = i.client_id"));
  const agency = KNOWN_INTEGRATIONS.filter((k) => k.scope === "agency").map((k) => {
    const present = k.env.every((e) => Boolean(process.env[e]));
    const row = rows.find((r) => r.provider === k.provider && !r.client_id);
    return { ...k, client: null, status: row?.status === "verified" ? "verified" : present ? "configured" : "not_configured", last_error: row?.last_error ?? null };
  });
  const perClient = rows.filter((r) => r.client_id).map((r) => ({
    provider: r.provider, scope: "client", label: KNOWN_INTEGRATIONS.find((k) => k.provider === r.provider)?.label ?? r.provider,
    client: r.client_name, status: r.status === "verified" ? "verified" : r.secret_env && process.env[r.secret_env] ? "configured" : "not_configured",
    env: r.secret_env ? [r.secret_env] : [], doc: "", last_error: r.last_error,
  }));
  return [...agency, ...perClient];
}

export async function verifyAnthropic(ctx: Ctx) {
  assertCan(ctx, "integrations.manage");
  let status = "error", err: string | null = null;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    await new Anthropic().models.retrieve(config.model);
    status = "verified";
  } catch (e) {
    err = (e as Error).message;
  }
  await withCtx(ctx, (tx) => tx.query(
    `insert into vyve.integrations(team_id, client_id, provider, status, last_checked_at, last_error) values ($1, null, 'anthropic', $2, now(), $3)
     on conflict (team_id, client_id, provider) do update set status = excluded.status, last_checked_at = now(), last_error = excluded.last_error`, [ctx.teamId, status, err]));
  return { status, error: err };
}

// ---------------------------------------------------------------- consultas do painel
export async function dashboard(ctx: Ctx) {
  return withCtx(ctx, async (tx) => ({
    stages: await many(tx, "select stage, count(*)::int as n from vyve.pieces group by stage"),
    production: await many(tx, "select production_status, count(*)::int as n from vyve.pieces group by production_status"),
    awaiting: (await one(tx, "select count(*)::int as n from vyve.pieces where approval = 'pendente'")).n as number,
    batches: await many(tx, "select b.*, c.name as client_name, br.title from vyve.batches b join vyve.clients c on c.id = b.client_id join vyve.briefings br on br.id = b.briefing_id order by b.created_at desc limit 8"),
    month: await one(tx, "select coalesce(sum(usd),0)::float as usd, count(*)::int as calls from vyve.api_costs where date_trunc('month', at) = date_trunc('month', now())"),
    upcoming: await many(tx, "select e.*, p.title, p.format, c.name as client_name from vyve.calendar_entries e join vyve.pieces p on p.id = e.piece_id join vyve.clients c on c.id = e.client_id where e.scheduled_for >= now() order by e.scheduled_for limit 6"),
    errors: await many(tx, "select * from vyve.logs where level = 'error' order by at desc limit 5"),
  }));
}

export async function listBriefings(ctx: Ctx, clientId?: string) {
  return withCtx(ctx, (tx) => many(tx,
    `select b.*, c.name as client_name, (select id from vyve.batches x where x.briefing_id = b.id order by created_at desc limit 1) as batch_id
       from vyve.briefings b join vyve.clients c on c.id = b.client_id where ($1::uuid is null or b.client_id = $1) order by b.created_at desc`, [clientId ?? null]));
}

export async function getBatch(ctx: Ctx, batchId: string) {
  return withCtx(ctx, async (tx) => {
    const batch = await maybe(tx, "select b.*, c.name as client_name, br.title, br.theme from vyve.batches b join vyve.clients c on c.id = b.client_id join vyve.briefings br on br.id = b.briefing_id where b.id = $1", [batchId]);
    if (!batch) return null;
    return {
      batch,
      runs: await many(tx, "select id, agent, step, status, attempt, max_attempts, error, output, started_at, finished_at from vyve.agent_runs where batch_id = $1 order by created_at, step", [batchId]),
      research: await maybe(tx, "select * from vyve.research where batch_id = $1 order by created_at desc limit 1", [batchId]),
      pieces: await many(tx, "select p.*, s.payload, s.approval as script_approval, s.id as script_id from vyve.pieces p left join vyve.scripts s on s.id = p.script_id where p.batch_id = $1 order by p.seq", [batchId]),
      logs: await many(tx, "select * from vyve.logs where batch_id = $1 order by at desc limit 200", [batchId]),
      costs: await many(tx, "select provider, model, sum(input_tokens)::int as input_tokens, sum(output_tokens)::int as output_tokens, sum(web_searches)::int as web_searches, sum(usd)::float as usd from vyve.api_costs where batch_id = $1 group by provider, model", [batchId]),
    };
  });
}

export async function listBatches(ctx: Ctx) {
  return withCtx(ctx, (tx) => many(tx, "select b.*, c.name as client_name, br.title from vyve.batches b join vyve.clients c on c.id = b.client_id join vyve.briefings br on br.id = b.briefing_id order by b.created_at desc limit 50"));
}

export async function listPieces(ctx: Ctx, f: { clientId?: string; formats?: string[]; approval?: string; batchId?: string } = {}) {
  return withCtx(ctx, (tx) => many(tx,
    `select p.*, c.name as client_name, s.payload from vyve.pieces p join vyve.clients c on c.id = p.client_id left join vyve.scripts s on s.id = p.script_id
      where ($1::uuid is null or p.client_id = $1) and ($2::text[] is null or p.format::text = any($2)) and ($3::text is null or p.approval = $3)
        and ($4::uuid is null or p.batch_id = $4)
      order by p.created_at desc, p.seq limit 300`, [f.clientId ?? null, f.formats ?? null, f.approval ?? null, f.batchId ?? null]));
}

export async function getPiece(ctx: Ctx, pieceId: string) {
  return withCtx(ctx, async (tx) => {
    const piece = await maybe(tx, "select p.*, c.name as client_name from vyve.pieces p join vyve.clients c on c.id = p.client_id where p.id = $1", [pieceId]);
    if (!piece) return null;
    return {
      piece,
      script: piece.script_id ? await maybe(tx, "select * from vyve.scripts where id = $1", [piece.script_id]) : null,
      assets: await many(tx, "select * from vyve.media_assets where id = any($1::uuid[]) order by label", [piece.output_asset_ids]),
      history: await many(tx, "select h.*, u.name as user_name from vyve.piece_history h left join vyve.users u on u.id = h.actor_user_id where piece_id = $1 order by at", [pieceId]),
      approvals: await many(tx, "select a.*, u.name as user_name from vyve.approvals a left join vyve.users u on u.id = a.decided_by where piece_id = $1 order by requested_at", [pieceId]),
      publications: await many(tx, "select * from vyve.publications where piece_id = $1 order by created_at", [pieceId]),
    };
  });
}

export async function listIdeas(ctx: Ctx, clientId?: string) {
  return withCtx(ctx, (tx) => many(tx, "select i.*, c.name as client_name from vyve.ideas i join vyve.clients c on c.id = i.client_id where ($1::uuid is null or i.client_id = $1) order by i.created_at desc limit 200", [clientId ?? null]));
}

export async function listScripts(ctx: Ctx, f: { batchId?: string; approval?: string } = {}) {
  return withCtx(ctx, (tx) => many(tx,
    "select s.*, c.name as client_name from vyve.scripts s join vyve.clients c on c.id = s.client_id where ($1::uuid is null or s.batch_id = $1) and ($2::text is null or s.approval = $2) order by s.created_at desc limit 300",
    [f.batchId ?? null, f.approval ?? null]));
}

export async function pendingResearch(ctx: Ctx) {
  return withCtx(ctx, (tx) => many(tx, "select r.id, r.batch_id, r.created_at, r.is_fictitious, c.name as client_name, b.title from vyve.research r join vyve.clients c on c.id = r.client_id join vyve.briefings b on b.id = r.briefing_id where r.approval = 'pendente' order by r.created_at"));
}

export async function calendar(ctx: Ctx, f: { from: string; to: string; clientId?: string }) {
  return withCtx(ctx, (tx) => many(tx,
    `select e.*, p.title, p.format, p.seq, p.preview_asset_id, c.name as client_name from vyve.calendar_entries e join vyve.pieces p on p.id = e.piece_id join vyve.clients c on c.id = e.client_id
      where e.scheduled_for between $1 and $2 and ($3::uuid is null or e.client_id = $3) order by e.scheduled_for`, [f.from, f.to, f.clientId ?? null]));
}

export async function listPublications(ctx: Ctx) {
  return withCtx(ctx, (tx) => many(tx,
    `select pub.*, p.title, p.format, p.seq, c.name as client_name, u.name as approver_name from vyve.publications pub join vyve.pieces p on p.id = pub.piece_id
       join vyve.clients c on c.id = pub.client_id left join vyve.users u on u.id = pub.approved_by order by pub.created_at desc limit 200`));
}

export async function costSummary(ctx: Ctx) {
  assertCan(ctx, "costs.view" as Permission);
  return withCtx(ctx, async (tx) => ({
    byMonth: await many(tx, "select to_char(date_trunc('month', at), 'YYYY-MM') as month, provider, sum(usd)::float as usd, sum(input_tokens)::int as input_tokens, sum(output_tokens)::int as output_tokens, sum(web_searches)::int as web_searches, count(*)::int as calls from vyve.api_costs group by 1,2 order by 1 desc"),
    byClient: await many(tx, "select c.name, sum(a.usd)::float as usd, count(*)::int as calls from vyve.api_costs a join vyve.clients c on c.id = a.client_id group by c.name order by usd desc"),
    byAgent: await many(tx, "select r.agent, sum(a.usd)::float as usd, count(*)::int as calls from vyve.api_costs a join vyve.agent_runs r on r.id = a.agent_run_id group by r.agent order by usd desc"),
    team: await one(tx, "select monthly_budget_usd::float from vyve.teams where id = $1", [ctx.teamId]),
  }));
}

export async function listLearnings(ctx: Ctx, clientId?: string) {
  return withCtx(ctx, (tx) => many(tx, "select l.*, c.name as client_name from vyve.learnings l join vyve.clients c on c.id = l.client_id where ($1::uuid is null or l.client_id = $1) order by l.created_at desc limit 100", [clientId ?? null]));
}

export async function addCommercialDate(ctx: Ctx, d: { clientId?: string | null; date: string; label: string; kind: "comercial" | "bloqueio" | "campanha" }) {
  assertCan(ctx, "calendar.schedule");
  return withCtx(ctx, (tx) => one(tx, "insert into vyve.commercial_dates(team_id, client_id, date, label, kind) values ($1,$2,$3,$4,$5) returning *", [ctx.teamId, d.clientId ?? null, d.date, d.label, d.kind]));
}
