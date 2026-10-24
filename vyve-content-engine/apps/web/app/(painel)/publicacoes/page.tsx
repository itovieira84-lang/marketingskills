import Link from "next/link";
import { listPublications, can } from "@vyve/engine";
import { publishDueAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL, dt } from "@/lib/format";
import { Back, Badge, Button, Card, Empty, Flash, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Publicações" };

export default async function Publicacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const pubs = await listPublications(ctxOf(s));
  return (
    <>
      <PageHeader title="Publicações" sub="Registro de cada tentativa: quem aprovou, quem pediu, quando e o ID retornado pela rede. Sem aprovação humana ou sem credencial, a tentativa fica bloqueada e o motivo aparece aqui." />
      <Flash sp={await searchParams} />
      {can(s.role, "publish") ? (
        <Card title="Publicar o que venceu" className="mb-6">
          <form action={publishDueAction} className="flex flex-wrap items-center gap-3">
            <Back to="/publicacoes" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dry_run" defaultChecked /> Simulação (verifica tudo e não envia nada)</label>
            <Button>Verificar e publicar</Button>
          </form>
          <p className="mt-2 text-xs text-muted">Envio real exige: peça aprovada por uma pessoa, token do Instagram do cliente em variável de ambiente, ig_user_id e VYVE_PUBLIC_BASE_URL acessível pela Meta.</p>
        </Card>
      ) : null}
      <Card>
        {pubs.length ? (
          <Table head={["Peça", "Canal", "Status", "Aprovado por", "ID externo", "Quando"]}>
            {pubs.map((p: any) => (
              <tr key={p.id}>
                <Td><Link href={`/pecas/${p.piece_id}`} className="font-medium text-cobalt hover:underline">#{p.seq} {p.title}</Link><span className="block text-xs text-muted">{p.client_name} · {FORMAT_LABEL[p.format]}</span></Td>
                <Td>{p.channel}<span className="block text-xs text-muted">{p.provider}</span></Td>
                <Td><Badge status={p.status} />{p.error ? <span className="mt-1 block max-w-xs text-xs text-err">{p.error}</span> : null}</Td>
                <Td>{p.approver_name ?? "—"}</Td>
                <Td className="font-mono text-xs">{p.external_id ?? "—"}</Td>
                <Td className="whitespace-nowrap text-muted">{dt(p.published_at ?? p.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>Nenhuma tentativa de publicação ainda.</Empty>}
      </Card>
    </>
  );
}
