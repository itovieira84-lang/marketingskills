import Link from "next/link";
import { notFound } from "next/navigation";
import { withCtx, maybe, can } from "@vyve/engine";
import { decideResearchAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { APPROVAL_LABEL, dt } from "@/lib/format";
import { Back, Badge, Button, Card, Fictitious, Flash, PageHeader, Table, Td } from "@/components/ui";
import { Markdown } from "@/components/markdown";

export default async function PesquisaDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const s = await requireSession();
  const r = await withCtx(ctxOf(s), (tx) => maybe(tx, "select r.*, c.name as client_name, b.title from vyve.research r join vyve.clients c on c.id = r.client_id join vyve.briefings b on b.id = r.briefing_id where r.id = $1", [id]));
  if (!r) notFound();
  const here = `/pesquisa/${id}`;
  return (
    <>
      <PageHeader title={`Pesquisa · ${r.title}`} sub={<>{r.client_name} · {dt(r.created_at)} · via {r.provider} · <Link href={`/lotes/${r.batch_id}`} className="text-cobalt hover:underline">ver lote</Link></>}
        actions={<><Badge status={r.approval} label={APPROVAL_LABEL[r.approval]} className="self-center text-sm" /><Fictitious on={r.is_fictitious} /></>} />
      <Flash sp={await searchParams} />
      {r.approval === "pendente" && can(s.role, "research.approve") ? (
        <form action={decideResearchAction} className="mb-6 flex flex-wrap gap-2">
          <Back to={here} /><input type="hidden" name="research_id" value={id} />
          <Button variant="ok" name="decision" value="aprovado">Aprovar pesquisa</Button>
          <Button variant="ghost" name="decision" value="alteracao_solicitada">Pedir nova pesquisa</Button>
        </form>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Relatório" className="lg:col-span-2"><Markdown text={r.report_md} /></Card>
        <div className="space-y-6">
          <Card title={`Fontes verificadas (${r.sources.length})`}>
            <ul className="space-y-2 text-sm">
              {r.sources.map((src: any) => (
                <li key={src.url}><a href={src.url} target="_blank" rel="noreferrer noopener" className="font-medium text-cobalt hover:underline">{src.title || src.url}</a>
                  <span className="block text-xs text-muted">{[src.publisher, src.published_at, src.verified_by && `verificada por ${src.verified_by}`].filter(Boolean).join(" · ")}</span></li>
              ))}
            </ul>
          </Card>
          <Card title={`Descartadas por falta de fonte (${r.dropped_claims.length})`}>
            {r.dropped_claims.length ? (
              <ul className="space-y-2 text-sm">{r.dropped_claims.map((d: any, i: number) => <li key={i} className="text-muted"><span className="text-ink">{d.text ?? d.claim ?? JSON.stringify(d)}</span>{d.reason ? <span className="block text-xs">{d.reason}</span> : null}</li>)}</ul>
            ) : <p className="text-sm text-muted">Nada descartado.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
