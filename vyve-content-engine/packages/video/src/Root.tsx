import React from "react";
import { Composition, Still } from "remotion";
import { PieceStill } from "./compositions/PieceStill";
import { PhotoStory, storyDurationFrames } from "./compositions/PhotoStory";
import { EditedReel, MotionReel, motionDurationS, reelDurationS } from "./compositions/Reels";
import { FALLBACK_BRAND, type EditedReelProps, type MotionReelProps, type PhotoStoryProps, type StillProps } from "./types";

const FPS = 30;

const stillDefaults: StillProps = {
  variant: "carousel_cover",
  size: { width: 1080, height: 1350 },
  title: "Três erros que travam seu crescimento",
  body: "E o que fazer no lugar de cada um.",
  index: 1,
  total: 6,
  cta: "Salve para depois",
  photoUrl: null,
  brand: FALLBACK_BRAND,
};

export const Root: React.FC = () => (
  <>
    <Still
      id="PieceStill"
      component={PieceStill}
      width={1080}
      height={1350}
      defaultProps={stillDefaults}
      calculateMetadata={({ props }) => ({ width: props.size.width, height: props.size.height })}
    />
    <Composition
      id="EditedReel"
      component={EditedReel}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={FPS * 15}
      defaultProps={{
        videoUrl: "https://remotion.media/video.mp4",
        durationS: 15,
        size: { width: 1080, height: 1920 },
        headline: "O erro que ninguém te conta",
        cta: "Siga para mais",
        captions: [],
        musicUrl: null,
        brand: FALLBACK_BRAND,
      } satisfies EditedReelProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(reelDurationS(props) * FPS),
        width: props.size.width,
        height: props.size.height,
      })}
    />
    <Composition
      id="MotionReel"
      component={MotionReel}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={FPS * 10}
      defaultProps={{
        images: [],
        audioUrl: null,
        musicUrl: null,
        size: { width: 1080, height: 1920 },
        scenes: [
          { text: "Você está fazendo isso errado?", seconds: 3 },
          { text: "O problema em uma frase", seconds: 4 },
          { text: "Salve este vídeo", seconds: 3 },
        ],
        captions: [],
        cta: "Salve este vídeo",
        brand: FALLBACK_BRAND,
      } satisfies MotionReelProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round(motionDurationS(props) * FPS),
        width: props.size.width,
        height: props.size.height,
      })}
    />
    <Composition
      id="PhotoStory"
      component={PhotoStory}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={FPS * 10}
      defaultProps={{
        scenes: [{ kind: "list", seconds: 5, items: ["Atendimento.", "Confiança."], punch: "Isso não se copia." }],
        musicUrl: null,
        palette: { ink: "#141414", paper: "#EDE6DA", accent: "#B87333" },
        brand: FALLBACK_BRAND,
      } satisfies PhotoStoryProps}
      calculateMetadata={({ props }) => ({ durationInFrames: storyDurationFrames(props, FPS) })}
    />
  </>
);
