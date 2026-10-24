import { listClients, listLearnings, withCtx, many, can } from "@vyve/engine";
import { analyzeAction, collectMetricsAction, importMetricsAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL, dt } from "@/lib/format";
import { Back, Button, Card, Empty, Field, Flash, PageHeader, Table, Td, inputCls } from "@/components/ui";

export const metadata = { title: "Análise de desempenho" };
const KIND: Record<string, string> = { padrao: "Padrão", hipotese: "Hipótese (correlação)", recomendacao: "Recomendação" };

export default async function Analytics({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const ctx = ctxOf(s);
  const [clients, learnings, metrics] = await Promise.all([
    listClients(ctx), listLearnings(ctx),
    withCtx(ctx, (tx) => many(tx,
      `select distinct on (m.publication_id) m.*, p.seq, p.title, p.format, c.name as client_name from vyve.metrics m
         join vyve.publications pub on pub.id = m.publication_id join vyve.pieces p on p.id = pub.piece_id join vyve.clients c on c.id = m.client_id
        order by m.publication_id, m.collected_at desc limit 200`)),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const manage = can(s.role, "calendar.schedule");
  return (
    <>
      <PageHeader title="Análise de desempenho" sub="Agente 06. Só usa métricas reais (API do Instagram ou CSV exportado). Sem dados, não há número. Hipóteses vêm marcadas como correlação, nunca como causa." />
      <Flash sp={await searchParams} />
      {manage ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card title="Gerar relatório">
            <form action={analyzeAction} className="space-y-3">
              <Back to="/analytics" />
              <Field label="Cliente"><select name="client_id" required className={inputCls}>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="De"><input type="date" name="start" defaultValue={monthAgo} className={inputCls} /></Field><Field label="Até"><input type="date" name="end" defaultValue={today} className={inputCls} /></Field></div>
              <Button>Analisar</Button>
            </form>
          </Card>
          <Card title="Coletar do Instagram">
            <form action={collectMetricsAction} className="space-y-3">
              <Back to="/analytics" />
              <Field label="Cliente"><select name="client_id" required className={inputCls}>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Button variant="ghost">Coletar métricas</Button>
            </form>
            <p className="mt-2 text-xs text-muted">Precisa do token do cliente em variável de ambiente. Sem ele, nada é coletado.</p>
          </Card>
          <Card title="Importar CSV">
            <form action={importMetricsAction} className="space-y-3">
              <Back to="/analytics" />
              <Field label="Arquivo" hint="Colunas: publication_id, reach, views, saves, shares, comments, likes, retention_pct..."><input type="file" name="file" accept=".csv,text/csv" required className="text-sm" /></Field>
              <Field label="Origem"><input name="source" defaultValue="import_csv" className={inputCls} /></Field>
              <Button variant="ghost">Importar</Button>
            </form>
          </Card>
        </div>
      ) : null}
      <Card title={`Métricas registradas (${metrics.length})`} className="mb-6">
        {metrics.length ? (
          <Table head={["Peça", "Fonte", "Alcance", "Views", "Salv.", "Compart.", "Coment.", "Retenção", "Coletado"]}>
            {metrics.map((m: any) => <tr key={m.id}><Td>#{m.seq} {m.title}<span className="block text-xs text-muted">{m.client_name} · {FORMAT_LABEL[m.format]}</span></Td><Td className="text-xs">{m.source}</Td>{["reach", "views", "saves", "shares", "comments"].map((k) => <Td key={k} className="tabular-nums">{m[k] ?? "—"}</Td>)}<Td className="tabular-nums">{m.retention_pct != null ? `${m.retention_pct}%` : "—"}</Td><Td className="whitespace-nowrap text-muted">{dt(m.collected_at)}</Td></tr>)}
          </Table>
        ) : <Empty>Sem métricas. Nenhum número é estimado: publique e colete pela API ou importe o CSV.</Empty>}
      </Card>
      <Card title="Aprendizados enviados à pesquisa">
        {learnings.length ? <ul className="divide-y divide-line text-sm">{learnings.map((l: any) => <li key={l.id} className="py-2"><span className="text-xs font-semibold uppercase text-muted">{KIND[l.kind]} · {l.client_name}</span><span className="block">{l.insight}</span></li>)}</ul> : <Empty>Nenhum aprendizado ainda.</Empty>}
      </Card>
    </>
  );
}
