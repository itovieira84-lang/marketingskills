import type { LlmProvider, LlmResult, LlmTask } from "./types";
import type { ResearchOutput, ScriptPiece, StrategyOutput, AnalysisNarrative, Format } from "../schemas";

/**
 * Provedor de TESTE. Gera saídas determinísticas e marca tudo como fictício
 * (is_fictitious = true no banco e selo "DADOS FICTÍCIOS" no painel).
 * Nunca deve ser usado para conteúdo real de cliente.
 */
export class FixtureProvider implements LlmProvider {
  readonly name = "fixture" as const;

  async run<T>(task: LlmTask<T>): Promise<LlmResult<T>> {
    let data: unknown;
    const theme = task.meta?.theme ?? "tema de teste";
    if (task.schemaName === "research") data = fakeResearch(theme);
    else if (task.schemaName === "strategy") data = fakeStrategy(theme, task.meta?.format as Format, task.meta?.count ?? 1);
    else if (task.schemaName === "analysis") data = fakeAnalysis();
    else throw new Error(`FixtureProvider não conhece o esquema ${task.schemaName}`);
    return {
      data: task.schema.parse(data),
      usage: [{ provider: "fixture", model: "fixture", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, web_searches: 0, usd: 0 }],
      retrievedSources: task.webSearch ? [{ url: "https://example.com/fonte-ficticia-1", title: "[FICTÍCIO] Fonte de teste 1" }] : null,
      provider: this.name,
      isFictitious: true,
    };
  }
}

const F = "[FICTÍCIO]";

function fakeResearch(theme: string): ResearchOutput {
  const src = "https://example.com/fonte-ficticia-1";
  return {
    theme,
    segment: `${F} segmento de teste`,
    executive_summary: `${F} Resumo de teste sobre "${theme}". Nenhum dado aqui é real.`,
    trends: [
      { title: `${F} Tendência com fonte`, summary: "Exemplo de tendência sustentada por fonte.", evidence_type: "fato", confidence: "media", source_urls: [src] },
      { title: `${F} Tendência sem fonte`, summary: "Deve ser descartada pelo verificador de fontes.", evidence_type: "fato", confidence: "alta", source_urls: ["https://inventada.invalid/nao-existe"] },
    ],
    audience_questions: [{ question: `${F} Como começar com ${theme}?`, where_seen: "fonte de teste", confidence: "media", source_urls: [src] }],
    competitors: [{ name: `${F} Concorrente A`, profile_url: "https://example.com/concorrente-a", observation: "Perfil de teste.", source_urls: [src] }],
    opportunities: [{ title: `${F} Explicar o básico de ${theme}`, why: "Dúvida recorrente nos dados de teste.", format_suggestion: "carrossel", source_urls: [src] }],
    faqs_objections: [{ text: `${F} "Não tenho tempo para isso"`, kind: "objecao", source_urls: [src] }],
    approaches: [
      { name: "Erro comum", description: "Mostrar o erro mais comum e como evitar." },
      { name: "Bastidores", description: "Mostrar o processo real." },
      { name: "Mito x verdade", description: "Desmontar uma crença." },
    ],
    keywords: [theme, `${theme} para iniciantes`],
    conversion_opportunities: [{ description: `${F} Oferecer material gratuito`, cta_idea: "Comente QUERO" }],
    facts: [{ claim: `${F} Fato de teste com fonte`, source_urls: [src] }],
    opinions: [{ claim: `${F} Opinião de teste`, source_urls: [src] }],
    hypotheses: [{ claim: `${F} Hipótese de teste`, rationale: "Sem dados; precisa validar." }],
    recommendations: [`${F} Priorizar conteúdo educativo no topo do funil.`],
    sources: [{ url: src, title: "[FICTÍCIO] Fonte de teste 1", publisher: "example.com", published_at: "" }],
    limitations: ["Pesquisa gerada pelo provedor de teste: não usar com cliente."],
  };
}

const ANGLES = ["Erro comum", "Bastidores", "Mito x verdade", "Passo a passo", "História pessoal", "Antes e depois", "Lista rápida", "Pergunta do público", "Opinião forte", "Checklist"];

function beatsFor(format: Format, title: string) {
  switch (format) {
    case "reel":
    case "long_video":
      return [
        { label: "Gancho", seconds: 3, voiceover: `${title}: você está fazendo isso errado?`, on_screen_text: "Você faz isso?", visual: "Close no rosto, texto grande" },
        { label: "Cena 2", seconds: 9, voiceover: "Explique o problema em uma frase.", on_screen_text: "O problema", visual: "Plano médio" },
        { label: "Cena 3", seconds: 12, voiceover: "Mostre a solução prática.", on_screen_text: "A solução", visual: "Demonstração" },
        { label: "CTA", seconds: 6, voiceover: "Salve para lembrar.", on_screen_text: "Salve este vídeo", visual: "Rosto + texto" },
      ];
    case "carousel":
      return Array.from({ length: 6 }, (_, i) => ({
        label: `Slide ${i + 1}`,
        seconds: 0,
        voiceover: i === 0 ? title : i === 5 ? "Salve e compartilhe com quem precisa." : `Ponto ${i}: explicação curta e concreta.`,
        on_screen_text: i === 0 ? title : i === 5 ? "Salve para depois" : `Ponto ${i}`,
        visual: i === 0 ? "Capa com título grande" : "Texto com hierarquia clara",
      }));
    case "story_sequence":
      return Array.from({ length: 4 }, (_, i) => ({
        label: `Story ${i + 1}`,
        seconds: 5,
        voiceover: ["Enquete: você já passou por isso?", "O que quase ninguém fala.", "A dica prática.", "Responda a caixinha."][i],
        on_screen_text: ["Já passou por isso?", "O que ninguém fala", "A dica", "Me conta"][i],
        visual: "Fundo da marca + figurinha de interação",
      }));
    case "newsletter":
      return [
        { label: "Abertura", seconds: 0, voiceover: `Esta semana: ${title}.`, on_screen_text: "", visual: "" },
        { label: "Seção 1", seconds: 0, voiceover: "Contexto e por que importa.", on_screen_text: "", visual: "" },
        { label: "Seção 2", seconds: 0, voiceover: "O que fazer a partir de hoje.", on_screen_text: "", visual: "" },
      ];
    default:
      return [{ label: "Arte", seconds: 0, voiceover: title, on_screen_text: title, visual: "Card com frase forte" }];
  }
}

function fakeStrategy(theme: string, format: Format, count: number): StrategyOutput {
  const pieces: ScriptPiece[] = Array.from({ length: count }, (_, i) => {
    const angle = ANGLES[i % ANGLES.length];
    const title = `${F} ${angle}: ${theme}`;
    const beats = beatsFor(format, title);
    return {
      format,
      title,
      angle,
      strategic_objective: "Teste do motor de produção",
      target_audience: "Público de teste",
      funnel_stage: (["topo", "meio", "fundo", "relacionamento"] as const)[i % 4],
      hook: beats[0].voiceover,
      beats,
      cta: "Salve este conteúdo",
      duration_s: beats.reduce((a, b) => a + b.seconds, 0),
      screens: format === "reel" || format === "long_video" ? 0 : beats.length,
      references: ["https://example.com/fonte-ficticia-1"],
      visual_instructions: "Usar cores e fontes da marca.",
      capture_instructions: format === "reel" ? "Gravar vertical, luz frontal, 30 s." : "",
      caption: `${F} Legenda de teste sobre ${theme}.`,
      hashtags: ["#teste"],
      scores: { authority: 3, engagement: 3 + (i % 2), shareability: 3, conversion: 2 + (i % 3) },
      score_rationale: "Pontuação de teste, sem base real.",
    };
  });
  return { pieces };
}

function fakeAnalysis(): AnalysisNarrative {
  return {
    summary: `${F} Análise de teste.`,
    patterns: [{ insight: `${F} Padrão de teste`, evidence: "métricas de teste" }],
    hypotheses: [{ text: `${F} Hipótese`, caveat: "Correlação observada em poucos dados, sem experimento controlado." }],
    recommendations: [`${F} Repetir o formato com mais salvamentos.`],
  };
}
