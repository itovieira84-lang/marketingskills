// Preços públicos da API da Anthropic em USD por milhão de tokens (tabela de 2026-10).
// Conferir em https://platform.claude.com/docs/en/about-claude/pricing antes de orçar
// contratos; o valor registrado em api_costs é estimativa calculada a partir do `usage`.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Busca na web: US$ 10 por 1.000 buscas. */
export const WEB_SEARCH_USD = 10 / 1000;

export function estimateUsd(model: string, u: { input_tokens: number; output_tokens: number; cache_read_tokens?: number; web_searches?: number }): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (
    (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_tokens ?? 0) * p.cacheRead) / 1_000_000 +
    (u.web_searches ?? 0) * WEB_SEARCH_USD
  );
}

/** Estimativa conservadora antes da chamada, para barrar lotes acima do orçamento. */
export function preflightUsd(model: string, promptChars: number, maxOutputTokens: number, webSearches = 0): number {
  return estimateUsd(model, { input_tokens: Math.ceil(promptChars / 3), output_tokens: maxOutputTokens, web_searches: webSearches });
}
