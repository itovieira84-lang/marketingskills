import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { EditedReelProps, MotionReelProps } from "../types";
import { BrandFonts, CaptionLine, Logo, bodyFamily, headingFamily, readableOn } from "../components/brand";

const HEADLINE_S = 3.2;
const CTA_S = 3;

/** Caso A: existe vídeo original. Vídeo cortado + título de abertura + legendas + CTA final. */
export const EditedReel: React.FC<EditedReelProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { primary, secondary } = p.brand.colors;
  const ctaFrom = durationInFrames - Math.round(CTA_S * fps);
  const headIn = spring({ frame, fps, config: { damping: 200 } });
  const headOut = interpolate(frame, [HEADLINE_S * fps - 8, HEADLINE_S * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <BrandFonts brand={p.brand} />
      <OffthreadVideo src={p.videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {p.musicUrl ? <Audio src={p.musicUrl} volume={0.12} /> : null}

      <Sequence durationInFrames={Math.round(HEADLINE_S * fps)}>
        <AbsoluteFill style={{ justifyContent: "flex-start", padding: "220px 80px 0", opacity: headOut }}>
          <div
            style={{
              transform: `translateY(${(1 - headIn) * 40}px)`,
              alignSelf: "flex-start",
              background: primary,
              color: readableOn(primary),
              fontFamily: headingFamily(p.brand),
              fontWeight: 800,
              fontSize: 82,
              lineHeight: 1.06,
              padding: "26px 34px",
              borderLeft: `16px solid ${secondary}`,
              maxWidth: width - 160,
            }}
          >
            {p.headline}
          </div>
        </AbsoluteFill>
      </Sequence>

      <CaptionLine captions={p.captions} ms={ms} brand={p.brand} bottom={360} width={width - 140} />

      <Sequence from={ctaFrom}>
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 200 }}>
          <div style={{ background: secondary, color: readableOn(secondary), fontFamily: bodyFamily(p.brand), fontWeight: 800, fontSize: 56, padding: "24px 44px", borderRadius: 999 }}>
            {p.cta}
          </div>
        </AbsoluteFill>
      </Sequence>

      <div style={{ position: "absolute", top: 90, right: 70 }}>
        <Logo brand={p.brand} maxW={220} maxH={110} />
      </div>
    </AbsoluteFill>
  );
};

/** Caso B: imagens + narração. Cenas com movimento lento (Ken Burns), texto da cena e legendas. */
export const MotionReel: React.FC<MotionReelProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { primary, secondary, background, text } = p.brand.colors;
  let cursor = 0;

  return (
    <AbsoluteFill style={{ background: background }}>
      <BrandFonts brand={p.brand} />
      {p.audioUrl ? <Audio src={p.audioUrl} /> : null}
      {p.musicUrl ? <Audio src={p.musicUrl} volume={0.1} /> : null}
      {p.scenes.map((scene, i) => {
        const from = cursor;
        const dur = Math.max(1, Math.round(scene.seconds * fps));
        cursor += dur;
        const img = p.images.length ? p.images[(scene.imageIndex ?? i) % p.images.length] : null;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Scene img={img} text={scene.text} dur={dur} primary={primary} secondary={secondary} textColor={text} brand={p.brand} width={width} />
          </Sequence>
        );
      })}
      <CaptionLine captions={p.captions} ms={ms} brand={p.brand} bottom={300} width={width - 140} />
      <div style={{ position: "absolute", top: 90, right: 70 }}>
        <Logo brand={p.brand} maxW={220} maxH={110} />
      </div>
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ img: string | null; text: string; dur: number; primary: string; secondary: string; textColor: string; brand: MotionReelProps["brand"]; width: number }> = ({ img, text, dur, primary, secondary, brand, width }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, dur], [1.04, 1.14]);
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: primary }}>
      {img ? <Img src={img} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} /> : null}
      <AbsoluteFill style={{ background: img ? "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.75) 100%)" : "transparent" }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 80px 620px" }}>
        <div style={{ width: 110, height: 12, background: secondary, marginBottom: 32, transform: `scaleX(${enter})`, transformOrigin: "left" }} />
        <div
          style={{
            color: img ? "#fff" : readableOn(primary),
            fontFamily: headingFamily(brand),
            fontWeight: 800,
            fontSize: 84,
            lineHeight: 1.06,
            maxWidth: width - 160,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 30}px)`,
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const reelDurationS = (p: EditedReelProps) => Math.max(HEADLINE_S + CTA_S, p.durationS);
export const motionDurationS = (p: MotionReelProps) => Math.max(1, p.scenes.reduce((a, s) => a + s.seconds, 0));
export { bodyFamily };
