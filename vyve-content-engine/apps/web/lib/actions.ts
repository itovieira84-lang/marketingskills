"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as E from "@vyve/engine";
import { SESSION_COOKIE, requireSession } from "./session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData, fallback = "/") => {
  const b = str(f, "_back");
  return b.startsWith("/") ? b : fallback;
};
const withMsg = (path: string, key: "ok" | "erro", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

/** Executa a ação com a sessão atual e volta para a página com mensagem de sucesso ou erro. */
async function run(f: FormData, fn: (ctx: E.Ctx) => Promise<string | void>, fallback = "/") {
  const s = await requireSession();
  const ctx: E.Ctx = { teamId: s.teamId, userId: s.userId, role: s.role };
  let target = back(f, fallback);
  try {
    const msg = await fn(ctx);
    revalidatePath("/", "layout");
    if (msg?.startsWith("/")) target = msg;
    else target = withMsg(target, "ok", msg || "Feito.");
  } catch (e) {
    target = withMsg(target, "erro", (e as Error).message);
  }
  redirect(target);
}

// ---------------------------------------------------------------- sessão
export async function loginAction(f: FormData) {
  const s = await E.login(str(f, "email"), str(f, "password"));
  if (!s) redirect("/login?erro=" + encodeURIComponent("E-mail ou senha incorretos."));
  const token = E.signSession({ teamId: s.teamId, userId: s.userId, role: s.role, name: s.name });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------- clientes e marca
export async function createClientAction(f: FormData) {
  await run(f, async (ctx) => {
    const freq: Record<string, number> = {};
    for (const k of ["reel", "carousel", "card", "story_sequence", "newsletter"]) {
      const v = Number(str(f, `freq_${k}`));
      if (v > 0) freq[k] = v;
    }
    const c = await E.createClient(ctx, {
      name: str(f, "name"), segment: str(f, "segment"), audience: str(f, "audience"), objectives: str(f, "objectives"), tone: str(f, "tone"),
      postingFrequency: freq, requireResearchApproval: f.get("require_research") === "on", requireScriptApproval: f.get("require_scripts") === "on",
      batchBudgetUsd: Number(str(f, "budget") || 5),
    });
    return `/clientes/${c.id}?ok=${encodeURIComponent("Cliente cadastrado. Agora monte a biblioteca de marca.")}`;
  }, "/clientes");
}

export async function updateBrandAction(f: FormData) {
  await run(f, async (ctx) => {
    await E.updateBrand(ctx, str(f, "client_id"), {
      colors: { primary: str(f, "primary"), secondary: str(f, "secondary"), background: str(f, "background"), text: str(f, "text") },
      fonts: { heading: str(f, "font_heading") || "Inter Display", body: str(f, "font_body") || "Inter" },
      voice: str(f, "voice"), restrictions: str(f, "restrictions"),
    });
    return "Biblioteca de marca atualizada.";
  });
}

export async function uploadAssetAction(f: FormData) {
  await run(f, async (ctx) => {
    const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
    if (!files.length) throw new Error("Escolha pelo menos um arquivo.");
    const kind = str(f, "kind") as any;
    for (const file of files) {
      const meta: Record<string, unknown> = {};
      if (f.get("has_person") === "on") meta.has_person = true;
      if (f.get("voice_of_person") === "on") meta.voice_of_person = true;
      if (str(f, "role")) meta.role = str(f, "role");
      await E.uploadAsset(ctx, {
        clientId: str(f, "client_id"), buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, kind,
        label: str(f, "label") || file.name, rightsStatus: (str(f, "rights") || "unknown") as any, rightsNotes: str(f, "rights_notes"),
        consentId: str(f, "consent_id") || null, metadata: meta,
      });
    }
    return `${files.length} arquivo(s) enviado(s).`;
  });
}

export async function updateAssetRightsAction(f: FormData) {
  await run(f, async (ctx) => {
    await E.updateAssetRights(ctx, str(f, "asset_id"), { rightsStatus: str(f, "rights"), consentId: str(f, "consent_id") || null, hasPerson: f.get("has_person") === "on" });
    return "Direitos de uso atualizados.";
  });
}

export async function addConsentAction(f: FormData) {
  await run(f, async (ctx) => {
    await E.addConsent(ctx, { clientId: str(f, "client_id"), personName: str(f, "person"), scope: str(f, "scope") as any, grantedBy: str(f, "granted_by"), evidence: str(f, "evidence") });
    return "Consentimento registrado.";
  });
}

export async function revokeConsentAction(f: FormData) {
  await run(f, async (ctx) => { await E.revokeConsent(ctx, str(f, "consent_id")); return "Consentimento revogado: os ativos ligados saem da produção."; });
}

// ---------------------------------------------------------------- briefing e lote
export async function createBriefingAction(f: FormData) {
  await run(f, async (ctx) => {
    const mix: Record<string, number> = {};
    for (const k of ["reel", "carousel", "card", "story_sequence", "newsletter", "authority_post", "long_video"]) {
      const v = Number(str(f, `mix_${k}`));
      if (v > 0) mix[k] = v;
    }
    let body = str(f, "body");
    const file = f.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 2_000_000) throw new Error("Arquivo de briefing acima de 2 MB.");
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error("Envie o briefing em .txt ou .md (PDF e DOCX ainda não são lidos).");
      body = [body, await file.text()].filter(Boolean).join("\n\n");
    }
    const b = await E.createBriefing(ctx, { clientId: str(f, "client_id"), title: str(f, "title"), theme: str(f, "theme"), objective: str(f, "objective"), body, mix });
    const { batch } = await E.startBatch(ctx, { briefingId: b.id, mode: (str(f, "mode") || undefined) as any });
    return `/lotes/${batch.id}?ok=${encodeURIComponent("Lote criado. O worker começa pela validação e pela pesquisa.")}`;
  }, "/briefings");
}

export async function cancelBatchAction(f: FormData) {
  await run(f, async (ctx) => { await E.cancelBatch(ctx, str(f, "batch_id")); return "Lote cancelado."; });
}

/** Processa a fila dentro do servidor web (útil sem worker separado). Não bloqueia a página. */
export async function kickQueueAction(f: FormData) {
  await run(f, async () => {
    void E.drain(200).catch((e) => console.error("[vyve] drain", e));
    return "Fila em processamento. Atualize a página para acompanhar.";
  });
}

// ---------------------------------------------------------------- aprovações
export async function decideResearchAction(f: FormData) {
  await run(f, async (ctx) => {
    const d = str(f, "decision") as "aprovado" | "alteracao_solicitada";
    await E.decideResearch(ctx, str(f, "research_id"), d);
    return d === "aprovado" ? "Pesquisa aprovada: roteiros liberados." : "Pesquisa devolvida: o agente vai refazer.";
  });
}

export async function decideScriptsAction(f: FormData) {
  await run(f, async (ctx) => {
    const ids = f.getAll("script_id").map(String).filter(Boolean);
    if (!ids.length) throw new Error("Selecione pelo menos um roteiro.");
    const d = str(f, "decision") as "aprovado" | "alteracao_solicitada";
    await E.decideScripts(ctx, ids, d, str(f, "comment"));
    return `${ids.length} roteiro(s): ${d === "aprovado" ? "aprovados" : "alteração solicitada"}.`;
  });
}

export async function editScriptAction(f: FormData) {
  await run(f, async (ctx) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["title", "hook", "cta", "caption"]) if (f.has(k)) patch[k] = str(f, k);
    if (f.has("beats_json")) {
      try { patch.beats = JSON.parse(str(f, "beats_json")); } catch { throw new Error("Cenas/slides: JSON inválido."); }
    }
    await E.editScript(ctx, str(f, "script_id"), patch);
    if (f.get("reproduce") === "on" && str(f, "piece_id")) {
      await E.reproducePiece(ctx, str(f, "piece_id"));
      return "Roteiro salvo e nova versão enviada para produção.";
    }
    return "Roteiro salvo.";
  });
}

export async function decidePieceAction(f: FormData) {
  await run(f, async (ctx) => {
    const d = str(f, "decision") as "aprovado" | "alteracao_solicitada" | "rejeitado";
    if (d !== "aprovado" && !str(f, "comment")) throw new Error("Explique o que precisa mudar.");
    await E.decidePiece(ctx, str(f, "piece_id"), d, str(f, "comment"));
    return d === "aprovado" ? "Peça aprovada." : d === "rejeitado" ? "Peça rejeitada." : "Alteração solicitada.";
  });
}

export async function reproducePieceAction(f: FormData) {
  await run(f, async (ctx) => { await E.reproducePiece(ctx, str(f, "piece_id")); return "Nova versão na fila de produção."; });
}

// ---------------------------------------------------------------- calendário, publicação, métricas
export async function planCalendarAction(f: FormData) {
  await run(f, async (ctx) => {
    const r = await E.planCalendar(ctx, str(f, "client_id"), { startDate: str(f, "start") || undefined, actorUserId: ctx.userId });
    return `${r.scheduled.length} peça(s) no calendário${r.skipped.length ? `; ${r.skipped.length} não agendada(s): ${r.skipped.map((s) => `#${s.piece} ${s.reason}`).join(" · ")}` : ""}.`;
  });
}

export async function addCommercialDateAction(f: FormData) {
  await run(f, async (ctx) => {
    await E.addCommercialDate(ctx, { clientId: str(f, "client_id") || null, date: str(f, "date"), label: str(f, "label"), kind: str(f, "kind") as any });
    return "Data registrada.";
  });
}

export async function publishDueAction(f: FormData) {
  await run(f, async (ctx) => {
    E.assertCan(ctx, "publish");
    const r = await E.publishDue(ctx, { requestedBy: ctx.userId, dryRun: f.get("dry_run") === "on" });
    if (!r.length) return "Nada vencido para publicar.";
    return r.map((o) => `#${o.piece}: ${o.status}${o.reason ? ` (${o.reason})` : ""}`).join(" · ");
  });
}

export async function importMetricsAction(f: FormData) {
  await run(f, async (ctx) => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Envie o CSV de métricas.");
    const [head, ...lines] = (await file.text()).trim().split(/\r?\n/);
    const cols = head.split(/[;,]/).map((c) => c.trim().toLowerCase());
    if (!cols.includes("publication_id")) throw new Error("O CSV precisa da coluna publication_id.");
    const rows = lines.filter(Boolean).map((l) => {
      const vals = l.split(/[;,]/).map((v) => v.trim());
      const r: any = { source: str(f, "source") || "import_csv" };
      cols.forEach((c, i) => {
        if (c === "publication_id") r.publicationId = vals[i];
        else if (vals[i] !== "" && !Number.isNaN(Number(vals[i]))) r[c] = Number(vals[i]);
      });
      return r;
    });
    const out = await E.importMetrics(ctx, rows);
    return `${out.imported} linha(s) de métricas importadas.`;
  });
}

export async function collectMetricsAction(f: FormData) {
  await run(f, async (ctx) => {
    const r = await E.collectMetrics(ctx, str(f, "client_id"));
    return r.collected ? `${r.collected} publicação(ões) atualizadas.` : `Nada coletado: ${r.reason ?? "sem publicações"}.`;
  });
}

// ---------------------------------------------------------------- configurações
export async function setIntegrationAction(f: FormData) {
  await run(f, async (ctx) => {
    await E.setIntegration(ctx, { clientId: str(f, "client_id") || null, provider: str(f, "provider"), secretEnv: str(f, "secret_env") || null, config: str(f, "ig_user_id") ? { ig_user_id: str(f, "ig_user_id") } : {} });
    return "Integração registrada (o segredo continua só na variável de ambiente).";
  });
}

export async function verifyAnthropicAction(f: FormData) {
  await run(f, async (ctx) => {
    const r = await E.verifyAnthropic(ctx);
    if (r.status !== "verified") throw new Error(`Falhou: ${r.error}`);
    return "Anthropic API verificada com uma chamada real.";
  });
}

export async function createApiKeyAction(f: FormData) {
  await run(f, async (ctx) => {
    const token = await E.createApiKey(ctx, str(f, "label") || "n8n");
    // O token nunca vai para a URL: fica 2 minutos num cookie httpOnly lido só pela página de configurações.
    (await cookies()).set("vyve_new_key", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/configuracoes", maxAge: 120 });
    return "Chave criada. Copie agora: ela não aparece de novo.";
  });
}

export async function createUserAction(f: FormData) {
  await run(f, async (ctx) => {
    await E.createUser(ctx, { email: str(f, "email"), name: str(f, "name"), password: str(f, "password"), role: str(f, "role"), clientIds: f.getAll("client_ids").map(String).filter(Boolean) });
    return "Usuário criado.";
  });
}

export async function analyzeAction(f: FormData) {
  await run(f, async (ctx) => {
    const r = await E.analyzePerformance(ctx, str(f, "client_id"), { start: str(f, "start"), end: str(f, "end") });
    if (!r.hasData) return "Sem métricas registradas no período: nenhum número foi estimado.";
    return `Relatório gerado com ${r.publications} publicação(ões). ${r.patterns.length + r.hypotheses.length + r.recommendations.length} aprendizado(s) enviados à pesquisa.`;
  });
}
