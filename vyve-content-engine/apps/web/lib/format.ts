export const STAGE_LABEL: Record<string, string> = {
  IDEIA: "Ideia", PESQUISA: "Pesquisa", ROTEIRO: "Roteiro", PRODUCAO: "Produção", REVISAO: "Revisão",
  APROVACAO: "Aprovação", AGENDAMENTO: "Agendamento", PUBLICACAO: "Publicação", ANALISE: "Análise",
};
export const STAGES = Object.keys(STAGE_LABEL);
export const STAGE_COLOR = ["bg-s1", "bg-s2", "bg-s3", "bg-s4", "bg-s5", "bg-s6", "bg-s7", "bg-s8", "bg-s9"];

export const FORMAT_LABEL: Record<string, string> = {
  reel: "Reels", carousel: "Carrossel", card: "Card", story_sequence: "Stories", newsletter: "Newsletter", long_video: "Vídeo longo", authority_post: "Post de autoridade",
};

export const PRODUCTION_LABEL: Record<string, string> = {
  aguardando: "Aguardando", pendente_producao: "Pendente de produção", em_producao: "Em produção", pronto: "Pronto", falhou: "Falhou",
};

export const APPROVAL_LABEL: Record<string, string> = {
  nao_solicitada: "Não solicitada", pendente: "Aguardando aprovação", aprovado: "Aprovado", alteracao_solicitada: "Alteração solicitada", rejeitado: "Rejeitado", dispensada: "Dispensada",
};

export const RUN_LABEL: Record<string, string> = {
  queued: "Na fila", running: "Executando", awaiting_external: "Aguardando subagente", awaiting_approval: "Aguardando aprovação",
  succeeded: "Concluída", failed: "Falhou", skipped: "Pulada", blocked: "Bloqueada",
};

export const BATCH_LABEL: Record<string, string> = {
  queued: "Na fila", running: "Em execução", awaiting_approval: "Aguardando aprovação", awaiting_external: "Aguardando subagente",
  completed: "Concluído", completed_with_pending: "Concluído com pendências", failed: "Falhou", blocked: "Bloqueado", cancelled: "Cancelado",
};

export const AGENT_LABEL: Record<string, string> = {
  orquestrador: "Orquestrador", pesquisa: "01 · Pesquisa", estrategia: "02 · Roteiros", audiovisual: "03 · Audiovisual", design: "04 · Design", calendario: "05 · Calendário", analise: "06 · Análise",
};

export const ROLE_LABEL: Record<string, string> = {
  owner: "Dono", admin: "Administrador", strategist: "Estrategista", creator: "Criador", reviewer: "Revisor", client: "Cliente", system: "Sistema",
};

export function tone(status: string): "ok" | "warn" | "err" | "muted" | "info" {
  if (["pronto", "aprovado", "succeeded", "completed", "publicado", "verified", "dispensada"].includes(status)) return "ok";
  if (["falhou", "failed", "erro", "rejeitado", "blocked", "bloqueado", "error"].includes(status)) return "err";
  if (["pendente_producao", "alteracao_solicitada", "completed_with_pending", "awaiting_approval", "pendente", "awaiting_external", "configured"].includes(status)) return "warn";
  if (["running", "em_producao", "queued", "planejado", "agendado"].includes(status)) return "info";
  return "muted";
}

export const dt = (v: string | Date | null | undefined) =>
  v ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(v)) : "—";
export const day = (v: string | Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date(v));
export const usd = (n: number | string | null | undefined) => `US$ ${Number(n ?? 0).toFixed(Number(n ?? 0) < 1 ? 4 : 2)}`;
