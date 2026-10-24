"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; badge?: number };

export function Nav({ items, footer }: { items: NavItem[]; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return (
    <>
      <div className="flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Link href="/" className="font-display text-xl font-extrabold text-white">VYVE<span className="text-cobalt">.</span></Link>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/30">
          {open ? "Fechar" : "Menu"}
        </button>
      </div>
      <aside className={`${open ? "block" : "hidden"} bg-ink text-white lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto`}>
        <div className="hidden px-5 pt-6 pb-4 lg:block">
          <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">VYVE<span className="text-cobalt">.</span></Link>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Content Engine</p>
        </div>
        <nav aria-label="Módulos" className="px-2 pb-4">
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  aria-current={active(it.href) ? "page" : undefined}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${active(it.href) ? "bg-white/12 font-semibold text-white" : "text-white/75 hover:bg-white/6 hover:text-white"}`}
                >
                  <span>{it.label}</span>
                  {it.badge ? <span className="rounded-full bg-cobalt px-1.5 text-[11px] font-bold tabular-nums">{it.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-white/70">{footer}</div>
      </aside>
    </>
  );
}
