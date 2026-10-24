import Link from "next/link";
import { listPieces } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { PRODUCTION_LABEL } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { PieceGrid } from "@/components/piece-card";

export const metadata = { title: "Produção audiovisual" };

export default async function Audiovisual({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const { status } = await searchParams;
  const all = await listPieces(ctxOf(s), { formats: ["reel", "long_video"] });
  const pieces = status ? all.filter((p: any) => p.production_status === status) : all;
  const byMode = (m: string) => all.filter((p: any) => p.production_mode === m).length;
  return (
    <>
      <PageHeader title="Produção audiovisual" sub="Agente 03 (Remotion + FFmpeg). Caso A: corta e reenquadra o vídeo original. Caso B: monta com imagens e narração autorizadas. Caso C: só storyboard, marcado como pendente." />
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        {[["A", "vídeo original editado"], ["B", "imagens + narração"], ["C", "storyboard (pendente)"]].map(([m, l]) => (
          <div key={m} className="rounded-lg border border-line bg-surface px-4 py-3"><span className="font-display text-2xl font-bold">{byMode(m)}</span><span className="block text-xs text-muted">Caso {m}: {l}</span></div>
        ))}
      </div>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["", "Todas"], ...Object.entries(PRODUCTION_LABEL)].map(([v, l]) => <Link key={v} href={v ? `/audiovisual?status=${v}` : "/audiovisual"} className={`rounded-full px-3 py-1 ring-1 ${(status ?? "") === v ? "bg-ink text-white ring-ink" : "ring-line hover:ring-cobalt"}`}>{l}</Link>)}
      </nav>
      <Card>{pieces.length ? <PieceGrid pieces={pieces} /> : <Empty>Nenhum vídeo neste filtro.</Empty>}</Card>
    </>
  );
}
