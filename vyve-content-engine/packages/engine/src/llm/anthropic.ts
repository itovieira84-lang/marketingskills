import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LlmProvider, LlmResult, LlmTask, RetrievedSource, Usage } from "./types";
import { estimateUsd } from "./pricing";
import { RateLimiter } from "./ratelimit";
import { config } from "../config";

/**
 * Provedor real: Anthropic SDK (Messages API).
 * - Saída estruturada validada por Zod (`betaZodOutputFormat`).
 * - Pesquisa: ferramenta oficial `web_search` e, numa segunda chamada, a
 *   estruturação em JSON citando apenas as URLs que a busca devolveu.
 * - Fallback de recusa no servidor ("default"), habilitado conforme a
 *   recomendação da Anthropic para os modelos atuais.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  private limiter = new RateLimiter(config.maxRequestsPerMinute);

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ maxRetries: 2 });
  }

  private usageOf(model: string, u: any): Usage {
    const usage = {
      input_tokens: u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      cache_read_tokens: u?.cache_read_input_tokens ?? 0,
      web_searches: u?.server_tool_use?.web_search_requests ?? 0,
    };
    return { provider: "anthropic", model, ...usage, usd: estimateUsd(model, usage) };
  }

  private assertNotRefused(msg: { stop_reason: string | null; stop_details?: any }) {
    if (msg.stop_reason === "refusal") {
      throw new Error(`A IA recusou a tarefa (${msg.stop_details?.category ?? "sem categoria"}). Revise o briefing.`);
    }
    if (msg.stop_reason === "max_tokens") throw new Error("Resposta cortada por limite de tokens; reduza o lote ou aumente maxTokens.");
  }

  async run<T>(task: LlmTask<T>): Promise<LlmResult<T>> {
    const usage: Usage[] = [];
    let retrieved: RetrievedSource[] | null = null;
    let prompt = task.prompt;

    if (task.webSearch) {
      // Passo 1: pesquisa livre com a ferramenta oficial de busca.
      retrieved = [];
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: task.prompt }];
      const notes: string[] = [];
      for (let turn = 0; turn < 4; turn++) {
        await this.limiter.take();
        const msg = await this.client.beta.messages
          .stream({
            model: task.model,
            max_tokens: 32000,
            system: task.system,
            messages,
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: task.webSearch.maxUses }],
            output_config: { effort: task.effort ?? "high" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          })
          .finalMessage();
        usage.push(this.usageOf(task.model, msg.usage));
        this.assertNotRefused(msg as any);
        for (const block of msg.content as any[]) {
          if (block.type === "text") notes.push(block.text);
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) {
              if (r.type === "web_search_result") retrieved.push({ url: r.url, title: r.title, page_age: r.page_age ?? null });
            }
          }
        }
        if (msg.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: msg.content as any });
      }
      const list = retrieved.map((s, i) => `${i + 1}. ${s.title} — ${s.url}${s.page_age ? ` (${s.page_age})` : ""}`).join("\n");
      prompt =
        `${task.prompt}\n\n## Anotações da pesquisa\n${notes.join("\n\n")}\n\n## Fontes efetivamente consultadas pela busca\n${list || "(nenhuma)"}\n\n` +
        "Estruture o briefing. Cite em source_urls SOMENTE URLs desta lista de fontes. Item sem fonte vai para hypotheses.";
    }

    // Passo 2 (ou único): resposta estruturada e validada.
    await this.limiter.take();
    const msg = await this.client.beta.messages
      .stream({
        model: task.model,
        max_tokens: task.maxTokens ?? 64000,
        system: task.system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: task.effort ?? "medium", format: betaZodOutputFormat(task.schema as any) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();
    usage.push(this.usageOf(task.model, msg.usage));
    this.assertNotRefused(msg as any);
    const text = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
    const data = task.schema.parse(JSON.parse(text));
    return { data, usage, retrievedSources: retrieved, provider: this.name, isFictitious: false };
  }
}
