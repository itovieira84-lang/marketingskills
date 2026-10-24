import React, { useEffect, useState } from "react";
import { continueRender, delayRender, Img } from "remotion";
import type { BrandProps, Caption } from "../types";

const SYSTEM_FALLBACK = '"Inter", "DejaVu Sans", "Liberation Sans", Arial, sans-serif';

export const headingFamily = (b: BrandProps) => `"VyveHeading", "${b.fonts.heading}", ${SYSTEM_FALLBACK}`;
export const bodyFamily = (b: BrandProps) => `"VyveBody", "${b.fonts.body}", ${SYSTEM_FALLBACK}`;

/** Carrega as fontes da biblioteca da marca antes de renderizar o quadro. */
export const BrandFonts: React.FC<{ brand: BrandProps }> = ({ brand }) => {
  const [handle] = useState(() => delayRender("fontes da marca"));
  useEffect(() => {
    const jobs: Promise<unknown>[] = [];
    const add = (family: string, url?: string | null) => {
      if (!url) return;
      const face = new FontFace(family, `url(${url})`);
      jobs.push(face.load().then((f) => (document as any).fonts.add(f)).catch(() => undefined));
    };
    add("VyveHeading", brand.fontUrls?.heading);
    add("VyveBody", brand.fontUrls?.body);
    Promise.all(jobs).then(() => continueRender(handle));
  }, [brand, handle]);
  return null;
};

/** Logo original, sempre com proporção preservada (objectFit contain), nunca esticado. */
export const Logo: React.FC<{ brand: BrandProps; maxW: number; maxH: number; style?: React.CSSProperties }> = ({ brand, maxW, maxH, style }) => {
  if (!brand.logoUrl) return null;
  return <Img src={brand.logoUrl} style={{ maxWidth: maxW, maxHeight: maxH, width: "auto", height: "auto", objectFit: "contain", ...style }} />;
};

/** Contraste simples para escolher texto claro/escuro sobre a cor primária. */
export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

/** Legenda sincronizada: mostra a frase ativa no tempo atual. */
export const CaptionLine: React.FC<{ captions: Caption[]; ms: number; brand: BrandProps; bottom: number; width: number }> = ({ captions, ms, brand, bottom, width }) => {
  const active = captions.find((c) => ms >= c.startMs && ms < c.endMs);
  if (!active) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: width,
          padding: "18px 28px",
          background: "rgba(0,0,0,0.62)",
          color: "#fff",
          fontFamily: bodyFamily(brand),
          fontWeight: 700,
          fontSize: 52,
          lineHeight: 1.18,
          textAlign: "center",
          borderRadius: 14,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
