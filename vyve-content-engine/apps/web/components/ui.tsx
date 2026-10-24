import Link from "next/link";
import type { ReactNode } from "react";
import { STAGES, STAGE_LABEL, STAGE_COLOR, tone } from "@/lib/format";

const TONE: Record<string, string> = {
  ok: "bg-ok/10 text-ok ring-ok/25",
  warn: "bg-warn/10 text-warn ring-warn/30",
  err: "bg-err/10 text-err ring-err/25",
  info: "bg-cobalt/10 text-cobalt ring-cobalt/25",
  muted: "bg-ink/5 text-muted ring-ink/10",
};

export function Badge({ status, label, className = "" }: { status: string; label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone(status)]} ${className}`}>
      {label ?? status}
    </span>
  );
}

export function Fictitious({ on }: { on?: boolean }) {
  if (!on) return null;
  return <span className="fictitious rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink">fictício</span>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 max-w-3xl text-sm text-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

/** Mensagem de retorno das ações (?ok= / ?erro=). */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  if (!ok && !erro) return null;
  return (
    <div role="status" className={`mb-5 rounded-md border px-4 py-3 text-sm ${erro ? "border-err/30 bg-err/5 text-err" : "border-ok/30 bg-ok/5 text-ok"}`}>
      <span className="break-words">{erro ?? ok}</span>
    </div>
  );
}

/** Régua das 9 etapas obrigatórias, com a contagem de peças em cada uma. */
export function StageRibbon({ counts, current }: { counts?: Record<string, number>; current?: string }) {
  const idx = current ? STAGES.indexOf(current) : -1;
  return (
    <ol className="grid grid-cols-3 gap-1 sm:grid-cols-9" aria-label="Etapas do conteúdo">
      {STAGES.map((s, i) => {
        const active = counts ? (counts[s] ?? 0) > 0 : i <= idx;
        return (
          <li key={s} className={`rounded px-2 py-2 text-white ${active ? STAGE_COLOR[i] : "bg-line text-muted"}`} aria-current={s === current ? "step" : undefined}>
            <span className={`block text-[10px] font-semibold uppercase tracking-wider ${active ? "text-white/80" : "text-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
            <span className={`block truncate text-xs font-semibold ${active ? "text-white" : "text-muted"}`}>{STAGE_LABEL[s]}</span>
            {counts ? <span className={`block font-display text-lg font-bold leading-tight ${active ? "text-white" : "text-muted"}`}>{counts[s] ?? 0}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function StagePill({ stage }: { stage: string }) {
  const i = STAGES.indexOf(stage);
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white ${STAGE_COLOR[i] ?? "bg-muted"}`}>{STAGE_LABEL[stage] ?? stage}</span>;
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const inner = (
    <>
      <span className="block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-1 block font-display text-3xl font-bold tabular-nums text-ink">{value}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
    </>
  );
  const cls = "block rounded-lg border border-line bg-surface px-4 py-3";
  return href ? <Link href={href} className={`${cls} hover:border-cobalt`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export const fileUrl = (id: string) => `/api/files/${id}`;

export function Thumb({ assetId, mime, alt, className = "" }: { assetId?: string | null; mime?: string | null; alt: string; className?: string }) {
  if (!assetId) return <div className={`flex items-center justify-center bg-paper text-xs text-muted ${className}`}>sem prévia</div>;
  if (mime?.startsWith("video/")) return <video src={fileUrl(assetId)} className={`bg-ink object-contain ${className}`} controls preload="metadata" aria-label={alt} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={fileUrl(assetId)} alt={alt} className={`bg-paper object-contain ${className}`} loading="lazy" />;
}

// ---------------------------------------------------------------- formulários
export const inputCls = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Button({ children, variant = "primary", name, value, className = "" }: { children: ReactNode; variant?: "primary" | "ghost" | "danger" | "ok"; name?: string; value?: string; className?: string }) {
  const v = {
    primary: "bg-cobalt text-white hover:bg-cobalt-dark",
    ok: "bg-ok text-white hover:brightness-95",
    danger: "bg-surface text-err ring-1 ring-inset ring-err/40 hover:bg-err/5",
    ghost: "bg-surface text-ink ring-1 ring-inset ring-line hover:ring-cobalt",
  }[variant];
  return (
    <button type="submit" name={name} value={value} className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Back({ to }: { to: string }) {
  return <input type="hidden" name="_back" value={to} />;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            {head.map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`px-2 py-2 align-top ${className}`}>{children}</td>;
