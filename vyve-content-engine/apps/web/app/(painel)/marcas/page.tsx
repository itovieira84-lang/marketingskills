import Link from "next/link";
import { withCtx, many } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { Card, Empty, PageHeader, Thumb } from "@/components/ui";

export const metadata = { title: "Biblioteca de marca" };

export default async function Marcas() {
  const s = await requireSession();
  const brands = await withCtx(ctxOf(s), (tx) => many(tx,
    `select b.*, c.name, (select count(*) from vyve.media_assets a where a.client_id = c.id and a.kind <> 'render')::int as assets
       from vyve.brands b join vyve.clients c on c.id = b.client_id order by c.name`));
  return (
    <>
      <PageHeader title="Biblioteca de marca" sub="Logo, cores, fontes, tom e restrições de cada cliente. O agente de design lê daqui e nunca inventa um logo." />
      {brands.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b: any) => (
            <Link key={b.id} href={`/clientes/${b.client_id}`} className="block rounded-lg border border-line bg-surface hover:border-cobalt">
              <div className="flex h-28 items-center justify-center rounded-t-lg" style={{ background: b.colors?.background }}>
                {b.logo_asset_id ? <Thumb assetId={b.logo_asset_id} mime="image/png" alt={`Logo ${b.name}`} className="h-20 w-40 bg-transparent" /> : <span className="font-display text-2xl font-bold" style={{ color: b.colors?.text }}>{b.name}</span>}
              </div>
              <div className="flex h-2">{Object.values(b.colors ?? {}).map((c: any, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</div>
              <div className="p-4 text-sm">
                <p className="font-semibold">{b.name}</p>
                <p className="text-muted">{b.fonts?.heading} / {b.fonts?.body} · {b.assets} material(is)</p>
                {!b.logo_asset_id ? <p className="mt-1 text-xs text-warn">Sem logo: peças sairão sem logomarca.</p> : null}
              </div>
            </Link>
          ))}
        </div>
      ) : <Card><Empty>Cadastre um cliente para criar a biblioteca de marca.</Empty></Card>}
    </>
  );
}
