import Link from "next/link";
import { listPieces, listScripts, pendingResearch } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL, dt } from "@/lib/format";
import { Card, Empty, Fictitious, Flash, PageHeader } from "@/components/ui";
import { PieceGrid } from "@/components/piece-card";

export const metadata = { title: "Aprovações" };

export default async function Aprovacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const ctx = ctxOf(s);
  const [research, scripts, pieces] = await Promise.all([pendingResearch(ctx), listScripts(ctx, { approval: "pendente" }), listPieces(ctx, { approval: "pendente" })]);
  const scriptsByBatch = new Map<string, any[]>();
  for (const sc of scripts) scriptsByBatch.set(sc.batch_id, [...(scriptsByBatch.get(sc.batch_id) ?? []), sc]);
  return (
    <>
      <PageHeader title="Aprovações" sub="Nada é agendado ou publicado sem uma pessoa aprovar. Pesquisa e roteiros podem exigir aprovação antes da produção, conforme o cliente." />
      <Flash sp={await searchParams} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Pesquisas (${research.length})`}>
          {research.length ? <ul className="divide-y divide-line text-sm">{research.map((r: any) => <li key={r.id} className="flex justify-between gap-2 py-2"><Link href={`/pesquisa/${r.id}`} className="font-medium text-cobalt hover:underline">{r.title} <Fictitious on={r.is_fictitious} /></Link><span className="text-muted">{r.client_name} · {dt(r.created_at)}</span></li>)}</ul> : <Empty>Nenhuma pesquisa aguardando.</Empty>}
        </Card>
        <Card title={`Roteiros (${scripts.length})`}>
          {scripts.length ? (
            <ul className="divide-y divide-line text-sm">
              {[...scriptsByBatch].map(([batchId, list]) => (
                <li key={batchId} className="flex justify-between gap-2 py-2">
                  <Link href={`/lotes/${batchId}`} className="font-medium text-cobalt hover:underline">{list.length} roteiro(s) · {list[0].client_name}</Link>
                  <span className="text-xs text-muted">{[...new Set(list.map((x) => FORMAT_LABEL[x.format]))].join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nenhum roteiro aguardando.</Empty>}
        </Card>
      </div>
      <Card title={`Peças prontas para aprovar (${pieces.length})`} className="mt-6">
        {pieces.length ? <PieceGrid pieces={pieces} /> : <Empty>Nenhuma peça aguardando.</Empty>}
      </Card>
    </>
  );
}
