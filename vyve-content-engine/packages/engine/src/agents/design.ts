import path from "node:path";
import fs from "node:fs";
import { withCtx, type Ctx } from "../db";
import { loadPiece, loadProductionAssets, type ProductionAssets } from "./assets";
import { brandProps, recordHistory } from "./common";
import { renderStillPng } from "../media/remotion";
import { startFileServer, fileUrl } from "../media/fileserver";
import { validateMedia } from "../media/ffmpeg";
import { registerFile, registerBuffer, scratchDir } from "../storage";
import { MEDIA_SPECS } from "../schemas";
import type { Beat } from "../schemas";
import { log } from "../logging";

type Variant = "carousel_cover" | "carousel_slide" | "carousel_end" | "card" | "story" | "reel_cover" | "thumbnail";

export interface DesignJob {
  variant: Variant;
  size: { width: number; height: number };
  title: string;
  body: string;
  index: number;
  total: number;
  cta: string;
  photo?: any | null;
}

/** Converte o roteiro aprovado nas artes do formato. */
export function designJobs(format: string, payload: any, assets: ProductionAssets): DesignJob[] {
  const beats: Beat[] = payload.beats ?? [];
  const cta: string = payload.cta ?? "";
  const photo = assets.photos[0] ?? null;
  switch (format) {
    case "carousel": {
      const total = beats.length;
      return beats.map((b, i) => ({
        variant: i === 0 ? "carousel_cover" : i === total - 1 ? "carousel_end" : "carousel_slide",
        size: MEDIA_SPECS.feed,
        title: b.on_screen_text || b.voiceover,
        body: i === 0 ? "" : b.on_screen_text && b.voiceover !== b.on_screen_text ? b.voiceover : "",
        index: i + 1,
        total,
        cta,
        photo: i === 0 ? photo : null,
      }));
    }
    case "story_sequence":
      return beats.map((b, i) => ({
        variant: "story" as const, size: MEDIA_SPECS.vertical, title: b.on_screen_text || b.voiceover,
        body: b.on_screen_text && b.voiceover !== b.on_screen_text ? b.voiceover : "", index: i + 1, total: beats.length,
        cta: i === beats.length - 1 ? cta : "",
      }));
    case "card":
    case "authority_post": {
      const b = beats[0];
      return [{ variant: "card", size: MEDIA_SPECS.feed, title: b?.on_screen_text || payload.hook, body: b && b.voiceover !== b.on_screen_text ? b.voiceover : "", index: 1, total: 1, cta }];
    }
    default:
      return [];
  }
}

export async function renderJobs(ctx: Ctx, piece: any, jobs: DesignJob[], assets: ProductionAssets, client: any, brand: any) {
  await startFileServer();
  const dir = scratchDir(`design-${piece.seq}`);
  const outputs: any[] = [];
  const problems: string[] = [];
  const bp = brandProps(client, brand, {
    logo: assets.logo ? fileUrl(assets.logo.storage_path) : null,
    heading: assets.headingFont ? fileUrl(assets.headingFont.storage_path) : null,
    body: assets.bodyFont ? fileUrl(assets.bodyFont.storage_path) : null,
  });
  for (const [i, job] of jobs.entries()) {
    const out = path.join(dir, `${String(i + 1).padStart(2, "0")}-${job.variant}.png`);
    await renderStillPng("PieceStill", {
      variant: job.variant, size: job.size, title: job.title, body: job.body, index: job.index, total: job.total, cta: job.cta,
      photoUrl: job.photo ? fileUrl(job.photo.storage_path) : null, brand: bp,
    }, out);
    const check = await validateMedia(out, job.size);
    if (!check.ok) problems.push(...check.problems.map((p) => `${path.basename(out)}: ${p}`));
    const asset = await withCtx(ctx, (tx) => registerFile(tx, out, {
      teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · ${job.variant} ${job.index}/${job.total}`,
      rightsStatus: "own", metadata: { piece_id: piece.id, variant: job.variant, photo_asset_id: job.photo?.id ?? null },
    }, { move: true }));
    outputs.push(asset);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { outputs, problems, usedLogo: Boolean(assets.logo) };
}

/** Agente 04: produz as artes da peça. */
export async function produceDesignPiece(ctx: Ctx, pieceId: string, runId: string) {
  const { piece, payload, assets, client, brand } = await withCtx(ctx, async (tx) => {
    const { piece, payload } = await loadPiece(tx, pieceId);
    const assets = await loadProductionAssets(tx, piece.client_id);
    const client = (await tx.query("select * from vyve.clients where id = $1", [piece.client_id])).rows[0];
    const brand = (await tx.query("select * from vyve.brands where client_id = $1", [piece.client_id])).rows[0] ?? null;
    return { piece, payload, assets, client, brand };
  });
  if (!payload) throw new Error("Peça sem roteiro");

  if (piece.format === "newsletter") return produceTextPiece(ctx, piece, payload, runId);

  const jobs = designJobs(piece.format, payload, assets);
  const { outputs, problems, usedLogo } = await renderJobs(ctx, piece, jobs, assets, client, brand);
  const pending: string[] = [];
  if (!outputs.length) pending.push("Roteiro sem telas para renderizar");
  return withCtx(ctx, async (tx) => {
    const status = pending.length ? "pendente_producao" : problems.length ? "falhou" : "pronto";
    const stage = status === "pronto" ? "REVISAO" : "PRODUCAO";
    await tx.query(
      `update vyve.pieces set production_status = $2, production_mode = 'design', output_asset_ids = $3, preview_asset_id = $4,
         pending_reasons = $5, stage = $6, qa = qa || $7, updated_at = now() where id = $1`,
      [piece.id, status, outputs.map((o) => o.id), outputs[0]?.id ?? null, JSON.stringify(pending), stage,
        JSON.stringify({ media_problems: problems, logo: usedLogo ? "logo original aplicado" : "sem logo cadastrado: arte sem logo (nada foi recriado)" })]);
    await recordHistory(tx, piece, piece.stage, stage, { agent: "design" }, `${outputs.length} arte(s) renderizada(s)`);
    await log(tx, { teamId: piece.team_id, clientId: piece.client_id, batchId: piece.batch_id, runId }, problems.length ? "warn" : "info",
      "design.peca", `Peça ${piece.seq} (${piece.format}): ${outputs.length} arquivo(s), status ${status}.`, { problems });
    return { status, files: outputs.length };
  });
}

/** Newsletter/relacionamento: o texto final é o próprio entregável. */
async function produceTextPiece(ctx: Ctx, piece: any, payload: any, runId: string) {
  const body = [`# ${payload.title}`, "", payload.hook, "", ...(payload.beats ?? []).map((b: Beat) => `## ${b.label}\n\n${b.voiceover}`), "", `**${payload.cta}**`].join("\n");
  return withCtx(ctx, async (tx) => {
    const asset = await registerBuffer(tx, Buffer.from(body, "utf8"), `peca-${piece.seq}-newsletter.md`, {
      teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · texto final`, rightsStatus: "own",
      metadata: { piece_id: piece.id },
    });
    await tx.query(
      `update vyve.pieces set production_status = 'pronto', production_mode = 'texto', body = $2, output_asset_ids = $3,
         stage = 'REVISAO', updated_at = now() where id = $1`, [piece.id, body, [asset.id]]);
    await recordHistory(tx, piece, piece.stage, "REVISAO", { agent: "design" }, "Texto final gerado a partir do roteiro");
    await log(tx, { teamId: piece.team_id, clientId: piece.client_id, batchId: piece.batch_id, runId }, "info", "texto.peca", `Peça ${piece.seq}: texto final pronto.`);
    return { status: "pronto", files: 1 };
  });
}
