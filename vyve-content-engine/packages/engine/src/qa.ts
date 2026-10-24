/**
 * Validação de textos antes da revisão humana. Não substitui a revisão: só
 * aponta o que um revisor precisa olhar com atenção.
 */
export interface TextQa {
  ok: boolean;
  blocking: string[];
  warnings: string[];
}

const RISKY: Array<[RegExp, string]> = [
  [/\bgarantid[oa]s?\b/i, "Promessa de garantia de resultado"],
  [/\b100\s?%/i, "Afirmação absoluta (100%)"],
  [/\b(cura|curar|tratamento definitivo)\b/i, "Alegação de saúde: exige fonte e cuidado regulatório"],
  [/\b(fique rico|enriquecer rápido|renda garantida|dinheiro fácil)\b/i, "Promessa financeira"],
  [/\bsem (nenhum )?risco\b/i, "Afirmação de ausência de risco"],
  [/\bmilagr/i, "Linguagem de milagre"],
  [/\b(nunca falha|resultado imediato)\b/i, "Promessa de resultado"],
  [/\b(o melhor do brasil|n[ºo°]\s?1 do mercado|líder absoluto)\b/i, "Superlativo comparativo sem prova"],
];

const PERSONAL: Array<[RegExp, string]> = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, "Possível CPF no texto"],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/, "E-mail no texto"],
  [/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/, "Telefone no texto"],
];

export function checkText(text: string, opts: { forbidden?: string[] } = {}): TextQa {
  const warnings: string[] = [];
  const blocking: string[] = [];
  for (const [re, label] of RISKY) if (re.test(text)) warnings.push(label);
  for (const [re, label] of PERSONAL) if (re.test(text)) blocking.push(`${label}: remover dados pessoais antes de aprovar`);
  for (const term of opts.forbidden ?? []) {
    const t = term.trim();
    if (t && text.toLowerCase().includes(t.toLowerCase())) blocking.push(`Termo proibido pela marca: "${t}"`);
  }
  if (text.length > 2200) warnings.push(`Texto com ${text.length} caracteres: legenda do Instagram aceita até 2.200`);
  return { ok: blocking.length === 0, blocking, warnings };
}

/** Extrai termos proibidos do campo "restrições" da marca (linhas iniciadas por "não usar:"). */
export function forbiddenTerms(restrictions: string): string[] {
  const out: string[] = [];
  for (const line of restrictions.split(/\r?\n/)) {
    const m = line.match(/^\s*n[ãa]o usar\s*:\s*(.+)$/i);
    if (m) out.push(...m[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean));
  }
  return out;
}
