import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { PhotoStoryProps, StoryScene } from "../types";
import { BrandFonts, headingFamily, bodyFamily } from "../components/brand";

/**
 * Reels sem fala: fotos reais do cliente com movimento de câmera, tipografia animada,
 * dado com contador e fonte, lista e CTA. Nenhum rosto ou voz é sintetizado.
 */
export const PhotoStory: React.FC<PhotoStoryProps> = (p) => {
  const { fps } = useVideoConfig();
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: p.palette.ink }}>
      <BrandFonts brand={p.brand} />
      {p.musicUrl ? <Audio src={p.musicUrl} volume={(f) => interpolate(f, [0, 12, storyDurationFrames(p, fps) - 24, storyDurationFrames(p, fps)], [0, 0.9, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /> : null}
      {p.scenes.map((s, i) => {
        const from = cursor;
        const dur = Math.round(s.seconds * fps);
        cursor += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <SceneSwitch scene={s} dur={dur} p={p} first={i === 0} />
          </Sequence>
        );
      })}
      <Grain />
    </AbsoluteFill>
  );
};

const SceneSwitch: React.FC<{ scene: StoryScene; dur: number; p: PhotoStoryProps; first: boolean }> = ({ scene, dur, p, first }) => {
  const frame = useCurrentFrame();
  // corte com cortina de cor de destaque entre cenas
  const wipe = first ? 1 : interpolate(frame, [0, 9], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const body = (() => {
    switch (scene.kind) {
      case "photo": return <PhotoScene s={scene} dur={dur} p={p} />;
      case "stat": return <StatScene s={scene} dur={dur} p={p} />;
      case "bar": return <BarScene s={scene} dur={dur} p={p} />;
      case "list": return <ListScene s={scene} dur={dur} p={p} />;
    }
  })();
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 ${(1 - wipe) * 100}% 0)` }}>
      {body}
      {!first ? <AbsoluteFill style={{ background: p.palette.accent, opacity: interpolate(frame, [0, 4, 10], [0.9, 0.5, 0], { extrapolateRight: "clamp" }) }} /> : null}
    </AbsoluteFill>
  );
};

/** Revela palavra por palavra a partir do quadro `start`. */
const Words: React.FC<{ text: string; start: number; style: React.CSSProperties; step?: number }> = ({ text, start, style, step = 3 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={style}>
      {text.split(" ").map((w, i) => {
        const t = spring({ frame: frame - start - i * step, fps, config: { damping: 18, stiffness: 160, mass: 0.6 } });
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: Math.min(1, t * 1.4), transform: `translateY(${(1 - t) * 40}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

const PhotoScene: React.FC<{ s: Extract<StoryScene, { kind: "photo" }>; dur: number; p: PhotoStoryProps }> = ({ s, dur, p }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const t = interpolate(frame, [0, dur], [0, 1]);
  const [z0, z1] = s.zoom ?? [1.05, 1.16];
  const scale = z0 + (z1 - z0) * t;
  const [fx, fy] = s.focus ?? [50, 35];
  const lead = s.lead ?? "";
  const leadWords = lead ? lead.split(" ").length : 0;
  const top = s.textAt === "top";
  return (
    <AbsoluteFill style={{ background: p.palette.ink, overflow: "hidden" }}>
      <Img
        src={s.image}
        style={{
          width: "100%", height: "100%", objectFit: "cover", objectPosition: `${fx}% ${fy}%`,
          transform: `scale(${scale}) translateY(${(s.drift ?? -1.5) * t}%)`, transformOrigin: `${fx}% ${fy}%`,
          filter: s.mono ? "grayscale(1) contrast(1.12) brightness(0.9)" : "contrast(1.05) saturate(0.92)",
        }}
      />
      <AbsoluteFill
        style={{
          background: top
            ? `linear-gradient(180deg, ${p.palette.ink}F2 0%, ${p.palette.ink}B0 34%, ${p.palette.ink}00 62%)`
            : `linear-gradient(180deg, ${p.palette.ink}00 38%, ${p.palette.ink}C8 70%, ${p.palette.ink}F5 100%)`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: top ? "flex-start" : "flex-end", padding: top ? "230px 80px 0" : "0 80px 300px" }}>
        {s.kicker ? <Kicker text={s.kicker} p={p} /> : null}
        {lead ? <Words text={lead} start={6} style={{ fontFamily: bodyFamily(p.brand), fontWeight: 600, fontSize: 58, lineHeight: 1.18, color: p.palette.paper, maxWidth: width - 160 }} /> : null}
        <Words
          text={s.punch}
          start={6 + leadWords * 3 + 8}
          step={4}
          style={{ fontFamily: headingFamily(p.brand), fontWeight: 800, fontSize: s.punchSize ?? 104, lineHeight: 1.0, letterSpacing: "-0.02em", color: p.palette.accent, marginTop: lead ? 22 : 0, maxWidth: width - 140 }}
        />
        {s.footer ? <Footer text={s.footer} p={p} delay={30} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ text: string; p: PhotoStoryProps }> = ({ text, p }) => {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 30, opacity: w }}>
      <div style={{ width: 70 * w, height: 6, background: p.palette.accent }} />
      <div style={{ fontFamily: bodyFamily(p.brand), fontWeight: 700, fontSize: 30, letterSpacing: "0.22em", color: p.palette.paper, textTransform: "uppercase" }}>{text}</div>
    </div>
  );
};

const Footer: React.FC<{ text: string; p: PhotoStoryProps; delay: number }> = ({ text, p, delay }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ marginTop: 44, opacity: o, fontFamily: bodyFamily(p.brand), fontWeight: 700, fontSize: 32, letterSpacing: "0.2em", color: p.palette.paper, textTransform: "uppercase" }}>
      {text}
    </div>
  );
};

const StatScene: React.FC<{ s: Extract<StoryScene, { kind: "stat" }>; dur: number; p: PhotoStoryProps }> = ({ s, p }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const count = interpolate(frame, [6, 6 + fps * 1.2], [0, s.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const ring = interpolate(frame, [6, 6 + fps * 1.2], [0, s.value / 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const R = 330, C = 2 * Math.PI * R;
  return (
    <AbsoluteFill style={{ background: p.palette.ink, alignItems: "center", padding: "210px 80px 0" }}>
      {s.kicker ? <div style={{ alignSelf: "flex-start" }}><Kicker text={s.kicker} p={p} /></div> : null}
      <div style={{ position: "relative", width: 2 * R + 60, height: 2 * R + 60, marginTop: 20 }}>
        <svg width={2 * R + 60} height={2 * R + 60} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={R + 30} cy={R + 30} r={R} fill="none" stroke={p.palette.paper} strokeOpacity={0.12} strokeWidth={22} />
          <circle cx={R + 30} cy={R + 30} r={R} fill="none" stroke={p.palette.accent} strokeWidth={22} strokeLinecap="round" strokeDasharray={`${C * ring} ${C}`} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: headingFamily(p.brand), fontWeight: 800, fontSize: 250, letterSpacing: "-0.04em", color: p.palette.paper }}>
          {Math.round(count)}<span style={{ fontSize: 140, color: p.palette.accent, marginLeft: 6 }}>{s.suffix ?? "%"}</span>
        </div>
      </div>
      <Words text={s.text} start={Math.round(fps * 1.1)} step={2} style={{ marginTop: 70, fontFamily: bodyFamily(p.brand), fontWeight: 600, fontSize: 56, lineHeight: 1.2, color: p.palette.paper, textAlign: "center", maxWidth: width - 160 }} />
      <Footer text={s.source} p={p} delay={Math.round(fps * 2)} />
    </AbsoluteFill>
  );
};

const BarScene: React.FC<{ s: Extract<StoryScene, { kind: "bar" }>; dur: number; p: PhotoStoryProps }> = ({ s, p }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const shrink = interpolate(frame, [fps * 1.0, fps * 2.0], [1, s.to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const barW = width - 160;
  return (
    <AbsoluteFill style={{ background: p.palette.ink, justifyContent: "center", padding: "0 80px" }}>
      <Words text={s.lead} start={4} style={{ fontFamily: bodyFamily(p.brand), fontWeight: 600, fontSize: 74, lineHeight: 1.15, color: p.palette.paper, maxWidth: barW }} />
      <div style={{ marginTop: 90, fontFamily: bodyFamily(p.brand), fontWeight: 700, fontSize: 30, letterSpacing: "0.22em", color: p.palette.paper, opacity: 0.7, textTransform: "uppercase" }}>{s.label}</div>
      <div style={{ marginTop: 20, width: barW, height: 70, background: `${p.palette.paper}1F`, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: barW * shrink, height: "100%", background: p.palette.accent }} />
      </div>
      <Words text={s.punch} start={Math.round(fps * 1.9)} step={4} style={{ marginTop: 80, fontFamily: headingFamily(p.brand), fontWeight: 800, fontSize: 112, lineHeight: 1.0, letterSpacing: "-0.02em", color: p.palette.accent }} />
    </AbsoluteFill>
  );
};

const ListScene: React.FC<{ s: Extract<StoryScene, { kind: "list" }>; dur: number; p: PhotoStoryProps }> = ({ s, p }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const gap = Math.round(fps * 0.55);
  const endAt = 6 + s.items.length * gap + 6;
  return (
    <AbsoluteFill style={{ background: p.palette.ink, justifyContent: "center", padding: "0 80px" }}>
      {s.kicker ? <Kicker text={s.kicker} p={p} /> : null}
      {s.items.map((it, i) => {
        const t = spring({ frame: frame - 6 - i * gap, fps, config: { damping: 20, stiffness: 150 } });
        return (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 30, marginBottom: 34, opacity: t, transform: `translateX(${(1 - t) * -60}px)` }}>
            <div style={{ fontFamily: headingFamily(p.brand), fontWeight: 800, fontSize: 40, color: p.palette.accent, width: 70 }}>{String(i + 1).padStart(2, "0")}</div>
            <div style={{ fontFamily: headingFamily(p.brand), fontWeight: 800, fontSize: 86, lineHeight: 1.04, letterSpacing: "-0.02em", color: p.palette.paper, maxWidth: width - 260 }}>{it}</div>
          </div>
        );
      })}
      <Words text={s.punch} start={endAt} step={4} style={{ marginTop: 60, fontFamily: headingFamily(p.brand), fontWeight: 800, fontSize: 100, lineHeight: 1.0, letterSpacing: "-0.02em", color: p.palette.accent }} />
    </AbsoluteFill>
  );
};

/** Granulação leve para o vídeo não parecer "plano" demais. */
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = frame % 8;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.07, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id={`g${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} /></filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const storyDurationFrames = (p: PhotoStoryProps, fps: number) => p.scenes.reduce((a, s) => a + Math.round(s.seconds * fps), 0);
