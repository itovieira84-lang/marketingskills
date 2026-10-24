import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { FIXTURES } from "./helpers";
import { probe, speechSegments, validateMedia } from "../packages/engine/src/media/ffmpeg";

const video = path.join(FIXTURES, "video-teste.mp4");

test("ffprobe lê dimensões e duração reais", async () => {
  const p = await probe(video);
  assert.deepEqual([p.width, p.height], [960, 540]);
  assert.ok(Math.abs(p.durationS! - 30) < 0.5);
});

test("validação de mídia aponta dimensão errada", async () => {
  assert.equal((await validateMedia(video, { width: 960, height: 540, video: true })).ok, true);
  const bad = await validateMedia(video, { width: 1080, height: 1920, video: true });
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.length > 0);
});

test("detecção de fala por silêncio encontra os trechos com som", async () => {
  const seg = await speechSegments(video);
  assert.ok(seg.length >= 4, `segmentos: ${seg.length}`);
});
