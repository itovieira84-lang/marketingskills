import type { Tx } from "../db";
import { many, one, maybe } from "../db";

/**
 * Regras de direito de uso aplicadas antes de qualquer produção:
 * - só entram ativos com direito "own", "licensed" ou "authorized";
 * - se o ativo mostra uma pessoa (metadata.has_person) é preciso consentimento
 *   de imagem válido; se é a voz de uma pessoa (metadata.voice_of_person),
 *   consentimento de voz;
 * - trilha musical só com direito "licensed" ou "own".
 */
export const USABLE_RIGHTS = ["own", "licensed", "authorized"];

export interface ProductionAssets {
  logo: any | null;
  headingFont: any | null;
  bodyFont: any | null;
  photos: any[];
  videos: any[];
  narration: any[];
  music: any[];
  excluded: Array<{ id: string; label: string; reason: string }>;
}

export async function loadProductionAssets(tx: Tx, clientId: string): Promise<ProductionAssets> {
  const brand = await maybe(tx, "select * from vyve.brands where client_id = $1", [clientId]);
  const rows = await many(tx,
    `select a.*, c.scope as consent_scope, c.revoked_at as consent_revoked
       from vyve.media_assets a left join vyve.consents c on c.id = a.consent_id
      where a.client_id = $1 and a.kind <> 'render' order by a.created_at`, [clientId]);
  const out: ProductionAssets = { logo: null, headingFont: null, bodyFont: null, photos: [], videos: [], narration: [], music: [], excluded: [] };
  for (const a of rows) {
    const meta = a.metadata ?? {};
    const exclude = (reason: string) => out.excluded.push({ id: a.id, label: a.label, reason });
    if (!USABLE_RIGHTS.includes(a.rights_status)) { exclude(`direito de uso "${a.rights_status}"`); continue; }
    const consentOk = (scopes: string[]) => a.consent_id && !a.consent_revoked && scopes.includes(a.consent_scope);
    if (meta.has_person && (a.kind === "image" || a.kind === "video") && !consentOk(["image", "likeness"])) { exclude("mostra pessoa sem consentimento de imagem registrado"); continue; }
    if (a.kind === "audio" && meta.voice_of_person && !consentOk(["voice"])) { exclude("voz de pessoa sem consentimento de voz registrado"); continue; }
    if (a.kind === "logo") { if (!out.logo || brand?.logo_asset_id === a.id) out.logo = a; continue; }
    if (a.kind === "font") { if (meta.role === "body") out.bodyFont = a; else out.headingFont = a; continue; }
    if (a.kind === "image") out.photos.push(a);
    else if (a.kind === "video" && a.duration_s) out.videos.push(a);
    else if (a.kind === "audio" && meta.role === "music") {
      if (["licensed", "own"].includes(a.rights_status)) out.music.push(a); else exclude("trilha sem licença");
    } else if (a.kind === "audio") out.narration.push(a);
  }
  return out;
}

export async function loadPiece(tx: Tx, pieceId: string) {
  const piece = await one(tx, "select * from vyve.pieces where id = $1", [pieceId]);
  const script = piece.script_id ? await one(tx, "select * from vyve.scripts where id = $1", [piece.script_id]) : null;
  return { piece, script, payload: script?.payload ?? null };
}
