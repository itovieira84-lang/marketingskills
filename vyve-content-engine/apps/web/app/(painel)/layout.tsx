import { withCtx, maybe, can } from "@vyve/engine";
import { logoutAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/format";
import { Nav, type NavItem } from "@/components/nav";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const counts = await withCtx(ctxOf(s), (tx) => maybe(tx, `select
      (select count(*) from vyve.pieces where approval = 'pendente')::int
      + (select count(*) from vyve.research where approval = 'pendente')::int
      + (select count(*) from vyve.scripts where approval = 'pendente')::int as approvals,
      (select count(*) from vyve.agent_runs where status = 'awaiting_external')::int as external`));
  const items: NavItem[] = [
    { href: "/", label: "Visão geral" },
    { href: "/clientes", label: "Clientes" },
    { href: "/marcas", label: "Biblioteca de marca" },
    { href: "/briefings", label: "Briefings e lotes" },
    { href: "/pesquisa", label: "Pesquisa" },
    { href: "/ideias", label: "Banco de ideias" },
    { href: "/roteiros", label: "Roteiros" },
    { href: "/audiovisual", label: "Produção audiovisual" },
    { href: "/design", label: "Design" },
    { href: "/aprovacoes", label: "Aprovações", badge: counts?.approvals },
    { href: "/calendario", label: "Calendário" },
    { href: "/publicacoes", label: "Publicações" },
    { href: "/analytics", label: "Análise de desempenho" },
    ...(can(s.role, "costs.view") ? [{ href: "/custos", label: "Custos e logs" }] : []),
    { href: "/configuracoes", label: "Configurações", badge: counts?.external || undefined },
  ];
  return (
    <div className="lg:flex">
      <Nav
        items={items}
        footer={
          <form action={logoutAction} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-white">{s.name}</span>
              <span>{ROLE_LABEL[s.role] ?? s.role}</span>
            </span>
            <button className="rounded px-2 py-1 ring-1 ring-white/25 hover:bg-white/10">Sair</button>
          </form>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
