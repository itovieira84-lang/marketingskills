import { z } from "zod";

// ---------------------------------------------------------------- formatos e mix do lote
export const FORMATS = ["reel", "carousel", "card", "story_sequence", "newsletter", "long_video", "authority_post"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  reel: "Roteiro de Reels",
  carousel: "Carrossel",
  card: "Card estático",
  story_sequence: "Sequência de Stories",
  newsletter: "Relacionamento / newsletter",
  long_video: "Vídeo longo",
  authority_post: "Post de autoridade",
};

export const STAGES = ["IDEIA", "PESQUISA", "ROTEIRO", "PRODUCAO", "REVISAO", "APROVACAO", "AGENDAMENTO", "PUBLICACAO", "ANALISE"] as const;
export type Stage = (typeof STAGES)[number];

export const Mix = z
  .partialRecord(z.enum(FORMATS), z.number().int().min(0).max(30))
  .refine((m) => Object.values(m).reduce((a, b) => a + (b ?? 0), 0) > 0, "O lote precisa de pelo menos 1 conteúdo")
  .refine((m) => Object.values(m).reduce((a, b) => a + (b ?? 0), 0) <= 30, "Máximo de 30 conteúdos por lote");
export type Mix = z.infer<typeof Mix>;

/** Mix de exemplo do prompt mestre: 10 + 6 + 6 + 6 + 2 = 30. */
export const DEFAULT_MIX: Mix = { reel: 10, carousel: 6, card: 6, story_sequence: 6, newsletter: 2 };

export const BriefingInput = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  theme: z.string().trim().min(3).max(500),
  objective: z.string().trim().max(2000).default(""),
  body: z.string().max(20000).default(""),
  mix: Mix.default(DEFAULT_MIX),
  sourceAssetId: z.string().uuid().optional(),
});
export type BriefingInput = z.infer<typeof BriefingInput>;

// ---------------------------------------------------------------- Agente 01: pesquisa
const Confidence = z.enum(["alta", "media", "baixa"]);
const Urls = z.array(z.string()).describe("URLs da lista de fontes que sustentam o item. Vazio se não houver.");

export const ResearchOutput = z.object({
  theme: z.string(),
  segment: z.string(),
  executive_summary: z.string(),
  trends: z.array(z.object({ title: z.string(), summary: z.string(), evidence_type: z.enum(["fato", "opiniao", "hipotese"]), confidence: Confidence, source_urls: Urls })),
  audience_questions: z.array(z.object({ question: z.string(), where_seen: z.string(), confidence: Confidence, source_urls: Urls })),
  competitors: z.array(z.object({ name: z.string(), profile_url: z.string(), observation: z.string(), source_urls: Urls })),
  opportunities: z.array(z.object({ title: z.string(), why: z.string(), format_suggestion: z.string(), source_urls: Urls })),
  faqs_objections: z.array(z.object({ text: z.string(), kind: z.enum(["faq", "objecao"]), source_urls: Urls })),
  approaches: z.array(z.object({ name: z.string(), description: z.string() })),
  keywords: z.array(z.string()),
  conversion_opportunities: z.array(z.object({ description: z.string(), cta_idea: z.string() })),
  facts: z.array(z.object({ claim: z.string(), source_urls: Urls })),
  opinions: z.array(z.object({ claim: z.string(), source_urls: Urls })),
  hypotheses: z.array(z.object({ claim: z.string(), rationale: z.string() })),
  recommendations: z.array(z.string()),
  sources: z.array(z.object({ url: z.string(), title: z.string(), publisher: z.string(), published_at: z.string().describe("Data de publicação se conhecida, senão string vazia") })),
  limitations: z.array(z.string()),
});
export type ResearchOutput = z.infer<typeof ResearchOutput>;

// ---------------------------------------------------------------- Agente 02: estratégia e roteiros
export const Beat = z.object({
  label: z.string().describe("Ex.: Gancho, Cena 2, Slide 3, Story 4, Seção 1"),
  seconds: z.number().describe("Duração em segundos (0 para formatos estáticos)"),
  voiceover: z.string().describe("Fala/narração ou texto principal da tela"),
  on_screen_text: z.string().describe("Texto curto exibido na tela/arte"),
  visual: z.string().describe("Instrução visual: o que aparece"),
});
export type Beat = z.infer<typeof Beat>;

export const ScriptPiece = z.object({
  format: z.enum(FORMATS),
  title: z.string(),
  angle: z.string().describe("Abordagem diferente das demais peças do lote"),
  strategic_objective: z.string(),
  target_audience: z.string(),
  funnel_stage: z.enum(["topo", "meio", "fundo", "relacionamento"]),
  hook: z.string(),
  beats: z.array(Beat).describe("Desenvolvimento: cenas, slides, telas ou seções"),
  cta: z.string(),
  duration_s: z.number().describe("Duração total (Reels/vídeo); 0 para estáticos"),
  screens: z.number().describe("Quantidade de telas/slides; 0 para vídeo"),
  references: z.array(z.string()).describe("URLs da pesquisa usadas"),
  visual_instructions: z.string(),
  capture_instructions: z.string().describe("O que gravar/fotografar, se necessário; vazio se não precisar"),
  caption: z.string(),
  hashtags: z.array(z.string()),
  scores: z.object({
    authority: z.number().int(),
    engagement: z.number().int(),
    shareability: z.number().int(),
    conversion: z.number().int(),
  }).describe("Potencial qualitativo de 1 a 5. Não é previsão de resultado."),
  score_rationale: z.string(),
});
export type ScriptPiece = z.infer<typeof ScriptPiece>;

export const StrategyOutput = z.object({ pieces: z.array(ScriptPiece) });
export type StrategyOutput = z.infer<typeof StrategyOutput>;

// ---------------------------------------------------------------- Agente 06: análise
export const AnalysisNarrative = z.object({
  summary: z.string(),
  patterns: z.array(z.object({ insight: z.string(), evidence: z.string() })),
  hypotheses: z.array(z.object({ text: z.string(), caveat: z.string().describe("Por que isto é correlação e não causalidade") })),
  recommendations: z.array(z.string()),
});
export type AnalysisNarrative = z.infer<typeof AnalysisNarrative>;

// ---------------------------------------------------------------- dimensões de mídia
export const MEDIA_SPECS = {
  vertical: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  horizontal: { width: 1920, height: 1080 },
} as const;
export type MediaSpecName = keyof typeof MEDIA_SPECS;
