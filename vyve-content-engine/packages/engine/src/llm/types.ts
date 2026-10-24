import type { z } from "zod";

export type AgentName = "orquestrador" | "pesquisa" | "estrategia" | "audiovisual" | "design" | "calendario" | "analise";

export interface RetrievedSource {
  url: string;
  title: string;
  page_age?: string | null;
}

export interface Usage {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  web_searches: number;
  usd: number;
}

export interface LlmTask<T> {
  agent: AgentName;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  model: string;
  webSearch?: { maxUses: number };
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Dados auxiliares (usados pelo provedor de teste para gerar saídas coerentes). */
  meta?: { format?: string; count?: number; theme?: string; clientName?: string; [k: string]: unknown };
}

export interface LlmResult<T> {
  data: T;
  usage: Usage[];
  /** Fontes que a ferramenta de busca realmente devolveu (null quando não houve busca). */
  retrievedSources: RetrievedSource[] | null;
  provider: string;
  isFictitious: boolean;
}

export interface LlmProvider {
  readonly name: "anthropic" | "claude-code" | "fixture";
  run<T>(task: LlmTask<T>): Promise<LlmResult<T>>;
}

/**
 * Lançado pelo provedor "claude-code": a tarefa fica registrada na fila
 * (status awaiting_external) até um subagente do Claude Code enviar a resposta
 * com `vyve task submit`.
 */
export class AwaitingExternalError extends Error {
  constructor(public readonly task: { system: string; prompt: string; schemaName: string; jsonSchema: unknown; webSearch: boolean }) {
    super("Aguardando resposta de um subagente do Claude Code (vyve task submit)");
    this.name = "AwaitingExternalError";
  }
}

export class BudgetExceededError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BudgetExceededError";
  }
}
