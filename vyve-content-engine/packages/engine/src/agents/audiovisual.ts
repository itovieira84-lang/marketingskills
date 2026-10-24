import path from "node:path";
import fs from "node:fs";
import { withCtx, type Ctx } from "../db";
import { loadPiece, loadProductionAssets, type ProductionAssets } from "./assets";
import { brandProps, recordHistory } from "./common";
import { renderJobs } from "./design";
import { renderVideoMp4, renderStillPng } from "../media/remotion";
import { startFileServer, fileUrl } from "../media/fileserver";
import { cutAndReframe, pickClipWindows, previewVideo, speechSegments, thumbnail, validateMedia } from "../media/ffmpeg";
import { transcribe } from "../media/transcribe";
import { absolutePath, registerFile, registerBuffer, scratchDir } from "../storage";
import { MEDIA_SPECS, type Beat } from "../schemas";
import { log } from "../logging";

export type Situation = "A" | "B" | "C";

/** Decide o caso de produção a partir do material autorizado disponível. */
export function decideSituation(assets: ProductionAssets): { situation: Situation; reason: string } {
  if (assets.videos.length) return { situation: "A", reason: `${assets.videos.length} vídeo(s) original(is) autorizado(s)` };
  if (assets.photos.length && assets.narration.length) return { situation: "B", reason: "imagens e narração autorizadas" };
  const missing: string[] = [];
  if (!assets.photos.length) missing.push("imagens autorizadas");
  if (!assets.narration.length) missing.push("narração autorizada");
  return { situation: "C", reason: `sem vídeo original; faltam ${missing.join(" e ")}` };
}

/** Agente 03: transforma o roteiro aprovado de Reels em vídeo (ou storyboard). */
export async function produceVideoPiece(ctx: Ctx, pieceId: string, runId: string) {
  const { piece, payload, assets, client, brand, reelIndex } = await withCtx(ctx, async (tx) => {
    const { piece, payload } = await loadPiece(tx, pieceId);
    const assets = await loadProductionAssets(tx, piece.client_id);
    const client = (await tx.query("select * from vyve.clients where id = $1", [piece.client_id])).rows[0];
    const brand = (await tx.query("select * from vyve.brands where client_id = $1", [piece.client_id])).rows[0] ?? null;
    const idx = await tx.query("select count(*)::int as n from vyve.pieces where batch_id = $1 and format = $2 and seq < $3", [piece.batch_id, piece.format, piece.seq]);
    return { piece, payload, assets, client, brand, reelIndex: idx.rows[0].n as number };
  });
  if (!payload) throw new Error("Peça sem roteiro");
  const scope = { teamId: piece.team_id, clientId: piece.client_id, batchId: piece.batch_id, runId };
  const { situation, reason } = decideSituation(assets);
  const size = piece.format === "long_video" ? MEDIA_SPECS.horizontal : MEDIA_SPECS.vertical;
  const targetS = Math.max(8, Math.min(piece.format === "long_video" ? 600 : 90, Number(payload.duration_s) || 30));
  await startFileServer();
  const dir = scratchDir(`video-${piece.seq}`);
  const bp = brandProps(client, brand, {
    logo: assets.logo ? fileUrl(assets.logo.storage_path) : null,
    heading: assets.headingFont ? fileUrl(assets.headingFont.storage_path) : null,
    body: assets.bodyFont ? fileUrl(assets.bodyFont.storage_path) : null,
  });
  const music = assets.music[0] ? fileUrl(assets.music[0].storage_path) : null;
  const notes: string[] = [reason];
  const pending: string[] = [];
  const outputs: any[] = [];
  let preview: any = null;
  let mediaProblems: string[] = [];

  try {
    if (situation === "A") {
      // Escolhe o vídeo e uma janela de fala diferente para cada Reels do lote.
      const video = assets.videos[reelIndex % assets.videos.length];
      const src = absolutePath(video.storage_path);
      const speech = await speechSegments(src);
      const windows = pickClipWindows(speech, targetS, 50);
      const win = windows.length ? windows[Math.floor(reelIndex / assets.videos.length) % windows.length] : { start: 0, end: Math.min(targetS, Number(video.duration_s)) };
      const clipPath = path.join(dir, "corte.mp4");
      await cutAndReframe(src, clipPath, win.start, win.end - win.start, size);
      notes.push(`Corte ${win.start.toFixed(1)}s–${win.end.toFixed(1)}s de "${video.label}" (${windows.length} trechos de fala detectados)`);
      const clip = await withCtx(ctx, (tx) => registerFile(tx, clipPath, { teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · corte bruto`, rightsStatus: video.rights_status, consentId: video.consent_id, metadata: { piece_id: piece.id, source_asset_id: video.id, window: win, intermediate: true } }, { move: true }));

      const tr = await transcribe(absolutePath(clip.storage_path));
      if (!tr.available) notes.push(`Legendas sincronizadas não geradas: ${tr.reason}`);
      const out = path.join(dir, "final.mp4");
      await renderVideoMp4("EditedReel", {
        videoUrl: fileUrl(clip.storage_path), durationS: win.end - win.start, size,
        headline: payload.hook, cta: payload.cta, captions: tr.captions, musicUrl: music, brand: bp,
      }, out);
      const check = await validateMedia(out, { ...size, video: true, minS: 3, maxS: piece.format === "long_video" ? 3600 : 90 });
      mediaProblems = check.problems;
      outputs.push(await withCtx(ctx, (tx) => registerFile(tx, out, { teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · Reels final`, rightsStatus: video.rights_status, consentId: video.consent_id, metadata: { piece_id: piece.id, situation, captions: tr.captions.length } }, { move: true })));
    } else if (situation === "B") {
      const narration = assets.narration[reelIndex % assets.narration.length];
      const beats: Beat[] = payload.beats ?? [];
      const totalS = Number(narration.duration_s) || targetS;
      const weight = beats.reduce((a, b) => a + Math.max(1, b.seconds || 1), 0) || 1;
      const scenes = beats.map((b, i) => ({ text: b.on_screen_text || b.voiceover, seconds: (Math.max(1, b.seconds || 1) / weight) * totalS, imageIndex: i }));
      const tr = await transcribe(absolutePath(narration.storage_path));
      if (!tr.available) notes.push(`Legendas sincronizadas não geradas: ${tr.reason}`);
      const out = path.join(dir, "final.mp4");
      await renderVideoMp4("MotionReel", {
        images: assets.photos.map((p) => fileUrl(p.storage_path)), audioUrl: fileUrl(narration.storage_path), musicUrl: music,
        size, scenes, captions: tr.captions, cta: payload.cta, brand: bp,
      }, out);
      const check = await validateMedia(out, { ...size, video: true, minS: 3, maxS: piece.format === "long_video" ? 3600 : 90 });
      mediaProblems = check.problems;
      outputs.push(await withCtx(ctx, (tx) => registerFile(tx, out, { teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · Reels animado`, rightsStatus: "own", metadata: { piece_id: piece.id, situation, narration_asset_id: narration.id } }, { move: true })));
    } else {
      // Caso C: só roteiro. Storyboard e materiais de produção; nada de vídeo inventado.
      const beats: Beat[] = payload.beats ?? [];
      const md = [
        `# Storyboard — ${payload.title}`, "", `Formato: ${size.width}x${size.height} · duração alvo ${targetS}s`, "",
        `**Gancho:** ${payload.hook}`, "",
        ...beats.map((b, i) => `## Cena ${i + 1} — ${b.label} (${b.seconds}s)\n- Fala: ${b.voiceover}\n- Texto na tela: ${b.on_screen_text}\n- Visual: ${b.visual}`),
        "", `**CTA:** ${payload.cta}`, "", "## Instruções de captação", payload.capture_instructions || "(não informadas)", "",
        "## Para produzir este vídeo", "Envie na Biblioteca de marcas: o vídeo gravado (caso A) ou imagens + narração autorizadas (caso B).",
      ].join("\n");
      outputs.push(await withCtx(ctx, (tx) => registerBuffer(tx, Buffer.from(md, "utf8"), `peca-${piece.seq}-storyboard.md`, { teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · storyboard`, rightsStatus: "own", metadata: { piece_id: piece.id, situation, storyboard: true } })));
      const frames = await renderJobs(ctx, piece, beats.map((b, i) => ({ variant: "story" as const, size: MEDIA_SPECS.vertical, title: b.on_screen_text || b.voiceover, body: `Cena ${i + 1}: ${b.visual}`, index: i + 1, total: beats.length, cta: "" })), assets, client, brand);
      outputs.push(...frames.outputs);
      pending.push(`PENDENTE DE PRODUÇÃO: ${reason}. Storyboard e quadros de referência prontos.`);
    }

    // Capa do Reels (Agente 04 reaproveitado) e pré-visualização leve.
    const cover = await renderJobs(ctx, piece, [{ variant: piece.format === "long_video" ? "thumbnail" : "reel_cover", size: piece.format === "long_video" ? MEDIA_SPECS.horizontal : MEDIA_SPECS.vertical, title: payload.hook, body: "", index: 1, total: 1, cta: "", photo: assets.photos[0] ?? null }], assets, client, brand);
    outputs.push(...cover.outputs);
    const video = outputs.find((o) => o.mime === "video/mp4");
    if (video) {
      const prevPath = path.join(dir, "preview.mp4");
      await previewVideo(absolutePath(video.storage_path), prevPath);
      preview = await withCtx(ctx, (tx) => registerFile(tx, prevPath, { teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · prévia`, rightsStatus: "own", metadata: { piece_id: piece.id, preview: true } }, { move: true }));
      const thumbPath = path.join(dir, "thumb.jpg");
      await thumbnail(absolutePath(video.storage_path), thumbPath, 1.0);
      outputs.push(await withCtx(ctx, (tx) => registerFile(tx, thumbPath, { teamId: piece.team_id, clientId: piece.client_id, kind: "render", label: `Peça ${piece.seq} · quadro`, rightsStatus: "own", metadata: { piece_id: piece.id, frame: true } }, { move: true })));
    } else {
      preview = cover.outputs[0] ?? null;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return withCtx(ctx, async (tx) => {
    const status = pending.length ? "pendente_producao" : mediaProblems.length ? "falhou" : "pronto";
    const stage = status === "pronto" ? "REVISAO" : "PRODUCAO";
    await tx.query(
      `update vyve.pieces set production_status = $2, production_mode = $3, output_asset_ids = $4, preview_asset_id = $5,
         pending_reasons = $6, stage = $7, qa = qa || $8, updated_at = now() where id = $1`,
      [piece.id, status, situation, outputs.map((o) => o.id), preview?.id ?? null, JSON.stringify(pending), stage,
        JSON.stringify({ media_problems: mediaProblems, production_notes: notes })]);
    await recordHistory(tx, piece, piece.stage, stage, { agent: "audiovisual" }, `Caso ${situation}: ${notes.join(" · ")}`);
    await log(tx, scope, status === "pronto" ? "info" : "warn", "audiovisual.peca", `Peça ${piece.seq}: caso ${situation}, status ${status}.`, { notes, mediaProblems });
    return { status, situation, files: outputs.length };
  });
}

export { renderStillPng };
