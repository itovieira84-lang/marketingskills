export interface BrandProps {
  clientName: string;
  colors: { primary: string; secondary: string; background: string; text: string };
  fonts: { heading: string; body: string };
  /** URLs (http) de arquivos de fonte da biblioteca da marca, se houver. */
  fontUrls?: { heading?: string | null; body?: string | null };
  /** Logo original do cliente. Nunca é recriado: se faltar, a arte sai sem logo. */
  logoUrl?: string | null;
}

export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Scene {
  text: string;
  seconds: number;
  imageIndex?: number;
}

export type StillVariant = "carousel_cover" | "carousel_slide" | "carousel_end" | "card" | "story" | "reel_cover" | "thumbnail";

export interface StillProps {
  variant: StillVariant;
  size: { width: number; height: number };
  title: string;
  body: string;
  index: number;
  total: number;
  cta: string;
  photoUrl?: string | null;
  brand: BrandProps;
  [key: string]: unknown;
}

export interface EditedReelProps {
  videoUrl: string;
  durationS: number;
  size: { width: number; height: number };
  headline: string;
  cta: string;
  captions: Caption[];
  musicUrl?: string | null;
  brand: BrandProps;
  [key: string]: unknown;
}

export interface MotionReelProps {
  images: string[];
  audioUrl?: string | null;
  musicUrl?: string | null;
  size: { width: number; height: number };
  scenes: Scene[];
  captions: Caption[];
  cta: string;
  brand: BrandProps;
  [key: string]: unknown;
}

export const FALLBACK_BRAND: BrandProps = {
  clientName: "Cliente de exemplo",
  colors: { primary: "#1F3A5F", secondary: "#F2C14E", background: "#FAFAF7", text: "#121212" },
  fonts: { heading: "Inter Display", body: "Inter" },
  logoUrl: null,
};

/** Reels sem fala (modo "foto + tipografia"): só fotos reais do cliente, sem rosto ou voz sintetizados. */
export type StoryScene =
  | { kind: "photo"; seconds: number; image: string; lead?: string; punch: string; punchSize?: number; kicker?: string; footer?: string; textAt?: "top" | "bottom"; focus?: [number, number]; zoom?: [number, number]; drift?: number; mono?: boolean }
  | { kind: "stat"; seconds: number; value: number; suffix?: string; text: string; source: string; kicker?: string }
  | { kind: "bar"; seconds: number; lead: string; label: string; to: number; punch: string }
  | { kind: "list"; seconds: number; items: string[]; punch: string; kicker?: string };

export type PhotoStoryProps = {
  scenes: StoryScene[];
  musicUrl: string | null;
  palette: { ink: string; paper: string; accent: string };
  brand: BrandProps;
};
