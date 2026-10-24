import { withCtx, one } from "../db";
import { config } from "../config";
import { FORMAT_LABEL, StrategyOutput, type Format, type ScriptPiece } from "../schemas";
import { clientProfile, latestResearch, recordHistory, type LlmStep } from "./common";
import { log } from "../logging";

const SYSTEM = `Você é o Agente 02 (Estratégia e Roteiros) do VYVE Content Engine.
Transforme o briefing estratégico em conteúdos atrativos e prontos para produção.
Regras:
- Cada peça tem uma ABORDAGEM diferente (ângulo, estrutura, emoção), não apenas palavras trocadas.
- Ganchos fortes nos primeiros 2 segundos (vídeo) ou na capa (estáticos).
- Use apenas fatos que estão no briefing estratégico; cite as URLs usadas em references.
- Não prometa resultados garantidos, curas, renda ou números que não estejam nas fontes.
- Não escreva falas atribuídas a pessoas reais que elas não disseram.
- Pontuações (1 a 5) são estimativas qualitativas de potencial, não previsões.
- Adapte a linguagem ao tom de voz do cliente. Português do Brasil.`;

const FORMAT_RULES: Record<Format, string> = {
  reel: "Reels verticais. beats = cenas com segundos, fala e texto de tela. Durações conforme pedido.",
  long_video: "Vídeo longo horizontal (3 a 8 minutos). beats = blocos com segundos.",
  carousel: "Carrossel de 5 a 8 slides. beats = slides (seconds 0). Slide 1 é a capa com o gancho; último slide tem o CTA.",
  card: "Card estático único. 1 beat com frase principal curta (até 12 palavras) e texto de apoio.",
  story_sequence: "Sequência de 3 a 6 Stories. beats = stories (5 s cada) com uma interação (enquete, caixinha, quiz) em pelo menos um.",
  newsletter: "Conteúdo de relacionamento/newsletter. beats = seções do texto (seconds 0), texto completo em voiceover.",
  authority_post: "Post de autoridade (texto longo de legenda + arte). 1 a 3 beats.",
};

export function reelDurations(count: number): number[] {
  const cycle = [15, 30, 45, 60];
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length]);
}

export const strategyStep: LlmStep<StrategyOutput> = {
  agent: "estrategia",
  schemaName: "strategy",
  async build(bc) {
    const { format, count } = bc.run.input as { format: Format; count: number };
    const research = await withCtx(bc.ctx, (tx) => latestResearch(tx, bc.batch.id));
    if (!research) throw new Error("Briefing estratégico (pesquisa) não encontrado para este lote");
    const durations = format === "reel" ? `Durações pedidas, na ordem: ${reelDurations(count).join(", ")} segundos.` : "";
    const prompt = [
      "## Perfil do cliente",
      clientProfile(bc.client, bc.brand),
      "",
      "## Briefing",
      `Tema: ${bc.briefing.theme}`,
      `Objetivo comercial: ${bc.briefing.objective || "(não informado)"}`,
      "",
      "## Briefing estratégico verificado (Agente 01)",
      JSON.stringify(research.payload),
      "",
      "## Tarefa",
      `Crie exatamente ${count} peça(s) do formato "${FORMAT_LABEL[format]}" (format = "${format}").`,
      FORMAT_RULES[format],
      durations,
      "Distribua as peças entre as etapas do funil e entre as abordagens do briefing.",
      "Inclua instruções visuais e, quando houver gravação, instruções de captação (enquadramento, luz, o que gravar).",
    ].join("\n");
    return {
      agent: "estrategia",
      system: SYSTEM,
      prompt,
      schema: StrategyOutput,
      schemaName: "strategy",
      model: config.bulkModel,
      effort: "medium",
      maxTokens: 64000,
      meta: { format, count, theme: bc.briefing.theme },
    };
  },
  async finish(bc, result) {
    const { format, count, seqStart } = bc.run.input as { format: Format; count: number; seqStart: number };
    let pieces: ScriptPiece[] = result.data.pieces.filter((p) => p.format === format);
    if (pieces.length < count) throw new Error(`Roteirista devolveu ${pieces.length} de ${count} peças de ${format}`);
    pieces = pieces.slice(0, count);

    return withCtx(bc.ctx, async (tx) => {
      const research = await latestResearch(tx, bc.batch.id);
      const allowed = new Set<string>((research?.sources ?? []).map((s: any) => String(s.url)));
      const approval = bc.client.require_script_approval ? "pendente" : "dispensada";
      const ids: string[] = [];
      for (let i = 0; i < pieces.length; i++) {
        const p = { ...pieces[i] };
        const dropped = p.references.filter((u) => !allowed.has(u));
        p.references = p.references.filter((u) => allowed.has(u));
        const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
        p.scores = { authority: clamp(p.scores.authority), engagement: clamp(p.scores.engagement), shareability: clamp(p.scores.shareability), conversion: clamp(p.scores.conversion) };
        const idea = await one(tx,
          `insert into vyve.ideas(team_id, client_id, briefing_id, batch_id, title, angle, format, funnel_stage, scores)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [bc.batch.team_id, bc.client.id, bc.briefing.id, bc.batch.id, p.title, p.angle, format, p.funnel_stage, JSON.stringify(p.scores)]);
        const script = await one(tx,
          `insert into vyve.scripts(team_id, client_id, briefing_id, batch_id, idea_id, format, payload, approval)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [bc.batch.team_id, bc.client.id, bc.briefing.id, bc.batch.id, idea.id, format, JSON.stringify({ ...p, dropped_references: dropped }), approval]);
        const piece = await one(tx,
          `insert into vyve.pieces(team_id, client_id, briefing_id, batch_id, script_id, seq, format, title, stage, caption, metadata)
           values ($1,$2,$3,$4,$5,$6,$7,$8,'ROTEIRO',$9,$10)
           on conflict (batch_id, seq) do update set script_id = excluded.script_id, title = excluded.title, caption = excluded.caption
           returning id, team_id, client_id`,
          [bc.batch.team_id, bc.client.id, bc.briefing.id, bc.batch.id, script.id, seqStart + i, format, p.title,
            [p.caption, p.hashtags.join(" ")].filter(Boolean).join("\n\n"), JSON.stringify({ fictitious: result.isFictitious })]);
        await recordHistory(tx, piece, null, "ROTEIRO", { agent: "estrategia" }, "Roteiro criado");
        ids.push(piece.id);
      }
      await log(tx, { teamId: bc.batch.team_id, clientId: bc.client.id, batchId: bc.batch.id, runId: bc.run.id }, "info",
        "roteiros.concluidos", `${ids.length} roteiro(s) de ${FORMAT_LABEL[format]} criados.`);
      return { pieces: ids.length };
    });
  },
};
