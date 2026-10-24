import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { StillProps } from "../types";
import { BrandFonts, Logo, bodyFamily, headingFamily, readableOn } from "../components/brand";

/**
 * Arte estática da marca: capa/slide/fecho de carrossel, card, story, capa de
 * Reels e miniatura horizontal. Hierarquia: título > corpo > CTA, com uma faixa
 * de cor secundária como único elemento de destaque.
 */
export const PieceStill: React.FC<StillProps> = (p) => {
  const { brand, size } = p;
  const { primary, secondary, background, text } = brand.colors;
  const vertical = size.height / size.width > 1.5;
  const horizontal = size.width > size.height;
  const pad = Math.round(size.width * 0.085);
  const cover = p.variant === "carousel_cover" || p.variant === "reel_cover" || p.variant === "thumbnail";
  const filled = cover || p.variant === "card" || p.variant === "carousel_end";
  const bg = filled ? primary : background;
  const fg = filled ? readableOn(primary) : text;
  const titleSize = horizontal ? 104 : cover ? (vertical ? 118 : 100) : p.variant === "card" ? 92 : vertical ? 96 : 84;
  const bodySize = horizontal ? 40 : vertical ? 52 : 46;
  const anchorBottom = cover || Boolean(p.photoUrl) || p.variant === "carousel_end";

  return (
    <AbsoluteFill style={{ background: bg, color: fg }}>
      <BrandFonts brand={brand} />
      {p.photoUrl ? (
        <AbsoluteFill>
          <Img src={p.photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.78) 100%)` }} />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ padding: pad, display: "flex", flexDirection: "column", justifyContent: anchorBottom ? "flex-end" : "center", color: p.photoUrl ? "#fff" : fg }}>
        {p.variant === "carousel_slide" || (p.variant === "story" && p.total > 1) ? (
          <div style={{ position: "absolute", top: pad, left: pad, fontFamily: bodyFamily(brand), fontSize: 34, fontWeight: 600, opacity: 0.55 }}>
            {p.index}/{p.total}
          </div>
        ) : null}
        <div style={{ width: 120, height: 14, background: secondary, marginBottom: 40 }} />
        <div
          style={{
            fontFamily: headingFamily(brand),
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            maxWidth: size.width - pad * 2,
            textWrap: "balance" as any,
          }}
        >
          {p.title}
        </div>
        {p.body ? (
          <div style={{ fontFamily: bodyFamily(brand), fontSize: bodySize, lineHeight: 1.35, marginTop: 36, maxWidth: Math.min(size.width - pad * 2, 900), opacity: 0.92 }}>
            {p.body}
          </div>
        ) : null}
        {p.cta && (p.variant === "carousel_end" || p.variant === "story" || p.variant === "card") ? (
          <div
            style={{
              marginTop: 56,
              alignSelf: "flex-start",
              background: secondary,
              color: readableOn(secondary),
              fontFamily: bodyFamily(brand),
              fontWeight: 700,
              fontSize: 38,
              padding: "20px 34px",
              borderRadius: 999,
            }}
          >
            {p.cta}
          </div>
        ) : null}
      </AbsoluteFill>

      <div style={{ position: "absolute", top: pad * 0.7, right: pad * 0.7 }}>
        <Logo brand={brand} maxW={size.width * 0.22} maxH={size.height * 0.07} />
      </div>
    </AbsoluteFill>
  );
};
