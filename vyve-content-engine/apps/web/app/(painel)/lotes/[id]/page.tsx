import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatch, can } from "@vyve/engine";
import { cancelBatchAction, decideResearchAction, decideScriptsAction, kickQueueAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { AGENT_LABEL, APPROVAL_LABEL, BATCH_LABEL, FORMAT_LABEL, RUN_LABEL, dt, usd } from "@/lib/format";
import { Back, Badge, Button, Card, Empty, Fictitious, Flash, PageHeader, StageRibbon, Table, Td, inputCls } from "@/components/ui";
import { PieceGrid } from "@/components/piece-card";
import { Markdown } from "@/components/markdown";

export const metadata = { title: "Lote" };

export default async function Lote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const s = await requireSession();
  const data = await getBatch(ctxOf(s), id);
  if (!data) notFound();
  const { batch, runs, research, pieces, logs, costs } = data;
  const here = `/lotes/${id}`;
  const counts: Record<string, number> = {};
  for (const p of pieces) counts[p.stage] = (counts[p.stage] ?? 0) + 1;
  const pendingScripts = pieces.filter((p: any) => p.script_id && p.script_approval === "pendente");
  const external = runs.filter((r: any) => r.status === "awaiting_external");
  const open = !["completed", "completed_with_pending", "failed", "cancelled"].includes(batch.status);
  return (
    <>
      <PageHeader
        title={batch.title}
        sub={<>{batch.client_name} · tema: {batch.theme} · modo <strong>{batch.provider}</strong> · orçamento {usd(batch.budget_usd)} · gasto {usd(batch.cost_usd)}</>}
        actions={<>
          <Badge status={batch.status} label={BATCH_LABEL[batch.status]} className="self-center text-sm" />
          <Fictitious on={batch.is_fictitious} />
          {open ? <form action={kickQueueAction}><Back to={here} /><Button variant="ghost">Processar fila</Button></form> : null}
          {open && can(s.role, "batch.start") ? <form action={cancelBatchAction}><Back to={here} /><input type="hidden" name="batch_id" value={id} /><Button variant="danger">Cancelar lote</Button></form> : null}
        </>}
      />
      <Flash sp={await searchParams} />
      <section className="mb-6"><StageRibbon counts={counts} /></section>

      {external.length ? (
        <div className="mb-6 rounded-lg border border-cobalt/30 bg-cobalt/5 p-4 text-sm">
          <p className="font-semibold text-cobalt">{external.length} etapa(s) aguardando os subagentes do Claude Code</p>
          <p className="mt-1 text-muted">No terminal do projeto, peça ao Claude Code: <em>“responda as tarefas pendentes do VYVE”</em>. Ele usa <code>npm run vyve -- task list</code>, <code>task show</code> e <code>task submit</code>.</p>
          <ul className="mt-2 font-mono text-xs">{external.map((r: any) => <li key={r.id}>{r.step} · {r.id}</li>)}</ul>
        </div>
      ) : null}

      <div className="grid gap-6">
        {research ? (
          <Card title={<span className="flex items-center gap-2">Pesquisa estratégica <Badge status={research.approval} label={APPROVAL_LABEL[research.approval]} /><Fictitious on={research.is_fictitious} /></span>}
            actions={<Link href={`/pesquisa/${research.id}`} className="text-sm text-cobalt hover:underline">abrir completa</Link>}>
            <div className="max-h-[28rem] overflow-y-auto pr-2"><Markdown text={research.report_md} /></div>
            {research.dropped_claims?.length ? <p className="mt-3 text-xs text-warn">{research.dropped_claims.length} afirmação(ões) descartada(s) por falta de fonte verificável.</p> : null}
            {research.approval === "pendente" && can(s.role, "research.approve") ? (
              <form action={decideResearchAction} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Back to={here} /><input type="hidden" name="research_id" value={research.id} />
                <Button variant="ok" name="decision" value="aprovado">Aprovar pesquisa</Button>
                <Button variant="ghost" name="decision" value="alteracao_solicitada">Pedir nova pesquisa</Button>
              </form>
            ) : null}
          </Card>
        ) : null}

        {pendingScripts.length && can(s.role, "script.approve") ? (
          <Card title={`Roteiros aguardando aprovação (${pendingScripts.length})`}>
            <form action={decideScriptsAction} className="space-y-3">
              <Back to={here} />
              <ul className="divide-y divide-line">
                {pendingScripts.map((p: any) => (
                  <li key={p.id} className="flex gap-3 py-3">
                    <input type="checkbox" name="script_id" value={p.script_id} defaultChecked className="mt-1" aria-label={`Selecionar roteiro ${p.seq}`} />
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">#{p.seq} · {p.payload?.title ?? p.title} <span className="font-normal text-muted">({FORMAT_LABEL[p.format]}{p.payload?.duration_s ? `, ${p.payload.duration_s}s` : ""}, {p.payload?.funnel_stage})</span></p>
                      <p className="text-muted"><strong className="text-ink">Gancho:</strong> {p.payload?.hook}</p>
                      <p className="text-muted"><strong className="text-ink">CTA:</strong> {p.payload?.cta}</p>
                      <Link href={`/roteiros/${p.script_id}`} className="text-xs text-cobalt hover:underline">ver e editar roteiro completo</Link>
                    </div>
                  </li>
                ))}
              </ul>
              <textarea name="comment" rows={2} placeholder="Comentário (obrigatório para pedir alteração)" className={inputCls} />
              <div className="flex flex-wrap gap-2">
                <Button variant="ok" name="decision" value="aprovado">Aprovar selecionados</Button>
                <Button variant="ghost" name="decision" value="alteracao_solicitada">Pedir alteração</Button>
              </div>
            </form>
          </Card>
        ) : null}

        <Card title={`Peças (${pieces.length})`}>
          {pieces.length ? <PieceGrid pieces={pieces} /> : <Empty>As peças aparecem depois dos roteiros.</Empty>}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Execução dos agentes">
            <Table head={["Etapa", "Agente", "Status", "Tentativa"]}>
              {runs.map((r: any) => (
                <tr key={r.id}>
                  <Td className="font-mono text-xs">{r.step}{r.error ? <span className="mt-1 block whitespace-normal font-sans text-err">{r.error}</span> : null}</Td>
                  <Td className="text-xs">{AGENT_LABEL[r.agent] ?? r.agent}</Td>
                  <Td><Badge status={r.status} label={RUN_LABEL[r.status]} /></Td>
                  <Td className="tabular-nums text-muted">{r.attempt}/{r.max_attempts}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <div className="space-y-6">
            <Card title="Custo de IA deste lote">
              {costs.length ? (
                <Table head={["Modelo", "Tokens (ent./saída)", "Buscas", "US$"]}>
                  {costs.map((c: any) => <tr key={c.provider + c.model}><Td className="text-xs">{c.provider} · {c.model}</Td><Td className="tabular-nums text-xs">{c.input_tokens} / {c.output_tokens}</Td><Td className="tabular-nums">{c.web_searches}</Td><Td className="tabular-nums">{usd(c.usd)}</Td></tr>)}
                </Table>
              ) : <p className="text-sm text-muted">Nenhuma chamada paga (modo {batch.provider}).</p>}
            </Card>
            <Card title="Log">
              <ul className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
                {logs.map((l: any) => (
                  <li key={l.id} className="flex gap-2"><span className="shrink-0 text-muted">{dt(l.at)}</span><span className={l.level === "error" ? "text-err" : l.level === "warn" ? "text-warn" : ""}><strong>{l.event}</strong> {l.message}</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
