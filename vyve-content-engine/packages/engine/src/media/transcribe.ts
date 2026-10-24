import { spawn } from "node:child_process";
import path from "node:path";
import { config, repoRoot } from "../config";

export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptionResult {
  available: boolean;
  reason: string;
  captions: Caption[];
  language?: string;
}

/**
 * Transcrição local opcional com faster-whisper (roda na máquina, sem enviar
 * áudio para terceiros). Ative com VYVE_TRANSCRIBER=faster-whisper depois de
 * `pip install faster-whisper`. Sem isso, retorna available=false e o vídeo
 * sai sem legendas sincronizadas (com aviso na revisão), nunca com legenda inventada.
 */
export async function transcribe(file: string): Promise<TranscriptionResult> {
  if (config.transcriber !== "faster-whisper") {
    return { available: false, reason: "serviço de transcrição não configurado (VYVE_TRANSCRIBER)", captions: [] };
  }
  const script = path.join(repoRoot(), "scripts", "transcribe.py");
  const python = process.env.VYVE_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  return new Promise((resolve) => {
    const p = spawn(python, [script, file, process.env.VYVE_WHISPER_MODEL ?? "small", process.env.VYVE_WHISPER_LANG ?? "pt"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => resolve({ available: false, reason: `falha ao iniciar transcrição: ${e.message}`, captions: [] }));
    p.on("close", (code) => {
      if (code !== 0) return resolve({ available: false, reason: `transcrição falhou: ${err.split("\n").slice(-3).join(" ")}`, captions: [] });
      try {
        const j = JSON.parse(out);
        resolve({ available: true, reason: "ok", language: j.language, captions: splitCaptions(j.segments ?? []) });
      } catch (e) {
        resolve({ available: false, reason: `saída inválida da transcrição: ${(e as Error).message}`, captions: [] });
      }
    });
  });
}

/** Quebra segmentos longos em frases curtas (até ~6 palavras) para legenda de Reels. */
export function splitCaptions(segments: Array<{ start: number; end: number; text: string; words?: Array<{ start: number; end: number; word: string }> }>): Caption[] {
  const out: Caption[] = [];
  for (const s of segments) {
    const words = s.words?.length ? s.words : null;
    if (!words) {
      out.push({ text: s.text.trim(), startMs: Math.round(s.start * 1000), endMs: Math.round(s.end * 1000) });
      continue;
    }
    for (let i = 0; i < words.length; i += 6) {
      const chunk = words.slice(i, i + 6);
      out.push({ text: chunk.map((w) => w.word).join("").trim(), startMs: Math.round(chunk[0].start * 1000), endMs: Math.round(chunk[chunk.length - 1].end * 1000) });
    }
  }
  return out.filter((c) => c.text);
}
