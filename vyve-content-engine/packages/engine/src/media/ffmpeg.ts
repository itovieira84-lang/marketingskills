import { spawn } from "node:child_process";
import { config } from "../config";

function run(bin: string, args: string[], timeoutMs = 15 * 60_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`${bin} excedeu o tempo limite`)); }, timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => { clearTimeout(timer); reject(new Error(`Não foi possível executar ${bin}: ${e.message}`)); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} saiu com código ${code}: ${stderr.split("\n").slice(-6).join(" ")}`));
    });
  });
}

export interface ProbeResult {
  width: number | null;
  height: number | null;
  durationS: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
  rotation: number;
  formatName: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await run(config.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 60_000);
  const j = JSON.parse(stdout);
  const v = (j.streams ?? []).find((s: any) => s.codec_type === "video");
  const a = (j.streams ?? []).find((s: any) => s.codec_type === "audio");
  let rotation = 0;
  const sideRot = v?.side_data_list?.find((d: any) => d.rotation !== undefined)?.rotation;
  if (sideRot !== undefined) rotation = Number(sideRot);
  else if (v?.tags?.rotate) rotation = Number(v.tags.rotate);
  let width = v?.width ?? null, height = v?.height ?? null;
  // Celulares gravam em paisagem com metadado de rotação; o "visual" é o girado.
  if (Math.abs(rotation) % 180 === 90 && width && height) [width, height] = [height, width];
  const [n, d] = String(v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  const dur = Number(j.format?.duration ?? v?.duration ?? NaN);
  return {
    width, height,
    durationS: Number.isFinite(dur) ? dur : null,
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    fps: d ? Math.round((n / d) * 100) / 100 : null,
    rotation,
    formatName: j.format?.format_name ?? "",
    hasAudio: Boolean(a),
    hasVideo: Boolean(v) && !["png", "mjpeg", "webp"].includes(v?.codec_name) ? true : Boolean(v),
  };
}

/**
 * Detecta trechos com fala usando o filtro silencedetect do FFmpeg (sem serviço
 * externo). Retorna intervalos [início, fim] em segundos, ordenados.
 */
export async function speechSegments(file: string, opts: { noiseDb?: number; minSilence?: number } = {}): Promise<Array<{ start: number; end: number }>> {
  const p = await probe(file);
  if (!p.hasAudio || !p.durationS) return p.durationS ? [{ start: 0, end: p.durationS }] : [];
  const { stderr } = await run(config.ffmpeg, [
    "-hide_banner", "-nostats", "-i", file, "-vn",
    "-af", `silencedetect=noise=${opts.noiseDb ?? -32}dB:d=${opts.minSilence ?? 0.6}`, "-f", "null", "-",
  ]);
  const silences: Array<{ start: number; end: number }> = [];
  let curStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) curStart = Number(s[1]);
    if (e && curStart !== null) { silences.push({ start: curStart, end: Number(e[1]) }); curStart = null; }
  }
  if (curStart !== null) silences.push({ start: curStart, end: p.durationS });
  const speech: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start - cursor > 0.4) speech.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (p.durationS - cursor > 0.4) speech.push({ start: cursor, end: p.durationS });
  return speech;
}

/**
 * Escolhe janelas de corte de ~targetS segundos que começam no início de uma
 * fala e terminam num silêncio (evita cortar palavra no meio).
 */
export function pickClipWindows(input: Array<{ start: number; end: number }>, targetS: number, maxClips: number): Array<{ start: number; end: number }> {
  // Fala contínua (sem pausas detectáveis) vira um único trecho longo: divide em blocos do tamanho
  // pedido para que cada Reels do lote use uma parte diferente do vídeo.
  const speech: Array<{ start: number; end: number }> = [];
  for (const seg of input) {
    if (seg.end - seg.start <= targetS * 1.35) { speech.push(seg); continue; }
    for (let t = seg.start; t < seg.end - 1; t += targetS) speech.push({ start: t, end: Math.min(seg.end, t + targetS) });
  }
  const clips: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < speech.length && clips.length < maxClips) {
    const start = Math.max(0, speech[i].start - 0.15);
    let j = i;
    while (j + 1 < speech.length && speech[j + 1].end - start <= targetS * 1.25) j++;
    const end = Math.min(speech[j].end + 0.25, start + targetS * 1.35);
    if (end - start >= Math.min(5, targetS * 0.5)) clips.push({ start, end });
    i = j + 1;
  }
  return clips;
}

/** Corta e reenquadra para o formato pedido (corte central + escala), H.264/AAC. */
export async function cutAndReframe(input: string, out: string, start: number, duration: number, size: { width: number; height: number }) {
  const { width: W, height: H } = size;
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30`;
  await run(config.ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), "-i", input, "-t", duration.toFixed(3),
    "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", out,
  ]);
}

export async function thumbnail(input: string, out: string, atS = 0.5, width = 540) {
  await run(config.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(atS), "-i", input, "-frames:v", "1", "-vf", `scale=${width}:-2`, out]);
}

/** Pré-visualização leve (540 px de largura) para o painel. */
export async function previewVideo(input: string, out: string) {
  await run(config.ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vf", "scale=540:-2", "-c:v", "libx264", "-preset", "veryfast",
    "-crf", "30", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out,
  ]);
}

/** Extrai áudio mono 16 kHz (entrada para transcrição). */
export async function extractAudio(input: string, out: string) {
  await run(config.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", out]);
}

export interface MediaCheck {
  ok: boolean;
  problems: string[];
  probe: ProbeResult | null;
}

/** Valida dimensões, duração e integridade (decodifica o arquivo inteiro). */
export async function validateMedia(file: string, expect: { width: number; height: number; minS?: number; maxS?: number; video?: boolean }): Promise<MediaCheck> {
  const problems: string[] = [];
  let p: ProbeResult | null = null;
  try {
    p = await probe(file);
  } catch (e) {
    return { ok: false, problems: [`Arquivo ilegível: ${(e as Error).message}`], probe: null };
  }
  if (p.width !== expect.width || p.height !== expect.height) problems.push(`Dimensão ${p.width}x${p.height}, esperado ${expect.width}x${expect.height}`);
  if (expect.video) {
    if (!p.durationS) problems.push("Duração desconhecida");
    if (expect.minS && (p.durationS ?? 0) < expect.minS) problems.push(`Duração ${p.durationS?.toFixed(1)} s abaixo de ${expect.minS} s`);
    if (expect.maxS && (p.durationS ?? 0) > expect.maxS) problems.push(`Duração ${p.durationS?.toFixed(1)} s acima de ${expect.maxS} s`);
    if (p.videoCodec !== "h264") problems.push(`Codec ${p.videoCodec}; Instagram recomenda H.264`);
    try {
      await run(config.ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"]);
    } catch (e) {
      problems.push(`Falha de integridade: ${(e as Error).message}`);
    }
  }
  return { ok: problems.length === 0, problems, probe: p };
}
