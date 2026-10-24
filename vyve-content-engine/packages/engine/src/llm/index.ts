import { z } from "zod";
import type { LlmProvider, LlmResult, LlmTask } from "./types";
import { AwaitingExternalError } from "./types";
import { AnthropicProvider } from "./anthropic";
import { FixtureProvider } from "./fixture";
import type { LlmMode } from "../config";

/**
 * Provedor "claude-code": não chama API nenhuma. Registra a tarefa e espera que
 * um subagente do Claude Code (pasta .claude/agents) leia com `vyve task show`
 * e responda com `vyve task submit`. A resposta passa pelo mesmo esquema Zod e
 * pelas mesmas verificações (fontes, QA) que a resposta da API.
 */
export class ClaudeCodeProvider implements LlmProvider {
  readonly name = "claude-code" as const;
  async run<T>(task: LlmTask<T>): Promise<LlmResult<T>> {
    throw new AwaitingExternalError({
      system: task.system,
      prompt: task.prompt,
      schemaName: task.schemaName,
      jsonSchema: z.toJSONSchema(task.schema as z.ZodType),
      webSearch: Boolean(task.webSearch),
    });
  }
}

export function providerFor(mode: LlmMode): LlmProvider {
  if (mode === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error("Modo anthropic exige ANTHROPIC_API_KEY (ou ANTHROPIC_AUTH_TOKEN) no ambiente.");
    }
    return new AnthropicProvider();
  }
  if (mode === "fixture") return new FixtureProvider();
  return new ClaudeCodeProvider();
}

export * from "./types";
export { estimateUsd, preflightUsd, PRICES } from "./pricing";
