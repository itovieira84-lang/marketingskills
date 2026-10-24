import { renderStillPng } from "../packages/engine/src/media/remotion";
const t = Date.now();
const r = await renderStillPng("PieceStill", {
  variant: "carousel_cover", size: { width: 1080, height: 1350 }, title: "Teste de capa", body: "Corpo", index: 1, total: 6, cta: "Salve",
  photoUrl: null, brand: { clientName: "X", colors: { primary: "#1F3A5F", secondary: "#F2C14E", background: "#FAFAF7", text: "#121212" }, fonts: { heading: "Inter Display", body: "Inter" } },
}, "storage/_tmp/smoke.png");
console.log(r, Date.now() - t, "ms");
