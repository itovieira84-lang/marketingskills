import { withCtx, many, maybe, type Ctx } from "../db";
import { log } from "../logging";
import { igCredentialsFromEnv, InstagramGraph } from "../integrations/instagram";
import { recordHistory } from "./common";

const METRIC_FIELDS = ["reach", "views", "avg_watch_time_s", "retention_pct", "shares", "saves", "comments", "likes", "interactions", "clicks", "conversions"] as const;
type MetricField = (typeof METRIC_FIELDS)[number];

/**
 * Coleta métricas das publicações com integração oficial autorizada.
 * Sem credenciais, não coleta nada e registra o motivo — nunca estima.
 */
export async function collectMetrics(ctx: Ctx, clientId: string, opts: { fetchImpl?: typeof fetch } = {}) {
  return withCtx(ctx, async (tx) => {
    const integration = await maybe(tx, "select * from vyve.integrations where client_id = $1 and provider = 'instagram'", [clientId]);
    const creds = igCredentialsFromEnv(integration);
    const pubs = await many(tx, "select * from vyve.publications where client_id = $1 and status = 'publicado' and external_id is not null", [clientId]);
    if (!creds) {
      await log(tx, { teamId: ctx.teamId, clientId }, "warn", "metricas.nao_configurado", "Coleta não executada: credenciais do Instagram ausentes.");
      return { collected: 0, reason: "credenciais ausentes" };
    }
    const ig = new InstagramGraph(creds, opts.fetchImpl);
    let collected = 0;
    for (const p of pubs) {
      const j = await ig.insights(p.external_id);
      const v = (name: string) => j.data?.find((m: any) => m.name === name)?.values?.[0]?.value ?? null;
      await tx.query(
        `insert into vyve.metrics(team_id, client_id, publication_id, source, reach, views, saves, shares, comments, likes, interactions, raw)
         values ($1,$2,$3,'instagram_graph',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [ctx.teamId, clientId, p.id, v("reach"), v("views"), v("saved"), v("shares"), v("comments"), v("likes"), v("total_interactions"), JSON.stringify(j)]);
      collected++;
    }
    await log(tx, { teamId: ctx.teamId, clientId }, "info", "metricas.coletadas", `${collected} publicação(ões) atualizadas.`);
    return { collected };
  });
}

/** Importação manual de métricas (ex.: exportação do Meta Business Suite). */
export async function importMetrics(ctx: Ctx, rows: Array<{ publicationId: string; source: string } & Partial<Record<MetricField, number>>>) {
  return withCtx(ctx, async (tx) => {
    let n = 0;
    for (const r of rows) {
      const pub = await maybe(tx, "select id, client_id, piece_id from vyve.publications where id = $1", [r.publicationId]);
      if (!pub) throw new Error(`Publicação ${r.publicationId} não encontrada`);
      await tx.query(
        `insert into vyve.metrics(team_id, client_id, publication_id, source, ${METRIC_FIELDS.join(", ")}, raw)
         values ($1,$2,$3,$4, ${METRIC_FIELDS.map((_, i) => `$${i + 5}`).join(", ")}, $${METRIC_FIELDS.length + 5})`,
        [ctx.teamId, pub.client_id, pub.id, r.source, ...METRIC_FIELDS.map((f) => r[f] ?? null), JSON.stringify(r)]);
      const piece = await maybe(tx, "select id, team_id, client_id, stage from vyve.pieces where id = $1", [pub.piece_id]);
      if (piece && piece.stage !== "ANALISE") {
        await tx.query("update vyve.pieces set stage = 'ANALISE', updated_at = now() where id = $1", [piece.id]);
        await recordHistory(tx, piece, piece.stage, "ANALISE", { userId: ctx.userId, agent: "analise" }, `Métricas importadas (${r.source})`);
      }
      n++;
    }
    return { imported: n };
  });
}

export interface PerformanceReport {
  clientId: string;
  period: { start: string; end: string };
  hasData: boolean;
  publications: number;
  byFormat: Array<{ format: string; n: number; avgReach: number | null; saveRate: number | null; shareRate: number | null; avgRetention: number | null }>;
  byFunnel: Array<{ funnel: string; n: number; avgReach: number | null; saveRate: number | null }>;
  top: Array<{ seq: number; title: string; format: string; reach: number | null; saves: number | null; shares: number | null; source: string }>;
  patterns: string[];
  hypotheses: Array<{ text: string; caveat: string }>;
  recommendations: string[];
  sources: string[];
  markdown: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

/**
 * Agente 06: relatório por cliente/formato/período a partir de métricas REAIS
 * gravadas. Sem dados, o relatório diz isso e não traz números.
 */
export async function analyzePerformance(ctx: Ctx, clientId: string, period: { start: string; end: string }): Promise<PerformanceReport> {
  return withCtx(ctx, async (tx) => {
    const rows = await many(tx,
      `select distinct on (m.publication_id) m.*, p.seq, p.title, p.format, s.payload->>'funnel_stage' as funnel, s.payload->>'angle' as angle
         from vyve.metrics m join vyve.publications pub on pub.id = m.publication_id
         join vyve.pieces p on p.id = pub.piece_id left join vyve.scripts s on s.id = p.script_id
        where m.client_id = $1 and coalesce(pub.published_at, m.collected_at)::date between $2::date and $3::date
        order by m.publication_id, m.collected_at desc`, [clientId, period.start, period.end]);
    const base = { clientId, period, publications: rows.length, sources: [...new Set(rows.map((r: any) => r.source))] };
    if (!rows.length) {
      const markdown = `# Relatório de desempenho\n\nPeríodo ${period.start} a ${period.end}: **sem métricas registradas**. Nenhum número foi estimado.\n\nPara gerar o relatório: conecte a integração oficial (Instagram Graph API) ou importe as métricas exportadas do Meta Business Suite.`;
      await log(tx, { teamId: ctx.teamId, clientId }, "info", "analise.sem_dados", "Relatório sem dados: nada estimado.");
      return { ...base, hasData: false, byFormat: [], byFunnel: [], top: [], patterns: [], hypotheses: [], recommendations: [], markdown };
    }
    const groupBy = <K extends string>(key: (r: any) => K) => {
      const m = new Map<K, any[]>();
      for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
      return m;
    };
    const rate = (list: any[], f: string) => avg(list.filter((r) => r.reach > 0 && r[f] !== null).map((r) => r[f] / r.reach));
    const byFormat = [...groupBy((r) => r.format)].map(([format, list]) => ({
      format, n: list.length,
      avgReach: avg(list.filter((r) => r.reach !== null).map((r) => r.reach)),
      saveRate: rate(list, "saves"), shareRate: rate(list, "shares"),
      avgRetention: avg(list.filter((r) => r.retention_pct !== null).map((r) => Number(r.retention_pct))),
    })).sort((a, b) => (b.avgReach ?? 0) - (a.avgReach ?? 0));
    const byFunnel = [...groupBy((r) => r.funnel ?? "sem_funil")].map(([funnel, list]) => ({ funnel, n: list.length, avgReach: avg(list.filter((r) => r.reach !== null).map((r) => r.reach)), saveRate: rate(list, "saves") }));
    const top = [...rows].sort((a, b) => (b.saves ?? 0) + (b.shares ?? 0) - ((a.saves ?? 0) + (a.shares ?? 0))).slice(0, 5)
      .map((r) => ({ seq: r.seq, title: r.title, format: r.format, reach: r.reach, saves: r.saves, shares: r.shares, source: r.source }));

    const patterns: string[] = [];
    const hypotheses: Array<{ text: string; caveat: string }> = [];
    const recommendations: string[] = [];
    const comparable = byFormat.filter((f) => f.n >= 3 && f.saveRate !== null);
    if (comparable.length >= 2) {
      const best = [...comparable].sort((a, b) => (b.saveRate ?? 0) - (a.saveRate ?? 0))[0];
      patterns.push(`${best.format} teve a maior taxa de salvamento (${pct(best.saveRate)}) entre formatos com pelo menos 3 publicações.`);
      hypotheses.push({ text: `O formato ${best.format} pode gerar mais salvamentos para este público.`, caveat: "Correlação observada; tema, horário e gancho também variaram. Validar com teste A/B do mesmo tema em formatos diferentes." });
      recommendations.push(`No próximo briefing, testar o mesmo tema em ${best.format} e em outro formato, mantendo horário e gancho.`);
    } else {
      patterns.push("Amostra pequena: menos de 3 publicações por formato. Ainda não há padrão confiável.");
      recommendations.push("Manter a coleta por mais 2 a 4 semanas antes de mudar a estratégia com base nestes números.");
    }
    if (top[0]) recommendations.push(`Reaproveitar a abordagem da peça ${top[0].seq} ("${top[0].title}") em uma nova variação.`);

    const md = [
      `# Relatório de desempenho`, "", `Período ${period.start} a ${period.end} · ${rows.length} publicação(ões) · fontes: ${base.sources.join(", ")}`, "",
      "## Por formato", "| Formato | Publicações | Alcance médio | Taxa de salvamento | Taxa de compartilhamento |", "|---|---|---|---|---|",
      ...byFormat.map((f) => `| ${f.format} | ${f.n} | ${f.avgReach?.toFixed(0) ?? "—"} | ${pct(f.saveRate)} | ${pct(f.shareRate)} |`), "",
      "## Melhores peças (salvamentos + compartilhamentos)", ...top.map((t) => `- Peça ${t.seq} — ${t.title} (${t.format}): alcance ${t.reach ?? "—"}, salvamentos ${t.saves ?? "—"}, compartilhamentos ${t.shares ?? "—"}`), "",
      "## Padrões", ...patterns.map((p) => `- ${p}`), "",
      "## Hipóteses (correlação, não causalidade)", ...hypotheses.map((h) => `- ${h.text} _(${h.caveat})_`), "",
      "## Recomendações para o próximo briefing", ...recommendations.map((r) => `- ${r}`),
    ].join("\n");

    for (const p of patterns) await tx.query("insert into vyve.learnings(team_id, client_id, period_start, period_end, insight, kind, evidence) values ($1,$2,$3,$4,$5,'padrao',$6)", [ctx.teamId, clientId, period.start, period.end, p, JSON.stringify({ byFormat })]);
    for (const h of hypotheses) await tx.query("insert into vyve.learnings(team_id, client_id, period_start, period_end, insight, kind, evidence) values ($1,$2,$3,$4,$5,'hipotese',$6)", [ctx.teamId, clientId, period.start, period.end, `${h.text} (${h.caveat})`, JSON.stringify({})]);
    for (const r of recommendations) await tx.query("insert into vyve.learnings(team_id, client_id, period_start, period_end, insight, kind, evidence) values ($1,$2,$3,$4,$5,'recomendacao',$6)", [ctx.teamId, clientId, period.start, period.end, r, JSON.stringify({})]);
    await log(tx, { teamId: ctx.teamId, clientId }, "info", "analise.concluida", `Relatório com ${rows.length} publicação(ões); aprendizados enviados à pesquisa.`);
    return { ...base, hasData: true, byFormat, byFunnel, top, patterns, hypotheses, recommendations, markdown: md };
  });
}
