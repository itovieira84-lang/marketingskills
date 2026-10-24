import Link from "next/link";
import { withCtx, many } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { APPROVAL_LABEL, dt } from "@/lib/format";
import { Badge, Card, Empty, Fictitious, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Pesquisa" };

export default async function Pesquisa() {
  const s = await requireSession();
  const rows = await withCtx(ctxOf(s), (tx) => many(tx,
    `select r.id, r.batch_id, r.approval, r.provider, r.is_fictitious, r.created_at, jsonb_array_length(r.sources) as n_sources, jsonb_array_length(r.dropped_claims) as n_dropped,
            c.name as client_name, b.title from vyve.research r join vyve.clients c on c.id = r.client_id join vyve.briefings b on b.id = r.briefing_id order by r.created_at desc limit 100`));
  return (
    <>
      <PageHeader title="Pesquisa" sub="Agente 01. Cada tendência, pergunta ou dado precisa de uma fonte com URL verificada; o que não tem fonte é descartado e listado." />
      <Card>
        {rows.length ? (
          <Table head={["Briefing", "Cliente", "Fontes", "Descartadas", "Aprovação", "Data"]}>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <Td><Link href={`/pesquisa/${r.id}`} className="font-medium text-cobalt hover:underline">{r.title}</Link> <Fictitious on={r.is_fictitious} /></Td>
                <Td>{r.client_name}</Td>
                <Td className="tabular-nums">{r.n_sources}</Td>
                <Td className="tabular-nums">{r.n_dropped}</Td>
                <Td><Badge status={r.approval} label={APPROVAL_LABEL[r.approval]} /></Td>
                <Td className="whitespace-nowrap text-muted">{dt(r.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Nenhuma pesquisa ainda.</Empty>}
      </Card>
    </>
  );
}
