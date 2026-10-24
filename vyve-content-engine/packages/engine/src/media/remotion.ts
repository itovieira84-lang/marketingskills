import path from "node:path";
import { repoRoot, config } from "../config";

/**
 * Renderização com Remotion (pacote packages/video). O bundle é gerado uma vez
 * por processo e reaproveitado por todas as peças do lote.
 */
let bundlePromise: Promise<string> | null = null;

async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const { bundle } = await import("@remotion/bundler");
      return bundle({ entryPoint: path.join(repoRoot(), "packages", "video", "src", "index.ts") });
    })().catch((e) => {
      bundlePromise = null;
      throw e;
    });
  }
  return bundlePromise;
}

function browserOpts() {
  const exe = config.browserExecutable;
  return exe ? { browserExecutable: exe } : {};
}

export async function renderStillPng(compositionId: string, inputProps: Record<string, unknown>, output: string) {
  const { selectComposition, renderStill } = await import("@remotion/renderer");
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, ...browserOpts() });
  await renderStill({ composition, serveUrl, output, inputProps, imageFormat: "png", ...browserOpts() });
  return { width: composition.width, height: composition.height };
}

export async function renderVideoMp4(compositionId: string, inputProps: Record<string, unknown>, output: string, onProgress?: (p: number) => void) {
  const { selectComposition, renderMedia } = await import("@remotion/renderer");
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, ...browserOpts() });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: output,
    inputProps,
    crf: 20,
    pixelFormat: "yuv420p",
    concurrency: Number(process.env.VYVE_RENDER_CONCURRENCY ?? 2),
    onProgress: ({ progress }) => onProgress?.(progress),
    ...browserOpts(),
  });
  return { width: composition.width, height: composition.height, durationS: composition.durationInFrames / composition.fps };
}
