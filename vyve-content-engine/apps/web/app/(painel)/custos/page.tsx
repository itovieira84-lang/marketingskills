import { costSummary, withCtx, many } from "@vyve/engine";
import { requirePermission, ctxOf } from "@/lib/session";
import { AGENT_LABEL, dt, usd } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";

export const metadata = { title: "Custos e logs" };

export default async function Custos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("costs.view");
  const ctx = ctxOf(s);
  const { nivel } = await searchParams;
  const [c, logs] = await Promise.all([
    costSummary(ctx),
    withCtx(ctx, (tx) => many(tx, "select l.*, c.name as client_name from vyve.logs l left join vyve.clients c on c.id = l.client_id where ($1::text is null or l.level = $1) order by l.at desc limit 200", [nivel || null])),
  ]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthUsd = c.byMonth.filter((r: any) => r.month === thisMonth).reduce((a: number, r: any) => a + r.usd, 0);
  return (
    <>
      <PageHeader title="Custos e logs" sub="Cada chamada de IA grava tokens, buscas e custo estimado pela tabela de preços. O lote para quando passa do orçamento." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Gasto no mês" value={usd(monthUsd)} />
        <Stat label="Orçamento mensal" value={c.team?.monthly_budget_usd != null ? usd(c.team.monthly_budget_usd) : "—"} />
        <Stat label="Chamadas no mês" value={c.byMonth.filter((r: any) => r.month === thisMonth).reduce((a: number, r: any) => a + r.calls, 0)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Por mês" className="lg:col-span-2">
          {c.byMonth.length ? (
            <Table head={["Mês", "Provedor", "Tokens ent.", "Tokens saída", "Buscas", "US$"]}>
              {c.byMonth.map((r: any) => <tr key={r.month + r.provider}><Td>{r.month}</Td><Td>{r.provider}</Td><Td className="tabular-nums">{r.input_tokens}</Td><Td className="tabular-nums">{r.output_tokens}</Td><Td className="tabular-nums">{r.web_searches}</Td><Td className="tabular-nums">{usd(r.usd)}</Td></tr>)}
            </Table>
          ) : <Empty>Nenhum custo registrado (modos Claude Code e teste não geram cobrança por aqui).</Empty>}
        </Card>
        <div className="space-y-6">
          <Card title="Por cliente">{c.byClient.length ? <ul className="text-sm">{c.byClient.map((r: any) => <li key={r.name} className="flex justify-between py-1"><span>{r.name}</span><span className="tabular-nums">{usd(r.usd)}</span></li>)}</ul> : <p className="text-sm text-muted">—</p>}</Card>
          <Card title="Por agente">{c.byAgent.length ? <ul className="text-sm">{c.byAgent.map((r: any) => <li key={r.agent} className="flex justify-between py-1"><span>{AGENT_LABEL[r.agent] ?? r.agent}</span><span className="tabular-nums">{usd(r.usd)}</span></li>)}</ul> : <p className="text-sm text-muted">—</p>}</Card>
        </div>
      </div>
      <Card title="Log do sistema" className="mt-6" actions={<form className="flex gap-2"><select name="nivel" defaultValue={nivel ?? ""} className="rounded border border-line px-2 py-1 text-sm"><option value="">todos</option><option value="error">erros</option><option value="warn">avisos</option><option value="info">info</option></select><button className="rounded px-2 py-1 text-sm ring-1 ring-line">filtrar</button></form>}>
        <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto text-xs">
          {logs.map((l: any) => <li key={l.id} className="flex gap-2"><span className="shrink-0 text-muted">{dt(l.at)}</span><span className={l.level === "error" ? "text-err" : l.level === "warn" ? "text-warn" : ""}><strong>{l.event}</strong> {l.client_name ? `[${l.client_name}] ` : ""}{l.message}</span></li>)}
        </ul>
      </Card>
    </>
  );
}
