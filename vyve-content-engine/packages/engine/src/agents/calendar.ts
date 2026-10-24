import { withCtx, many, maybe, type Ctx, type Tx } from "../db";
import { recordHistory } from "./common";
import { log } from "../logging";
import { publicMediaSig, sha256 } from "../auth";
import { igCredentialsFromEnv, InstagramGraph } from "../integrations/instagram";
import { config } from "../config";

// Frequência semanal padrão quando o contrato do cliente não define.
export const DEFAULT_FREQUENCY: Record<string, number> = { reel: 3, carousel: 2, card: 2, story_sequence: 5, newsletter: 1, authority_post: 1, long_video: 1 };
// Horário local padrão por formato (HH:MM).
const DEFAULT_HOUR: Record<string, string> = { reel: "19:00", carousel: "12:00", card: "09:00", story_sequence: "10:00", newsletter: "08:00", authority_post: "12:30", long_video: "18:00" };
const CHANNEL_OF: Record<string, string> = { newsletter: "newsletter", long_video: "youtube" };
const channelOf = (format: string) => CHANNEL_OF[format] ?? "instagram";

/** Converte data/hora local de um fuso para UTC sem dependências. */
export function zonedToUtc(dateIso: string, hhmm: string, timeZone: string): Date {
  const guess = new Date(`${dateIso}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/** Dias da semana (0..6) espalhados para N publicações semanais. */
export function spreadDays(n: number): number[] {
  if (n <= 0) return [];
  if (n >= 7) return Array.from({ length: Math.min(n, 7) }, (_, i) => i);
  return Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n));
}

/** Especificações de mídia por canal/formato, validadas antes de agendar. */
export function validateForChannel(format: string, assets: any[]): string[] {
  const problems: string[] = [];
  const images = assets.filter((a) => a.mime?.startsWith("image/") && !a.metadata?.frame);
  const videos = assets.filter((a) => a.mime === "video/mp4" && !a.metadata?.preview && !a.metadata?.intermediate);
  if (format === "reel") {
    const v = videos[0];
    if (!v) problems.push("Reels sem MP4 final");
    else {
      if (v.width !== 1080 || v.height !== 1920) problems.push(`Reels ${v.width}x${v.height}; esperado 1080x1920`);
      if (Number(v.duration_s) < 3 || Number(v.duration_s) > 90) problems.push(`Reels com ${v.duration_s}s; Instagram aceita de 3 a 90 s para Reels`);
    }
  }
  if (format === "carousel") {
    const slides = images.filter((a) => String(a.metadata?.variant ?? "").startsWith("carousel"));
    if (slides.length < 2 || slides.length > 20) problems.push(`Carrossel com ${slides.length} imagens; Instagram aceita 2 a 20`);
    if (slides.some((a) => a.width !== 1080 || a.height !== 1350)) problems.push("Slides fora de 1080x1350");
  }
  if (format === "card" && !images.length) problems.push("Card sem imagem");
  if (format === "story_sequence" && images.some((a) => a.width !== 1080 || a.height !== 1920)) problems.push("Stories fora de 1080x1920");
  return problems;
}

async function piecesAssets(tx: Tx, piece: any) {
  return many(tx, "select * from vyve.media_assets where id = any($1::uuid[])", [piece.output_asset_ids]);
}

/**
 * Agente 05: distribui as peças APROVADAS no calendário do cliente, respeitando
 * frequência contratada, datas bloqueadas, um formato por dia e sem duplicar.
 */
export async function planCalendar(ctx: Ctx, clientId: string, opts: { startDate?: string; actorUserId?: string | null } = {}) {
  return withCtx(ctx, async (tx) => {
    const client = await maybe(tx, "select * from vyve.clients where id = $1", [clientId]);
    if (!client) throw new Error("Cliente não encontrado");
    const pieces = await many(tx,
      `select p.* from vyve.pieces p
        where p.client_id = $1 and p.approval = 'aprovado' and p.production_status = 'pronto'
          and not exists (select 1 from vyve.calendar_entries e where e.piece_id = p.id)
        order by p.created_at, p.seq`, [clientId]);
    const blocked = new Set((await many(tx,
      "select date::text from vyve.commercial_dates where (client_id = $1 or client_id is null) and kind = 'bloqueio'", [clientId])).map((r: any) => r.date));
    const taken = new Set((await many(tx,
      `select (e.scheduled_for at time zone $2)::date::text as d, p.format from vyve.calendar_entries e join vyve.pieces p on p.id = e.piece_id
        where e.client_id = $1 and e.status <> 'cancelado'`, [clientId, client.timezone])).map((r: any) => `${r.d}|${r.format}`));
    const freq = { ...DEFAULT_FREQUENCY, ...(client.posting_frequency ?? {}) };
    const start = opts.startDate ?? addDays(new Date().toISOString().slice(0, 10), 1);
    const scheduled: any[] = [];
    const skipped: Array<{ piece: number; reason: string }> = [];
    const titlesUsed = new Set<string>();

    const byFormat = new Map<string, any[]>();
    for (const p of pieces) byFormat.set(p.format, [...(byFormat.get(p.format) ?? []), p]);

    for (const [format, list] of byFormat) {
      const perWeek = Math.max(1, Number(freq[format] ?? 1));
      const days = spreadDays(perWeek);
      let week = 0, slot = 0, guard = 0;
      for (const piece of list) {
        const assets = await piecesAssets(tx, piece);
        const problems = validateForChannel(format, assets);
        if (problems.length) { skipped.push({ piece: piece.seq, reason: problems.join("; ") }); continue; }
        const titleKey = piece.title.trim().toLowerCase();
        if (titlesUsed.has(titleKey)) { skipped.push({ piece: piece.seq, reason: "título duplicado no calendário" }); continue; }
        let date = "";
        while (guard++ < 1000) {
          date = addDays(start, week * 7 + days[slot]);
          slot++;
          if (slot >= days.length) { slot = 0; week++; }
          if (!blocked.has(date) && !taken.has(`${date}|${format}`)) break;
        }
        taken.add(`${date}|${format}`);
        titlesUsed.add(titleKey);
        const when = zonedToUtc(date, DEFAULT_HOUR[format] ?? "12:00", client.timezone);
        const entry = await tx.query(
          `insert into vyve.calendar_entries(team_id, client_id, piece_id, channel, scheduled_for, created_by)
           values ($1,$2,$3,$4,$5,$6) on conflict (piece_id, channel) do nothing returning *`,
          [client.team_id, clientId, piece.id, channelOf(format), when.toISOString(), opts.actorUserId ?? null]);
        if (!entry.rowCount) continue;
        await tx.query("update vyve.pieces set stage = 'AGENDAMENTO', updated_at = now() where id = $1", [piece.id]);
        await recordHistory(tx, piece, piece.stage, "AGENDAMENTO", { userId: opts.actorUserId, agent: "calendario" }, `Planejado para ${date} ${DEFAULT_HOUR[format]} (${client.timezone})`);
        scheduled.push({ piece: piece.seq, format, date, channel: channelOf(format) });
      }
    }
    await log(tx, { teamId: client.team_id, clientId }, skipped.length ? "warn" : "info", "calendario.planejado",
      `${scheduled.length} peça(s) no calendário; ${skipped.length} não agendada(s).`, { scheduled, skipped });
    return { scheduled, skipped };
  });
}

export interface PublishOutcome {
  piece: number;
  status: "bloqueado" | "publicado" | "erro" | "ja_publicado";
  reason?: string;
  external_id?: string;
}

/**
 * Publica o que venceu. Barreiras, nesta ordem:
 * 1) peça aprovada por um HUMANO (approvals.decided_by preenchido);
 * 2) credenciais oficiais do canal presentes em variáveis de ambiente;
 * 3) URL pública das mídias (a Meta baixa o arquivo por URL);
 * 4) idempotência: mesma peça + versão + canal nunca sai duas vezes.
 */
export async function publishDue(ctx: Ctx, opts: { now?: Date; requestedBy?: string | null; dryRun?: boolean; fetchImpl?: typeof fetch } = {}): Promise<PublishOutcome[]> {
  const now = opts.now ?? new Date();
  const due = await withCtx(ctx, (tx) => many(tx,
    `select e.*, p.seq, p.format, p.caption, p.version, p.approval, p.output_asset_ids, p.stage, p.title,
            (select a.decided_by from vyve.approvals a where a.piece_id = p.id and a.decision = 'aprovado' and a.piece_version = p.version
              order by a.decided_at desc limit 1) as approver
       from vyve.calendar_entries e join vyve.pieces p on p.id = e.piece_id
      where e.status = 'planejado' and e.scheduled_for <= $1 order by e.scheduled_for`, [now.toISOString()]));
  const outcomes: PublishOutcome[] = [];
  for (const e of due) {
    const requestHash = sha256(`${e.piece_id}:${e.version}:${e.channel}`);
    const result = await withCtx(ctx, async (tx) => {
      const already = await maybe(tx, "select * from vyve.publications where request_hash = $1", [requestHash]);
      if (already && already.status !== "bloqueado" && already.status !== "erro") return { piece: e.seq, status: "ja_publicado" as const, external_id: already.external_id };
      const integration = await maybe(tx, "select * from vyve.integrations where client_id = $1 and provider = $2", [e.client_id, e.channel]);
      let block: string | null = null;
      if (e.approval !== "aprovado" || !e.approver) block = "sem aprovação humana registrada para a versão atual";
      else if (e.channel !== "instagram") block = `canal ${e.channel} sem integração de publicação implementada`;
      else if (!igCredentialsFromEnv(integration)) block = "credenciais oficiais do Instagram ausentes (configure em Configurações e integrações)";
      else if (!config.publicBaseUrl) block = "VYVE_PUBLIC_BASE_URL ausente: a Meta precisa baixar a mídia por URL pública";
      else if (opts.dryRun) block = "simulação (dry-run): nada foi enviado";
      if (block) {
        await tx.query(
          `insert into vyve.publications(team_id, client_id, piece_id, calendar_entry_id, channel, provider, request_hash, status, error, approved_by, requested_by)
           values ($1,$2,$3,$4,$5,$6,$7,'bloqueado',$8,$9,$10)
           on conflict (request_hash) do update set status = 'bloqueado', error = excluded.error`,
          [e.team_id, e.client_id, e.piece_id, e.id, e.channel, e.channel, requestHash, block, e.approver, opts.requestedBy ?? null]);
        await log(tx, { teamId: e.team_id, clientId: e.client_id }, "warn", "publicacao.bloqueada", `Peça ${e.seq}: ${block}`);
        return { piece: e.seq, status: "bloqueado" as const, reason: block };
      }
      await tx.query(
        `insert into vyve.publications(team_id, client_id, piece_id, calendar_entry_id, channel, provider, request_hash, status, approved_by, requested_by)
         values ($1,$2,$3,$4,$5,'instagram_graph',$6,'enviando',$7,$8)
         on conflict (request_hash) do update set status = 'enviando', error = null`,
        [e.team_id, e.client_id, e.piece_id, e.id, e.channel, requestHash, e.approver, opts.requestedBy ?? null]);
      return null;
    });
    if (result) { outcomes.push(result); continue; }

    // Envio real (só chega aqui com aprovação + credenciais + URL pública).
    try {
      const { externalId } = await withCtx(ctx, async (tx) => {
        const integration = await maybe(tx, "select * from vyve.integrations where client_id = $1 and provider = 'instagram'", [e.client_id]);
        const ig = new InstagramGraph(igCredentialsFromEnv(integration)!, opts.fetchImpl);
        const assets = await many(tx, "select * from vyve.media_assets where id = any($1::uuid[]) order by label", [e.output_asset_ids]);
        const pub = (a: any) => `${config.publicBaseUrl.replace(/\/$/, "")}/api/public-media/${a.id}?sig=${publicMediaSig(a.id)}`;
        let containerId: string;
        if (e.format === "reel") {
          const v = assets.find((a: any) => a.mime === "video/mp4" && !a.metadata?.preview && !a.metadata?.intermediate);
          const cover = assets.find((a: any) => a.metadata?.variant === "reel_cover");
          containerId = (await ig.createReel(pub(v), e.caption, cover ? pub(cover) : undefined)).id;
        } else if (e.format === "carousel") {
          const slides = assets.filter((a: any) => String(a.metadata?.variant ?? "").startsWith("carousel"));
          const children: string[] = [];
          for (const s of slides) children.push((await ig.createImage(pub(s), undefined, true)).id);
          containerId = (await ig.createCarousel(children, e.caption)).id;
        } else if (e.format === "story_sequence") {
          const frames = assets.filter((a: any) => a.mime?.startsWith("image/"));
          let last = "";
          for (const f of frames) { const c = await ig.createStory(pub(f), false); await ig.waitReady(c.id); last = (await ig.publish(c.id)).id; }
          return { externalId: last };
        } else {
          const img = assets.find((a: any) => a.mime?.startsWith("image/"));
          containerId = (await ig.createImage(pub(img), e.caption)).id;
        }
        await ig.waitReady(containerId);
        return { externalId: (await ig.publish(containerId)).id as string };
      });
      await withCtx(ctx, async (tx) => {
        await tx.query("update vyve.publications set status = 'publicado', external_id = $2, published_at = now() where request_hash = $1", [requestHash, externalId]);
        await tx.query("update vyve.calendar_entries set status = 'publicado' where id = $1", [e.id]);
        await tx.query("update vyve.pieces set stage = 'PUBLICACAO', updated_at = now() where id = $1", [e.piece_id]);
        await recordHistory(tx, { id: e.piece_id, team_id: e.team_id, client_id: e.client_id }, e.stage, "PUBLICACAO", { userId: opts.requestedBy, agent: "calendario" }, `Publicado no Instagram: ${externalId}`);
        await log(tx, { teamId: e.team_id, clientId: e.client_id }, "info", "publicacao.ok", `Peça ${e.seq} publicada (${externalId}).`);
      });
      outcomes.push({ piece: e.seq, status: "publicado", external_id: externalId });
    } catch (err) {
      await withCtx(ctx, async (tx) => {
        await tx.query("update vyve.publications set status = 'erro', error = $2 where request_hash = $1", [requestHash, (err as Error).message]);
        await tx.query("update vyve.calendar_entries set status = 'erro' where id = $1", [e.id]);
        await log(tx, { teamId: e.team_id, clientId: e.client_id }, "error", "publicacao.erro", `Peça ${e.seq}: ${(err as Error).message}`);
      });
      outcomes.push({ piece: e.seq, status: "erro", reason: (err as Error).message });
    }
  }
  return outcomes;
}
