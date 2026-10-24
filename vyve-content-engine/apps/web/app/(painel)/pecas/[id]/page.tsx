import Link from "next/link";
import { notFound } from "next/navigation";
import { getPiece, can } from "@vyve/engine";
import { decidePieceAction, reproducePieceAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { APPROVAL_LABEL, FORMAT_LABEL, PRODUCTION_LABEL, STAGE_LABEL, dt } from "@/lib/format";
import { Back, Badge, Button, Card, Empty, Flash, PageHeader, StageRibbon, fileUrl, inputCls } from "@/components/ui";
import { Markdown } from "@/components/markdown";

export default async function Peca({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const s = await requireSession();
  const data = await getPiece(ctxOf(s), id);
  if (!data) notFound();
  const { piece: p, script, assets, history, approvals, publications } = data;
  const here = `/pecas/${id}`;
  const media = assets.filter((a: any) => a.mime.startsWith("image/") || a.mime.startsWith("video/"));
  const docs = assets.filter((a: any) => !media.includes(a));
  const qa = p.qa ?? {};
  const issues: Array<{ level: string; message: string }> = [...(qa.text?.blocking ?? []).map((m: string) => ({ level: "err", message: m })), ...(qa.text?.warnings ?? []).map((m: string) => ({ level: "warn", message: m })), ...(qa.media_problems ?? []).map((m: string) => ({ level: "err", message: m }))];
  const canDecide = p.approval === "pendente" && (can(s.role, "piece.approve") || can(s.role, "piece.request_change"));
  return (
    <>
      <PageHeader title={`#${p.seq} · ${p.title}`}
        sub={<>{p.client_name} · {FORMAT_LABEL[p.format]} · v{p.version}{p.production_mode ? ` · ${p.production_mode.length === 1 ? `caso ${p.production_mode}` : p.production_mode}` : ""} · <Link href={`/lotes/${p.batch_id}`} className="text-cobalt hover:underline">lote</Link>{script ? <> · <Link href={`/roteiros/${script.id}`} className="text-cobalt hover:underline">roteiro</Link></> : null}</>}
        actions={<><Badge status={p.production_status} label={PRODUCTION_LABEL[p.production_status]} className="self-center text-sm" /><Badge status={p.approval} label={APPROVAL_LABEL[p.approval]} className="self-center text-sm" /></>} />
      <Flash sp={await searchParams} />
      <section className="mb-6"><StageRibbon current={p.stage} /></section>
      {p.pending_reasons?.length ? (
        <div className="mb-6 rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm">
          <p className="font-semibold text-warn">Pendente de produção</p>
          <ul className="mt-1 list-disc pl-5">{p.pending_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Arquivos gerados (${assets.length})`}>
            {media.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((a: any) => (
                  <figure key={a.id} className="overflow-hidden rounded-md border border-line">
                    {a.mime.startsWith("video/")
                      ? <video src={fileUrl(a.id)} controls preload="metadata" className="aspect-[9/16] w-full bg-ink object-contain" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={fileUrl(a.id)} alt={a.label} loading="lazy" className="w-full bg-paper object-contain" />}
                    <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                      <span className="truncate">{a.label}</span>
                      <a href={`${fileUrl(a.id)}?download=1`} className="shrink-0 text-cobalt hover:underline">baixar</a>
                    </figcaption>
                    <p className="px-2 pb-1.5 text-[11px] text-muted">{a.width}×{a.height}{a.duration_s ? ` · ${Number(a.duration_s).toFixed(1)}s` : ""}</p>
                  </figure>
                ))}
              </div>
            ) : <Empty>Nenhuma imagem ou vídeo renderizado para esta peça.</Empty>}
            {docs.length ? <ul className="mt-3 space-y-1 text-sm">{docs.map((a: any) => <li key={a.id}><a href={`${fileUrl(a.id)}?download=1`} className="text-cobalt hover:underline">{a.label}</a> <span className="text-xs text-muted">{a.mime}</span></li>)}</ul> : null}
          </Card>
          {p.body ? <Card title="Texto final"><Markdown text={p.body} /></Card> : null}
          {p.caption ? <Card title="Legenda"><p className="whitespace-pre-wrap text-sm">{p.caption}</p></Card> : null}
        </div>
        <div className="space-y-6">
          {canDecide ? (
            <Card title="Aprovação">
              <form action={decidePieceAction} className="space-y-3">
                <Back to={here} /><input type="hidden" name="piece_id" value={id} />
                <textarea name="comment" rows={3} placeholder="Comentário (obrigatório para alteração ou rejeição)" className={inputCls} />
                <div className="flex flex-wrap gap-2">
                  {can(s.role, "piece.approve") ? <Button variant="ok" name="decision" value="aprovado">Aprovar</Button> : null}
                  <Button variant="ghost" name="decision" value="alteracao_solicitada">Pedir alteração</Button>
                  {can(s.role, "piece.approve") ? <Button variant="danger" name="decision" value="rejeitado">Rejeitar</Button> : null}
                </div>
              </form>
            </Card>
          ) : null}
          {can(s.role, "batch.start") ? (
            <form action={reproducePieceAction}><Back to={here} /><input type="hidden" name="piece_id" value={id} /><Button variant="ghost" className="w-full">Produzir nova versão</Button></form>
          ) : null}
          <Card title="Revisão automática">
            {qa.production_notes?.length ? <p className="mb-2 text-xs text-muted">{qa.production_notes.join(" · ")}</p> : null}
            {issues.length ? (
              <ul className="space-y-1.5 text-sm">{issues.map((i, k) => <li key={k} className={i.level === "err" ? "text-err" : "text-warn"}>{i.level === "err" ? "Bloqueio: " : "Atenção: "}{i.message}</li>)}</ul>
            ) : <p className="text-sm text-muted">{qa.text ? "Sem apontamentos de texto ou mídia." : "Ainda não revisada."}</p>}
          </Card>
          <Card title="Histórico">
            <ol className="space-y-2 text-sm">
              {history.map((h: any) => (
                <li key={h.id}><span className="text-xs text-muted">{dt(h.at)} · {h.user_name ?? h.actor_agent ?? "sistema"}</span>
                  <span className="block">{h.from_stage ? `${STAGE_LABEL[h.from_stage]} → ` : ""}{STAGE_LABEL[h.to_stage] ?? ""}{h.note ? <span className="text-muted"> · {h.note}</span> : null}</span></li>
              ))}
            </ol>
          </Card>
          {approvals.length ? (
            <Card title="Decisões">
              <ul className="space-y-2 text-sm">{approvals.map((a: any) => <li key={a.id}><Badge status={a.decision} label={APPROVAL_LABEL[a.decision]} /> v{a.piece_version} <span className="text-xs text-muted">{a.user_name ?? ""} {dt(a.decided_at)}</span>{a.comment ? <span className="block">{a.comment}</span> : null}</li>)}</ul>
            </Card>
          ) : null}
          {publications.length ? (
            <Card title="Publicações">
              <ul className="space-y-2 text-sm">{publications.map((x: any) => <li key={x.id}><Badge status={x.status} /> {x.channel} {x.external_id ? <code className="text-xs">{x.external_id}</code> : null}{x.error ? <span className="block text-xs text-err">{x.error}</span> : null}</li>)}</ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
