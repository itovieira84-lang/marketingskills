import Link from "next/link";
import { listClients, can } from "@vyve/engine";
import { createClientAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL } from "@/lib/format";
import { Back, Button, Card, Empty, Field, Flash, PageHeader, Table, Td, inputCls } from "@/components/ui";

export const metadata = { title: "Clientes" };

export default async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const clients = await listClients(ctxOf(s));
  return (
    <>
      <PageHeader title="Clientes" sub="Cada cliente tem dados, marca, materiais e consentimentos isolados. Membros com papel Cliente só veem o que é deles." />
      <Flash sp={await searchParams} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Carteira" className="lg:col-span-3">
          {clients.length ? (
            <Table head={["Cliente", "Segmento", "Peças", "Aguardando"]}>
              {clients.map((c: any) => (
                <tr key={c.id}>
                  <Td><Link className="font-medium text-cobalt hover:underline" href={`/clientes/${c.id}`}>{c.name}</Link></Td>
                  <Td className="text-muted">{c.segment || "—"}</Td>
                  <Td className="tabular-nums">{c.pieces}</Td>
                  <Td className="tabular-nums">{c.awaiting}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty>Nenhum cliente cadastrado.</Empty>}
        </Card>
        {can(s.role, "client.manage") ? (
          <Card title="Cadastrar cliente" className="lg:col-span-2">
            <form action={createClientAction} className="space-y-3">
              <Back to="/clientes" />
              <Field label="Nome"><input name="name" required className={inputCls} /></Field>
              <Field label="Segmento"><input name="segment" className={inputCls} placeholder="ex.: mentoria para pequenos empresários" /></Field>
              <Field label="Público-alvo"><textarea name="audience" rows={2} className={inputCls} /></Field>
              <Field label="Objetivos"><textarea name="objectives" rows={2} className={inputCls} /></Field>
              <Field label="Tom de voz"><input name="tone" className={inputCls} /></Field>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Frequência por semana</legend>
                <div className="grid grid-cols-2 gap-2">
                  {["reel", "carousel", "card", "story_sequence", "newsletter"].map((k) => (
                    <label key={k} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted">{FORMAT_LABEL[k]}</span>
                      <input name={`freq_${k}`} type="number" min={0} max={14} className={`${inputCls} w-16`} />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="require_research" defaultChecked /> Aprovar pesquisa antes dos roteiros</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="require_scripts" defaultChecked /> Aprovar roteiros antes da produção</label>
              <Field label="Orçamento de IA por lote (US$)"><input name="budget" type="number" step="0.5" min={0} defaultValue={5} className={inputCls} /></Field>
              <Button>Cadastrar</Button>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
