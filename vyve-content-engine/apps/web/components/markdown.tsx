import type { ReactNode } from "react";

/** Markdown mínimo (títulos, listas, tabelas, negrito, itálico e links) para relatórios dos agentes. Sem HTML cru. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)|]+)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("_")) out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    else if (t.startsWith("[")) out.push(<a key={k++} href={m[2]} target="_blank" rel="noreferrer noopener" className="text-cobalt underline">{t.slice(1, t.indexOf("]"))}</a>);
    else out.push(<a key={k++} href={t} target="_blank" rel="noreferrer noopener" className="break-all text-cobalt underline">{t}</a>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = (text ?? "").split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) {
      const cls = ["", "text-xl font-bold mt-2", "text-lg font-semibold mt-4", "text-base font-semibold mt-3", "text-sm font-semibold mt-3"][h[1].length];
      blocks.push(<p key={k++} className={`font-display ${cls}`}>{inline(h[2])}</p>);
      i++; continue;
    }
    if (/^>\s?/.test(l)) {
      blocks.push(<p key={k++} className="my-2 border-l-4 border-warn bg-warn/5 px-3 py-2 text-sm">{inline(l.replace(/^>\s?/, ""))}</p>);
      i++; continue;
    }
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      blocks.push(
        <div key={k++} className="overflow-x-auto"><table className="my-2 text-sm"><tbody>
          {rows.map((r, ri) => <tr key={ri} className={ri === 0 ? "font-semibold" : "border-t border-line"}>{r.map((c, ci) => <td key={ci} className="px-2 py-1">{inline(c)}</td>)}</tr>)}
        </tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      blocks.push(<ul key={k++} className="my-2 list-disc space-y-1 pl-5 text-sm">{items.map((t, ti) => <li key={ti}>{inline(t)}</li>)}</ul>);
      continue;
    }
    blocks.push(<p key={k++} className="my-2 text-sm leading-relaxed">{inline(l)}</p>);
    i++;
  }
  return <div className="max-w-none break-words">{blocks}</div>;
}
