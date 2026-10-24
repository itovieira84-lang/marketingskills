import Link from "next/link";
import { notFound } from "next/navigation";
import { withCtx, maybe, can } from "@vyve/engine";
import { decideScriptsAction, editScriptAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { APPROVAL_LABEL, FORMAT_LABEL } from "@/lib/format";
import { Back, Badge, Button, Card, Field, Flash, PageHeader, inputCls } from "@/components/ui";

export default async function Roteiro({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const s = await requireSession();
  const r = await withCtx(ctxOf(s), (tx) => maybe(tx,
    `select s.*, c.name as client_name, (select p.id from vyve.pieces p where p.script_id = s.id limit 1) as piece_id
       from vyve.scripts s join vyve.clients c on c.id = s.client_id where s.id = $1`, [id]));
  if (!r) notFound();
  const p = r.payload ?? {};
  const here = `/roteiros/${id}`;
  const editable = can(s.role, "script.approve") || can(s.role, "brand.edit");
  return (
    <>
      <PageHeader title={p.title} sub={<>{r.client_name} · {FORMAT_LABEL[r.format]}{p.duration_s ? ` · ${p.duration_s}s` : ""}{p.screens ? ` · ${p.screens} telas` : ""} · funil {p.funnel_stage} · v{r.version}{r.piece_id ? <> · <Link className="text-cobalt hover:underline" href={`/pecas/${r.piece_id}`}>ver peça</Link></> : null}</>}
        actions={<Badge status={r.approval} label={APPROVAL_LABEL[r.approval]} className="self-center text-sm" />} />
      <Flash sp={await searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Roteiro" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-muted">Objetivo estratégico</dt><dd>{p.strategic_objective}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Público</dt><dd>{p.target_audience}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Abordagem</dt><dd>{p.angle}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Potencial estimado (não é previsão)</dt><dd>Autoridade {p.scores?.authority} · Engajamento {p.scores?.engagement} · Compart. {p.scores?.shareability} · Conversão {p.scores?.conversion}<span className="block text-xs text-muted">{p.score_rationale}</span></dd></div>
          </dl>
          <p className="mt-5 rounded-md bg-ink px-4 py-3 text-white"><span className="text-xs uppercase text-white/60">Gancho</span><span className="block font-display text-lg font-semibold">{p.hook}</span></p>
          <ol className="mt-4 space-y-3">
            {(p.beats ?? []).map((b: any, i: number) => (
              <li key={i} className="rounded-md border border-line p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{b.label}{b.seconds ? ` · ${b.seconds}s` : ""}</p>
                <p className="mt-1">{b.voiceover}</p>
                {b.on_screen_text ? <p className="mt-1 text-cobalt">Tela: {b.on_screen_text}</p> : null}
                {b.visual ? <p className="mt-1 text-xs text-muted">Visual: {b.visual}</p> : null}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm"><strong>CTA:</strong> {p.cta}</p>
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-paper p-3 text-sm">{p.caption}{p.hashtags?.length ? `\n\n${p.hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : ""}</p>
          {p.capture_instructions ? <p className="mt-3 text-sm"><strong>Captação:</strong> {p.capture_instructions}</p> : null}
          {p.visual_instructions ? <p className="mt-2 text-sm"><strong>Visual:</strong> {p.visual_instructions}</p> : null}
          {p.references?.length ? <div className="mt-3 text-sm"><strong>Referências da pesquisa:</strong><ul className="list-disc pl-5">{p.references.map((u: string) => <li key={u}><a href={u} target="_blank" rel="noreferrer noopener" className="break-all text-cobalt underline">{u}</a></li>)}</ul></div> : null}
        </Card>
        <div className="space-y-6">
          {r.approval === "pendente" && can(s.role, "script.approve") ? (
            <Card title="Decisão">
              <form action={decideScriptsAction} className="space-y-3">
                <Back to={here} /><input type="hidden" name="script_id" value={id} />
                <textarea name="comment" rows={3} placeholder="Comentário" className={inputCls} />
                <div className="flex flex-wrap gap-2"><Button variant="ok" name="decision" value="aprovado">Aprovar</Button><Button variant="ghost" name="decision" value="alteracao_solicitada">Pedir alteração</Button></div>
              </form>
            </Card>
          ) : null}
          {editable ? (
            <Card title="Editar">
              <form action={editScriptAction} className="space-y-3">
                <Back to={here} /><input type="hidden" name="script_id" value={id} /><input type="hidden" name="piece_id" value={r.piece_id ?? ""} />
                <Field label="Título"><input name="title" defaultValue={p.title} className={inputCls} /></Field>
                <Field label="Gancho"><textarea name="hook" rows={2} defaultValue={p.hook} className={inputCls} /></Field>
                <Field label="CTA"><input name="cta" defaultValue={p.cta} className={inputCls} /></Field>
                <Field label="Legenda"><textarea name="caption" rows={4} defaultValue={p.caption} className={inputCls} /></Field>
                <Field label="Cenas/slides (JSON)" hint="label, seconds, voiceover, on_screen_text, visual"><textarea name="beats_json" rows={8} defaultValue={JSON.stringify(p.beats ?? [], null, 2)} className={`${inputCls} font-mono text-xs`} /></Field>
                {r.piece_id ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reproduce" /> Produzir nova versão da peça</label> : null}
                <Button>Salvar</Button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
