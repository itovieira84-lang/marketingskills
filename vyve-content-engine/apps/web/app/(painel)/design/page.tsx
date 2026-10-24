import Link from "next/link";
import { listPieces } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { PieceGrid } from "@/components/piece-card";

export const metadata = { title: "Design" };
const DESIGN = ["carousel", "card", "story_sequence", "authority_post", "newsletter"];

export default async function Design({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const { formato } = await searchParams;
  const pieces = await listPieces(ctxOf(s), { formats: formato ? [formato] : DESIGN });
  return (
    <>
      <PageHeader title="Design" sub="Agente 04. Carrosséis 1080×1350, cards, Stories 1080×1920 e capas, sempre com as cores, fontes e o logo da biblioteca de marca." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {["", ...DESIGN].map((v) => <Link key={v} href={v ? `/design?formato=${v}` : "/design"} className={`rounded-full px-3 py-1 ring-1 ${(formato ?? "") === v ? "bg-ink text-white ring-ink" : "ring-line hover:ring-cobalt"}`}>{v ? FORMAT_LABEL[v] : "Todos"}</Link>)}
      </nav>
      <Card>{pieces.length ? <PieceGrid pieces={pieces} /> : <Empty>Nenhuma peça de design neste filtro.</Empty>}</Card>
    </>
  );
}
