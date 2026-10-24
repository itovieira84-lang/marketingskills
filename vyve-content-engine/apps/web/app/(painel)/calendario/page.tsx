import Link from "next/link";
import { calendar, listClients, withCtx, many, can } from "@vyve/engine";
import { addCommercialDateAction, planCalendarAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL } from "@/lib/format";
import { Back, Badge, Button, Card, Field, Flash, PageHeader, inputCls } from "@/components/ui";

export const metadata = { title: "Calendário" };
const TZ = "America/Sao_Paulo";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

export default async function Calendario({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const ctx = ctxOf(s);
  const sp = await searchParams;
  const base = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? new Date(`${sp.mes}-01T12:00:00Z`) : new Date();
  const y = base.getUTCFullYear(), m = base.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0));
  const [entries, clients, dates] = await Promise.all([
    calendar(ctx, { from: new Date(Date.UTC(y, m, 1) - 86400000).toISOString(), to: new Date(Date.UTC(y, m + 1, 1) + 86400000).toISOString(), clientId: sp.cliente || undefined }),
    listClients(ctx),
    withCtx(ctx, (tx) => many(tx, "select d.*, to_char(d.date, 'YYYY-MM-DD') as day, c.name as client_name from vyve.commercial_dates d left join vyve.clients c on c.id = d.client_id where d.date between $1 and $2 order by d.date", [ymd(first), ymd(last)])),
  ]);
  const byDay = new Map<string, any[]>();
  for (const e of entries) { const k = ymd(new Date(e.scheduled_for)); byDay.set(k, [...(byDay.get(k) ?? []), e]); }
  const lead = (first.getUTCDay() + 6) % 7; // semana começa na segunda
  const cells = [...Array(lead).fill(null), ...Array.from({ length: last.getUTCDate() }, (_, i) => i + 1)];
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const qs = (mes: string) => `/calendario?mes=${mes}${sp.cliente ? `&cliente=${sp.cliente}` : ""}`;
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const today = ymd(new Date());
  return (
    <>
      <PageHeader title="Calendário" sub="Agente 05. Distribui as peças aprovadas pela frequência de cada cliente, evita repetir formato no mesmo dia e respeita datas de bloqueio." />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={qs(monthKey(new Date(Date.UTC(y, m - 1, 1))))} className="rounded-md px-2 py-1 ring-1 ring-line hover:ring-cobalt" aria-label="Mês anterior">‹</Link>
          <h2 className="min-w-44 text-center text-lg font-semibold capitalize">{title}</h2>
          <Link href={qs(monthKey(new Date(Date.UTC(y, m + 1, 1))))} className="rounded-md px-2 py-1 ring-1 ring-line hover:ring-cobalt" aria-label="Próximo mês">›</Link>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="mes" value={monthKey(first)} />
          <select name="cliente" defaultValue={sp.cliente ?? ""} className={`${inputCls} w-52`}><option value="">Todos os clientes</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <Button variant="ghost">Filtrar</Button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <div className="grid min-w-[760px] grid-cols-7 text-xs">
          {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => <div key={d} className="border-b border-line px-2 py-1.5 font-semibold uppercase text-muted">{d}</div>)}
          {cells.map((d, i) => {
            const key = d ? `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : `x${i}`;
            const special = dates.filter((x: any) => x.day === key);
            return (
              <div key={key} className={`min-h-28 border-b border-r border-line p-1.5 ${d ? "" : "bg-paper"} ${special.some((x: any) => x.kind === "bloqueio") ? "bg-err/5" : ""}`}>
                {d ? <span className={`mb-1 inline-block rounded px-1 text-[11px] font-semibold ${key === today ? "bg-cobalt text-white" : "text-muted"}`}>{d}</span> : null}
                {special.map((x: any) => <span key={x.id} className={`mb-1 block truncate rounded px-1 text-[10px] font-semibold ${x.kind === "bloqueio" ? "text-err" : "text-s6"}`}>{x.label}</span>)}
                {(byDay.get(key) ?? []).map((e: any) => (
                  <Link key={e.id} href={`/pecas/${e.piece_id}`} className="mb-1 block rounded border-l-2 border-s7 bg-paper px-1 py-0.5 hover:bg-cobalt/5">
                    <span className="block text-[10px] text-muted">{hm(new Date(e.scheduled_for))} · {FORMAT_LABEL[e.format]}</span>
                    <span className="line-clamp-2 text-[11px] font-medium">#{e.seq} {e.title}</span>
                    <Badge status={e.status} className="mt-0.5 !px-1 !py-0 !text-[10px]" />
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {can(s.role, "calendar.schedule") ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Planejar peças aprovadas">
            <form action={planCalendarAction} className="grid gap-3 sm:grid-cols-3">
              <Back to="/calendario" />
              <Field label="Cliente"><select name="client_id" required className={inputCls}>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="A partir de"><input type="date" name="start" className={inputCls} /></Field>
              <div className="self-end"><Button>Distribuir</Button></div>
            </form>
            <p className="mt-2 text-xs text-muted">Só entram peças com aprovação humana. Agendar não publica: a publicação exige credenciais e passa por outra verificação.</p>
          </Card>
          <Card title="Datas comerciais e bloqueios">
            <form action={addCommercialDateAction} className="grid gap-3 sm:grid-cols-2">
              <Back to="/calendario" />
              <Field label="Data"><input type="date" name="date" required className={inputCls} /></Field>
              <Field label="Tipo"><select name="kind" className={inputCls}><option value="comercial">Comercial</option><option value="campanha">Campanha</option><option value="bloqueio">Bloqueio (não publicar)</option></select></Field>
              <Field label="Descrição"><input name="label" required className={inputCls} /></Field>
              <Field label="Cliente"><select name="client_id" className={inputCls}><option value="">Toda a agência</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <div><Button variant="ghost">Adicionar</Button></div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
