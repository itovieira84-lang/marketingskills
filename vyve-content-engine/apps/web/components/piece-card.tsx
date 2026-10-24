import Link from "next/link";
import { APPROVAL_LABEL, FORMAT_LABEL, PRODUCTION_LABEL } from "@/lib/format";
import { Badge, StagePill, Thumb } from "./ui";

/** Cartão de peça: prévia real (ou "sem prévia"), etapa, produção e aprovação. */
export function PieceCard({ p }: { p: any }) {
  const vertical = ["reel", "story_sequence", "long_video"].includes(p.format) ? "aspect-[9/16]" : "aspect-[4/5]";
  return (
    <Link href={`/pecas/${p.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface hover:border-cobalt">
      <div className={`relative ${p.format === "long_video" ? "aspect-video" : vertical} max-h-72 w-full overflow-hidden bg-paper`}>
        {p.preview_asset_id && p.preview_mime?.startsWith("video/") ? (
          <video src={`/api/files/${p.preview_asset_id}`} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={p.title} />
        ) : (
          <Thumb assetId={p.preview_asset_id} mime={p.preview_mime} alt={p.title} className="h-full w-full" />
        )}
        <span className="absolute left-2 top-2 rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-bold text-white">#{p.seq}</span>
        {p.production_status === "pendente_producao" ? <span className="absolute inset-x-0 bottom-0 bg-warn px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">Pendente de produção</span> : null}
      </div>
      <div className="space-y-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-cobalt">{p.title}</p>
        <p className="text-xs text-muted">{FORMAT_LABEL[p.format] ?? p.format}{p.production_mode ? ` · ${p.production_mode.length === 1 ? `caso ${p.production_mode}` : p.production_mode}` : ""}{p.client_name ? ` · ${p.client_name}` : ""}</p>
        <div className="flex flex-wrap gap-1">
          <StagePill stage={p.stage} />
          <Badge status={p.production_status} label={PRODUCTION_LABEL[p.production_status]} />
          {p.approval !== "nao_solicitada" ? <Badge status={p.approval} label={APPROVAL_LABEL[p.approval]} /> : null}
        </div>
      </div>
    </Link>
  );
}

export function PieceGrid({ pieces }: { pieces: any[] }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{pieces.map((p) => <PieceCard key={p.id} p={p} />)}</div>;
}
