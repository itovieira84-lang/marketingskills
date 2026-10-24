import Link from "next/link";
import { dashboard } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { BATCH_LABEL, FORMAT_LABEL, PRODUCTION_LABEL, dt, usd } from "@/lib/format";
import { Badge, Card, Empty, Fictitious, Flash, PageHeader, Stat, StageRibbon, Table, Td } from "@/components/ui";

export const metadata = { title: "Visão geral" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const d = await dashboard(ctxOf(s));
  const counts = Object.fromEntries(d.stages.map((r: any) => [r.stage, r.n]));
  const prod = Object.fromEntries(d.production.map((r: any) => [r.production_status, r.n]));
  const total = d.stages.reduce((a: number, r: any) => a + r.n, 0);
  return (
    <>
      <PageHeader title={`Olá, ${s.name.split(" ")[0]}`} sub="Onde cada conteúdo está agora, o que espera decisão humana e o que falhou." actions={<Link href="/briefings/novo" className="rounded-md bg-cobalt px-3 py-2 text-sm font-semibold text-white hover:bg-cobalt-dark">Novo briefing</Link>} />
      <Flash sp={await searchParams} />
      <section className="mb-6"><StageRibbon counts={counts} /></section>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Peças no sistema" value={total} />
        <Stat label="Aguardando aprovação" value={d.awaiting} href="/aprovacoes" />
        <Stat label="Pendentes de produção" value={prod.pendente_producao ?? 0} hint="faltam materiais ou ferramentas" href="/audiovisual?status=pendente_producao" />
        <Stat label="Custo de IA no mês" value={usd(d.month.usd)} hint={`${d.month.calls} chamada(s)`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Lotes recentes" className="lg:col-span-2">
          {d.batches.length ? (
            <Table head={["Lote", "Cliente", "Status", "Criado"]}>
              {d.batches.map((b: any) => (
                <tr key={b.id}>
                  <Td><Link href={`/lotes/${b.id}`} className="font-medium text-cobalt hover:underline">{b.title}</Link> <Fictitious on={b.is_fictitious} /></Td>
                  <Td>{b.client_name}</Td>
                  <Td><Badge status={b.status} label={BATCH_LABEL[b.status]} /></Td>
                  <Td className="whitespace-nowrap text-muted">{dt(b.created_at)}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty>Nenhum lote ainda. Comece por um briefing.</Empty>}
        </Card>
        <Card title="Produção">
          <ul className="space-y-2 text-sm">
            {Object.entries(PRODUCTION_LABEL).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between"><Badge status={k} label={v} /><span className="font-semibold tabular-nums">{prod[k] ?? 0}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Próximas publicações" className="lg:col-span-2">
          {d.upcoming.length ? (
            <ul className="divide-y divide-line text-sm">
              {d.upcoming.map((e: any) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium">{e.title}</span> <span className="text-muted">· {FORMAT_LABEL[e.format]} · {e.client_name}</span></span>
                  <span className="whitespace-nowrap text-muted">{dt(e.scheduled_for)} · <Badge status={e.status} /></span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nada agendado. Peças aprovadas entram no calendário pelo módulo Calendário.</Empty>}
        </Card>
        <Card title="Erros recentes">
          {d.errors.length ? (
            <ul className="space-y-2 text-sm">
              {d.errors.map((e: any) => <li key={e.id}><span className="block font-medium text-err">{e.event}</span><span className="block break-words text-muted">{e.message}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted">Nenhum erro registrado.</p>}
        </Card>
      </div>
    </>
  );
}
