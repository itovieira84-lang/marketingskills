/**
 * Instagram Graph API (publicação de conteúdo e insights) — integração OFICIAL.
 *
 * Requisitos (não disponíveis neste ambiente, por isso NÃO TESTADA ao vivo):
 * - Conta profissional do Instagram ligada a uma Página do Facebook;
 * - App da Meta com permissões instagram_basic, instagram_content_publish,
 *   instagram_manage_insights (revisão da Meta para uso em produção);
 * - Token de acesso de longa duração em variável de ambiente (nunca no banco);
 * - Mídias acessíveis por URL pública HTTPS (VYVE_PUBLIC_BASE_URL), porque a
 *   Meta baixa o arquivo a partir da URL.
 * A versão da Graph API é configurável (IG_GRAPH_VERSION); confira a versão
 * vigente em developers.facebook.com antes de ativar.
 */
export interface IgCredentials {
  accessToken: string;
  igUserId: string;
  version: string;
}

export class InstagramGraph {
  constructor(private c: IgCredentials, private fetchImpl: typeof fetch = fetch) {}

  private url(path: string, params: Record<string, string> = {}) {
    const u = new URL(`https://graph.facebook.com/${this.c.version}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", this.c.accessToken);
    return u.toString();
  }

  private async call(method: "GET" | "POST", path: string, params: Record<string, string> = {}) {
    const r = await this.fetchImpl(this.url(path, params), { method });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`Instagram API: ${j.error?.message ?? `HTTP ${r.status}`}`);
    return j;
  }

  async me() {
    return this.call("GET", this.c.igUserId, { fields: "id,username" });
  }

  async createImage(imageUrl: string, caption?: string, isCarouselItem = false) {
    return this.call("POST", `${this.c.igUserId}/media`, { image_url: imageUrl, ...(caption ? { caption } : {}), ...(isCarouselItem ? { is_carousel_item: "true" } : {}) });
  }

  async createReel(videoUrl: string, caption: string, coverUrl?: string) {
    return this.call("POST", `${this.c.igUserId}/media`, { media_type: "REELS", video_url: videoUrl, caption, ...(coverUrl ? { cover_url: coverUrl } : {}) });
  }

  async createStory(url: string, isVideo: boolean) {
    return this.call("POST", `${this.c.igUserId}/media`, { media_type: "STORIES", ...(isVideo ? { video_url: url } : { image_url: url }) });
  }

  async createCarousel(childIds: string[], caption: string) {
    return this.call("POST", `${this.c.igUserId}/media`, { media_type: "CAROUSEL", children: childIds.join(","), caption });
  }

  async waitReady(containerId: string, timeoutMs = 5 * 60_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const s = await this.call("GET", containerId, { fields: "status_code,status" });
      if (s.status_code === "FINISHED") return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Container ${s.status_code}: ${s.status ?? ""}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error("Tempo esgotado aguardando processamento da mídia na Meta");
  }

  async publish(containerId: string) {
    return this.call("POST", `${this.c.igUserId}/media_publish`, { creation_id: containerId });
  }

  async insights(mediaId: string, metrics = "reach,views,saved,shares,comments,likes,total_interactions") {
    return this.call("GET", `${mediaId}/insights`, { metric: metrics });
  }
}

/** Lê as credenciais do cliente a partir das variáveis indicadas na tabela integrations. */
export function igCredentialsFromEnv(integration: { secret_env: string | null; config: any } | null): IgCredentials | null {
  if (!integration?.secret_env) return null;
  const token = process.env[integration.secret_env];
  const igUserId = integration.config?.ig_user_id;
  if (!token || !igUserId) return null;
  return { accessToken: token, igUserId, version: process.env.IG_GRAPH_VERSION ?? integration.config?.graph_version ?? "v23.0" };
}
