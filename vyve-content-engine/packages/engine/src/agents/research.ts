import { withCtx } from "../db";
import { config } from "../config";
import { ResearchOutput } from "../schemas";
import { verifyResearch, researchReport } from "../sources";
import { clientLearnings, clientProfile, type LlmStep } from "./common";
import { log } from "../logging";

const SYSTEM = `Você é o Agente 01 (Inteligência e Pesquisa) do VYVE Content Engine, uma agência de marketing.
Transforme um tema num briefing estratégico baseado em dados verificáveis.
Regras inegociáveis:
- Nunca invente pesquisas, comentários, tendências, depoimentos, números ou métricas.
- Toda afirmação de fato, tendência, dúvida do público, concorrente ou objeção precisa de URL de fonte real em source_urls.
- Se não encontrou fonte, escreva como hipótese (hypotheses) e diga por quê.
- Separe fatos, opiniões e hipóteses. Indique o nível de confiança.
- Priorize fontes recentes (últimos 12 meses) e em português do Brasil quando o público for brasileiro.
- Responda em português do Brasil.`;

export const researchStep: LlmStep<ResearchOutput> = {
  agent: "pesquisa",
  schemaName: "research",
  async build(bc) {
    const learnings = await withCtx(bc.ctx, (tx) => clientLearnings(tx, bc.client.id));
    const prompt = [
      "## Perfil do cliente",
      clientProfile(bc.client, bc.brand),
      "",
      "## Briefing recebido",
      `Título: ${bc.briefing.title}`,
      `Tema: ${bc.briefing.theme}`,
      `Objetivo: ${bc.briefing.objective || "(não informado)"}`,
      bc.briefing.body ? `Detalhes:\n${bc.briefing.body}` : "",
      "",
      "## Aprendizados acumulados de conteúdos anteriores (dados reais do cliente)",
      learnings.length ? learnings.map((l: any) => `- [${l.kind}] ${l.insight}`).join("\n") : "(ainda não há aprendizados registrados)",
      "",
      "## Tarefa",
      "Pesquise: tendências recentes do segmento; dúvidas reais do público (fóruns, comentários públicos, buscas);",
      "concorrentes e referências públicas; oportunidades de conteúdo; perguntas frequentes e objeções;",
      "abordagens diferentes para a mesma ideia; palavras-chave; oportunidades de conversão.",
      "Liste as fontes usadas com título, veículo e data de publicação quando houver.",
      `Data de hoje: ${new Date().toISOString().slice(0, 10)}.`,
    ].filter((l) => l !== undefined).join("\n");
    return {
      agent: "pesquisa",
      system: SYSTEM,
      prompt,
      schema: ResearchOutput,
      schemaName: "research",
      model: config.model,
      webSearch: { maxUses: Number(process.env.VYVE_RESEARCH_MAX_SEARCHES ?? 8) },
      effort: "high",
      maxTokens: 32000,
      meta: { theme: bc.briefing.theme, clientName: bc.client.name },
    };
  },
  async finish(bc, result) {
    const fictitious = result.isFictitious;
    const verified = await verifyResearch(result.data, result.retrievedSources, {
      fictitious,
      checkHttp: !fictitious && process.env.VYVE_SKIP_SOURCE_CHECK !== "1",
    });
    const report = researchReport(verified, { clientName: bc.client.name, fictitious });
    return withCtx(bc.ctx, async (tx) => {
      const approval = bc.client.require_research_approval ? "pendente" : "dispensada";
      const r = await tx.query(
        `insert into vyve.research(team_id, client_id, briefing_id, batch_id, payload, report_md, sources, dropped_claims, provider, is_fictitious, approval)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [bc.batch.team_id, bc.client.id, bc.briefing.id, bc.batch.id, JSON.stringify(verified.research), report,
          JSON.stringify(verified.sources), JSON.stringify(verified.dropped), result.provider, fictitious, approval],
      );
      await log(tx, { teamId: bc.batch.team_id, clientId: bc.client.id, batchId: bc.batch.id, runId: bc.run.id }, verified.dropped.length ? "warn" : "info",
        "pesquisa.concluida", `Briefing estratégico com ${verified.sources.length} fontes verificadas; ${verified.dropped.length} afirmações descartadas por falta de fonte.`,
        { research_id: r.rows[0].id });
      return { research_id: r.rows[0].id, sources: verified.sources.length, dropped: verified.dropped.length };
    });
  },
};
