import type { ResearchOutput } from "./schemas";
import type { RetrievedSource } from "./llm/types";

export interface SourceCheck {
  url: string;
  status: number | null;
  reachable: boolean;
  note: string;
  checked_at: string;
}

export interface VerifiedResearch {
  research: ResearchOutput;
  sources: Array<ResearchOutput["sources"][number] & { accessed_at: string; check: SourceCheck | null; retrieved_by_search: boolean }>;
  dropped: Array<{ section: string; text: string; reason: string }>;
}

const norm = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

/** Confere se a URL responde. 401/403/429 contam como "existe, mas bloqueia robôs". */
export async function checkUrl(url: string, timeoutMs = 8000): Promise<SourceCheck> {
  const checked_at = new Date().toISOString();
  if (!/^https?:\/\//i.test(url)) return { url, status: null, reachable: false, note: "URL inválida", checked_at };
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(url, { method, redirect: "follow", signal: ctl.signal, headers: { "user-agent": "VyveContentEngine/0.1 (+verificacao-de-fontes)" } });
      clearTimeout(t);
      if (r.status < 400) return { url, status: r.status, reachable: true, note: "ok", checked_at };
      if ([401, 403, 429].includes(r.status)) return { url, status: r.status, reachable: true, note: "existe, mas bloqueia acesso automático", checked_at };
      if (method === "GET") return { url, status: r.status, reachable: false, note: `HTTP ${r.status}`, checked_at };
    } catch (e) {
      if (method === "GET") return { url, status: null, reachable: false, note: (e as Error).name === "AbortError" ? "tempo esgotado" : "sem resposta", checked_at };
    }
  }
  return { url, status: null, reachable: false, note: "sem resposta", checked_at };
}

/**
 * Regra "nunca inventar": toda afirmação factual precisa apontar para uma fonte
 * que (a) a ferramenta de busca devolveu, ou (b) respondeu à verificação HTTP.
 * O que não passa é removido do briefing e listado em `dropped` para a equipe ver.
 */
export async function verifyResearch(
  input: ResearchOutput,
  retrieved: RetrievedSource[] | null,
  opts: { checkHttp: boolean; fictitious: boolean },
): Promise<VerifiedResearch> {
  const now = new Date().toISOString();
  const retrievedSet = new Set((retrieved ?? []).map((s) => norm(s.url)));
  const declared = new Map<string, ResearchOutput["sources"][number]>();
  for (const s of input.sources) declared.set(norm(s.url), s);
  // Fontes que a busca trouxe mas o modelo não listou também entram na lista.
  for (const s of retrieved ?? []) if (!declared.has(norm(s.url))) declared.set(norm(s.url), { url: s.url, title: s.title, publisher: new URL(s.url).hostname, published_at: s.page_age ?? "" });

  const checks = new Map<string, SourceCheck>();
  if (opts.checkHttp) {
    const list = [...declared.values()].filter((s) => !retrievedSet.has(norm(s.url)));
    await Promise.all(list.map(async (s) => checks.set(norm(s.url), await checkUrl(s.url))));
  }

  const allowed = new Set<string>();
  for (const key of declared.keys()) {
    if (opts.fictitious) {
      if (key.includes("example.com")) allowed.add(key);
      continue;
    }
    if (retrievedSet.has(key) || checks.get(key)?.reachable) allowed.add(key);
  }

  const dropped: VerifiedResearch["dropped"] = [];
  const filterUrls = (urls: string[]) => urls.filter((u) => allowed.has(norm(u)));
  function keep<T extends { source_urls: string[] }>(section: string, items: T[], label: (i: T) => string): T[] {
    const out: T[] = [];
    for (const it of items) {
      const urls = filterUrls(it.source_urls);
      if (urls.length) out.push({ ...it, source_urls: urls });
      else dropped.push({ section, text: label(it), reason: it.source_urls.length ? "fonte não verificada (não veio da busca e não respondeu)" : "sem fonte" });
    }
    return out;
  }

  const r = structuredClone(input);
  const hypothesesFromTrends = r.trends.filter((t) => t.evidence_type === "hipotese").map((t) => ({ claim: t.title + ": " + t.summary, rationale: "Marcada como hipótese pelo pesquisador" }));
  r.trends = keep("tendências", r.trends.filter((t) => t.evidence_type !== "hipotese"), (t) => t.title);
  r.audience_questions = keep("dúvidas do público", r.audience_questions, (q) => q.question);
  r.competitors = keep("concorrentes", r.competitors, (c) => c.name);
  r.opportunities = keep("oportunidades", r.opportunities, (o) => o.title);
  r.faqs_objections = keep("perguntas e objeções", r.faqs_objections, (f) => f.text);
  r.facts = keep("fatos", r.facts, (f) => f.claim);
  r.opinions = keep("opiniões", r.opinions, (o) => o.claim);
  r.hypotheses = [...r.hypotheses, ...hypothesesFromTrends];

  const sources = [...declared.entries()]
    .filter(([k]) => allowed.has(k))
    .map(([k, s]) => ({ ...s, accessed_at: now, check: checks.get(k) ?? null, retrieved_by_search: retrievedSet.has(k) }));
  r.sources = sources.map(({ url, title, publisher, published_at }) => ({ url, title, publisher, published_at }));
  if (!sources.length && !opts.fictitious) r.limitations = [...r.limitations, "Nenhuma fonte verificável: o briefing contém apenas hipóteses."];
  return { research: r, sources, dropped };
}

/** Relatório legível (Markdown) para a equipe. */
export function researchReport(v: VerifiedResearch, meta: { clientName: string; fictitious: boolean }): string {
  const r = v.research;
  const L: string[] = [];
  if (meta.fictitious) L.push("> **DADOS FICTÍCIOS** — gerado pelo modo de teste. Não usar com cliente.\n");
  L.push(`# Briefing estratégico — ${r.theme}`, "", `Cliente: ${meta.clientName} · Segmento: ${r.segment}`, "", "## Resumo", r.executive_summary, "");
  const cite = (urls: string[]) => (urls.length ? " " + urls.map((u) => `[fonte](${u})`).join(" ") : "");
  if (r.trends.length) L.push("## Tendências", ...r.trends.map((t) => `- **${t.title}** (${t.evidence_type}, confiança ${t.confidence}): ${t.summary}${cite(t.source_urls)}`), "");
  if (r.audience_questions.length) L.push("## Dúvidas reais do público", ...r.audience_questions.map((q) => `- ${q.question} — visto em ${q.where_seen}${cite(q.source_urls)}`), "");
  if (r.competitors.length) L.push("## Concorrentes e referências", ...r.competitors.map((c) => `- **${c.name}** (${c.profile_url}): ${c.observation}${cite(c.source_urls)}`), "");
  if (r.opportunities.length) L.push("## Oportunidades", ...r.opportunities.map((o) => `- **${o.title}** — ${o.why} (formato: ${o.format_suggestion})${cite(o.source_urls)}`), "");
  if (r.faqs_objections.length) L.push("## Perguntas frequentes e objeções", ...r.faqs_objections.map((f) => `- [${f.kind}] ${f.text}${cite(f.source_urls)}`), "");
  if (r.approaches.length) L.push("## Abordagens possíveis", ...r.approaches.map((a) => `- **${a.name}**: ${a.description}`), "");
  if (r.keywords.length) L.push("## Palavras-chave", r.keywords.join(", "), "");
  if (r.conversion_opportunities.length) L.push("## Oportunidades de conversão", ...r.conversion_opportunities.map((c) => `- ${c.description} → CTA: ${c.cta_idea}`), "");
  L.push("## Fatos, opiniões e hipóteses");
  L.push(...r.facts.map((f) => `- Fato: ${f.claim}${cite(f.source_urls)}`));
  L.push(...r.opinions.map((o) => `- Opinião: ${o.claim}${cite(o.source_urls)}`));
  L.push(...r.hypotheses.map((h) => `- Hipótese: ${h.claim} (${h.rationale})`), "");
  if (r.recommendations.length) L.push("## Recomendações", ...r.recommendations.map((x) => `- ${x}`), "");
  L.push("## Fontes", ...v.sources.map((s) => `- [${s.title}](${s.url}) — ${s.publisher}${s.published_at ? `, publicado ${s.published_at}` : ""}; consultado em ${s.accessed_at.slice(0, 10)}${s.retrieved_by_search ? " (busca)" : s.check ? ` (verificação HTTP: ${s.check.note})` : ""}`), "");
  if (v.dropped.length) L.push("## Afirmações descartadas por falta de fonte verificável", ...v.dropped.map((d) => `- [${d.section}] ${d.text} — ${d.reason}`), "");
  if (r.limitations.length) L.push("## Limitações", ...r.limitations.map((x) => `- ${x}`), "");
  return L.join("\n");
}
