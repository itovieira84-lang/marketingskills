import Link from "next/link";
import { listBatches, listBriefings } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { BATCH_LABEL, FORMAT_LABEL, dt, usd } from "@/lib/format";
import { Badge, Card, Empty, Fictitious, Flash, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Briefings e lotes" };

export default async function Briefings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const ctx = ctxOf(s);
  const [briefings, batches] = await Promise.all([listBriefings(ctx), listBatches(ctx)]);
  const batchById = new Map(batches.map((b: any) => [b.id, b]));
  return (
    <>
      <PageHeader title="Briefings e lotes" sub="Um briefing vira um lote de até 30 conteúdos. Cada lote passa por validação, pesquisa, roteiros, produção, revisão e aprovação."
        actions={<Link href="/briefings/novo" className="rounded-md bg-cobalt px-3 py-2 text-sm font-semibold text-white hover:bg-cobalt-dark">Novo briefing</Link>} />
      <Flash sp={await searchParams} />
      <Card>
        {briefings.length ? (
          <Table head={["Briefing", "Cliente", "Mix", "Lote", "Custo", "Criado"]}>
            {briefings.map((b: any) => {
              const batch: any = b.batch_id ? batchById.get(b.batch_id) : null;
              const total = Object.values(b.mix ?? {}).reduce((a: number, n: any) => a + Number(n), 0);
              return (
                <tr key={b.id}>
                  <Td><span className="font-medium">{b.title}</span><span className="block text-xs text-muted">{b.theme}</span></Td>
                  <Td>{b.client_name}</Td>
                  <Td className="text-xs text-muted">{total} peças: {Object.entries(b.mix ?? {}).map(([k, n]) => `${n} ${FORMAT_LABEL[k] ?? k}`).join(", ")}</Td>
                  <Td>{b.batch_id ? <Link href={`/lotes/${b.batch_id}`} className="inline-flex items-center gap-1 text-cobalt hover:underline">{batch ? <Badge status={batch.status} label={BATCH_LABEL[batch.status]} /> : "abrir"}<Fictitious on={batch?.is_fictitious} /></Link> : "—"}</Td>
                  <Td className="tabular-nums">{batch ? usd(batch.cost_usd) : "—"}</Td>
                  <Td className="whitespace-nowrap text-muted">{dt(b.created_at)}</Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>Nenhum briefing. Crie o primeiro.</Empty>}
      </Card>
    </>
  );
}
