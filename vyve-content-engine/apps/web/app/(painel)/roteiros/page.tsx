import Link from "next/link";
import { listScripts } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { APPROVAL_LABEL, FORMAT_LABEL, dt } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Roteiros" };

export default async function Roteiros({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const { status } = await searchParams;
  const scripts = await listScripts(ctxOf(s), { approval: status || undefined });
  const tabs = [["", "Todos"], ["pendente", "Aguardando"], ["aprovado", "Aprovados"], ["alteracao_solicitada", "Com alteração"]];
  return (
    <>
      <PageHeader title="Roteiros" sub="Agente 02. Reels de 15 a 60 s, carrosséis, cards, Stories e newsletters, com gancho, desenvolvimento, CTA, legenda e referências da pesquisa." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">{tabs.map(([v, l]) => <Link key={v} href={v ? `/roteiros?status=${v}` : "/roteiros"} className={`rounded-full px-3 py-1 ring-1 ${(status ?? "") === v ? "bg-ink text-white ring-ink" : "ring-line hover:ring-cobalt"}`}>{l}</Link>)}</nav>
      <Card>
        {scripts.length ? (
          <Table head={["Roteiro", "Formato", "Gancho", "Versão", "Aprovação", "Data"]}>
            {scripts.map((r: any) => (
              <tr key={r.id}>
                <Td><Link href={`/roteiros/${r.id}`} className="font-medium text-cobalt hover:underline">{r.payload?.title}</Link><span className="block text-xs text-muted">{r.client_name}</span></Td>
                <Td className="whitespace-nowrap">{FORMAT_LABEL[r.format]}{r.payload?.duration_s ? ` · ${r.payload.duration_s}s` : ""}</Td>
                <Td className="max-w-xs text-xs text-muted">{r.payload?.hook}</Td>
                <Td className="tabular-nums">v{r.version}</Td>
                <Td><Badge status={r.approval} label={APPROVAL_LABEL[r.approval]} /></Td>
                <Td className="whitespace-nowrap text-muted">{dt(r.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Nenhum roteiro neste filtro.</Empty>}
      </Card>
    </>
  );
}
