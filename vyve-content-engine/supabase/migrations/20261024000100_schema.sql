-- VYVE CONTENT ENGINE — esquema principal
-- Compatível com Supabase (Postgres 15+) e Postgres puro (16 testado).
-- Toda tabela de negócio carrega team_id (isolamento por agência) e, quando
-- aplicável, client_id (isolamento por cliente). As políticas RLS estão em
-- 20261024000200_rls.sql.

create extension if not exists pgcrypto;

create schema if not exists vyve;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type vyve.user_role as enum ('owner','admin','strategist','creator','reviewer','client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vyve.stage as enum ('IDEIA','PESQUISA','ROTEIRO','PRODUCAO','REVISAO','APROVACAO','AGENDAMENTO','PUBLICACAO','ANALISE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vyve.production_status as enum ('aguardando','pendente_producao','em_producao','pronto','falhou');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vyve.piece_format as enum ('reel','carousel','card','story_sequence','newsletter','long_video','authority_post');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vyve.rights_status as enum ('own','licensed','authorized','unknown','restricted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vyve.run_status as enum ('queued','running','awaiting_external','awaiting_approval','succeeded','failed','skipped','blocked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- equipe e usuários
create table if not exists vyve.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_budget_usd numeric(12,4) not null default 50,
  created_at timestamptz not null default now()
);

create table if not exists vyve.users (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role vyve.user_role not null default 'creator',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vyve.api_keys (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  label text not null,
  key_hash text not null unique,      -- sha256 do token; o token só é mostrado na criação
  created_by uuid references vyve.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- clientes e marca
create table if not exists vyve.clients (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  name text not null,
  slug text not null,
  segment text not null default '',
  audience text not null default '',
  objectives text not null default '',
  tone text not null default '',
  -- frequência contratada por semana, ex.: {"reel":3,"carousel":2,"story_sequence":5}
  posting_frequency jsonb not null default '{}'::jsonb,
  channels jsonb not null default '["instagram"]'::jsonb,
  contract jsonb not null default '{}'::jsonb,
  -- portões de aprovação humana (true = exige aprovação no painel)
  require_research_approval boolean not null default true,
  require_script_approval boolean not null default true,
  batch_budget_usd numeric(12,4) not null default 5,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, slug)
);

create table if not exists vyve.client_members (
  client_id uuid not null references vyve.clients(id) on delete cascade,
  user_id uuid not null references vyve.users(id) on delete cascade,
  primary key (client_id, user_id)
);

create table if not exists vyve.consents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  person_name text not null,
  scope text not null check (scope in ('image','voice','likeness')),
  granted_by text not null,
  evidence text not null,              -- link/descrição do documento de autorização
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  recorded_by uuid references vyve.users(id)
);

create table if not exists vyve.media_assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','logo','font','document','render','reference')),
  label text not null default '',
  storage_path text not null,
  mime text not null default 'application/octet-stream',
  bytes bigint not null default 0,
  sha256 text,
  width int,
  height int,
  duration_s numeric(10,3),
  rights_status vyve.rights_status not null default 'unknown',
  rights_notes text not null default '',
  consent_id uuid references vyve.consents(id),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references vyve.users(id),
  created_at timestamptz not null default now()
);
create index if not exists media_assets_client_idx on vyve.media_assets(client_id, kind);

create table if not exists vyve.brands (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null unique references vyve.clients(id) on delete cascade,
  logo_asset_id uuid references vyve.media_assets(id) on delete set null,
  colors jsonb not null default '{"primary":"#1F3A5F","secondary":"#F2C14E","background":"#FAFAF7","text":"#121212"}'::jsonb,
  fonts jsonb not null default '{"heading":"Inter","body":"Inter"}'::jsonb,
  visual_elements jsonb not null default '[]'::jsonb,
  voice text not null default '',
  restrictions text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- briefing → pesquisa → ideias → roteiros
create table if not exists vyve.briefings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  title text not null,
  theme text not null,
  objective text not null default '',
  body text not null default '',
  source_asset_id uuid references vyve.media_assets(id),
  mix jsonb not null,                   -- {"reel":10,"carousel":6,...}
  status text not null default 'rascunho' check (status in ('rascunho','validado','em_producao','concluido','cancelado')),
  created_by uuid references vyve.users(id),
  created_at timestamptz not null default now()
);

create table if not exists vyve.batches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  briefing_id uuid not null references vyve.briefings(id) on delete cascade,
  mix jsonb not null,
  provider text not null,              -- anthropic | claude-code | fixture
  status text not null default 'queued' check (status in ('queued','running','awaiting_approval','awaiting_external','completed','completed_with_pending','failed','blocked','cancelled')),
  idempotency_key text not null unique,
  budget_usd numeric(12,4) not null,
  cost_usd numeric(12,6) not null default 0,
  is_fictitious boolean not null default false,
  created_by uuid references vyve.users(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists vyve.research (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  briefing_id uuid not null references vyve.briefings(id) on delete cascade,
  batch_id uuid references vyve.batches(id) on delete cascade,
  payload jsonb not null,               -- briefing estratégico estruturado
  report_md text not null,
  sources jsonb not null default '[]'::jsonb,
  dropped_claims jsonb not null default '[]'::jsonb, -- afirmações descartadas por falta de fonte verificável
  provider text not null,
  is_fictitious boolean not null default false,
  approval text not null default 'pendente' check (approval in ('pendente','aprovado','alteracao_solicitada','dispensada')),
  approved_by uuid references vyve.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vyve.ideas (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  briefing_id uuid not null references vyve.briefings(id) on delete cascade,
  batch_id uuid references vyve.batches(id) on delete cascade,
  title text not null,
  angle text not null,
  format vyve.piece_format not null,
  funnel_stage text not null,
  scores jsonb not null default '{}'::jsonb, -- potencial (1-5) — estimativa qualitativa, não previsão
  created_at timestamptz not null default now()
);

create table if not exists vyve.scripts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  briefing_id uuid not null references vyve.briefings(id) on delete cascade,
  batch_id uuid references vyve.batches(id) on delete cascade,
  idea_id uuid references vyve.ideas(id) on delete set null,
  format vyve.piece_format not null,
  payload jsonb not null,               -- título, objetivo, público, funil, gancho, desenvolvimento, CTA...
  version int not null default 1,
  approval text not null default 'pendente' check (approval in ('pendente','aprovado','alteracao_solicitada','dispensada')),
  approved_by uuid references vyve.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- peças e aprovação
create table if not exists vyve.pieces (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  briefing_id uuid not null references vyve.briefings(id) on delete cascade,
  batch_id uuid references vyve.batches(id) on delete cascade,
  script_id uuid references vyve.scripts(id) on delete set null,
  seq int not null,
  format vyve.piece_format not null,
  title text not null,
  stage vyve.stage not null default 'IDEIA',
  production_status vyve.production_status not null default 'aguardando',
  production_mode text,                 -- A (vídeo original) | B (imagens+narração) | C (só roteiro) | design | texto
  pending_reasons jsonb not null default '[]'::jsonb,
  qa jsonb not null default '{}'::jsonb,
  caption text not null default '',
  body text not null default '',        -- texto final (newsletter/post) quando o formato é texto
  output_asset_ids uuid[] not null default '{}',
  preview_asset_id uuid references vyve.media_assets(id),
  metadata jsonb not null default '{}'::jsonb,
  version int not null default 1,
  approval text not null default 'nao_solicitada' check (approval in ('nao_solicitada','pendente','aprovado','alteracao_solicitada','rejeitado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, seq)
);
create index if not exists pieces_client_stage_idx on vyve.pieces(client_id, stage);

create table if not exists vyve.piece_history (
  id bigint generated always as identity primary key,
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  piece_id uuid not null references vyve.pieces(id) on delete cascade,
  from_stage vyve.stage,
  to_stage vyve.stage,
  actor_user_id uuid references vyve.users(id),
  actor_agent text,
  note text not null default '',
  at timestamptz not null default now()
);

create table if not exists vyve.approvals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  piece_id uuid not null references vyve.pieces(id) on delete cascade,
  piece_version int not null,
  decision text not null default 'pendente' check (decision in ('pendente','aprovado','alteracao_solicitada','rejeitado')),
  comment text not null default '',
  requested_at timestamptz not null default now(),
  decided_by uuid references vyve.users(id),
  decided_at timestamptz
);

-- ---------------------------------------------------------------- calendário e publicação
create table if not exists vyve.commercial_dates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid references vyve.clients(id) on delete cascade, -- null = data da agência inteira
  date date not null,
  label text not null,
  kind text not null default 'comercial' check (kind in ('comercial','bloqueio','campanha'))
);

create table if not exists vyve.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  piece_id uuid not null references vyve.pieces(id) on delete cascade,
  channel text not null,
  scheduled_for timestamptz not null,
  status text not null default 'planejado' check (status in ('planejado','agendado','publicado','erro','cancelado')),
  created_by uuid references vyve.users(id),
  created_at timestamptz not null default now(),
  unique (piece_id, channel)            -- evita publicação duplicada da mesma peça no mesmo canal
);

create table if not exists vyve.publications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  piece_id uuid not null references vyve.pieces(id) on delete cascade,
  calendar_entry_id uuid references vyve.calendar_entries(id) on delete set null,
  channel text not null,
  provider text not null,
  request_hash text not null unique,   -- idempotência: mesma peça+versão+canal não sai duas vezes
  status text not null check (status in ('bloqueado','enviando','agendado','publicado','erro')),
  external_id text,
  error text,
  approved_by uuid references vyve.users(id),
  requested_by uuid references vyve.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vyve.metrics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  publication_id uuid not null references vyve.publications(id) on delete cascade,
  source text not null,                -- ex.: instagram_graph, metricool, import_csv
  collected_at timestamptz not null default now(),
  reach int, views int, avg_watch_time_s numeric(10,2), retention_pct numeric(6,2),
  shares int, saves int, comments int, likes int, interactions int, clicks int, conversions int,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists vyve.learnings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  period_start date, period_end date,
  insight text not null,
  kind text not null check (kind in ('padrao','hipotese','recomendacao')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- execução, custo, logs, integrações
create table if not exists vyve.agent_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid not null references vyve.clients(id) on delete cascade,
  batch_id uuid not null references vyve.batches(id) on delete cascade,
  agent text not null,
  step text not null,
  status vyve.run_status not null default 'queued',
  attempt int not null default 0,
  max_attempts int not null default 3,
  depends_on text[] not null default '{}',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  idempotency_key text not null unique,
  locked_by text,
  locked_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_queue_idx on vyve.agent_runs(status, next_attempt_at);

create table if not exists vyve.api_costs (
  id bigint generated always as identity primary key,
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid references vyve.clients(id) on delete cascade,
  batch_id uuid references vyve.batches(id) on delete cascade,
  agent_run_id uuid references vyve.agent_runs(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  web_searches int not null default 0,
  usd numeric(12,6) not null default 0,
  at timestamptz not null default now()
);

create table if not exists vyve.logs (
  id bigint generated always as identity primary key,
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid references vyve.clients(id) on delete cascade,
  batch_id uuid references vyve.batches(id) on delete cascade,
  agent_run_id uuid references vyve.agent_runs(id) on delete set null,
  level text not null check (level in ('debug','info','warn','error')),
  event text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists logs_batch_idx on vyve.logs(batch_id, at);

create table if not exists vyve.integrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references vyve.teams(id) on delete cascade,
  client_id uuid references vyve.clients(id) on delete cascade,
  provider text not null,
  -- só configuração NÃO secreta. Segredos ficam em variáveis de ambiente;
  -- aqui guardamos apenas o NOME da variável (secret_env).
  config jsonb not null default '{}'::jsonb,
  secret_env text,
  status text not null default 'not_configured' check (status in ('not_configured','configured','verified','error')),
  last_checked_at timestamptz,
  last_error text,
  unique (team_id, client_id, provider)
);

-- Papel usado pela aplicação. Não é dono das tabelas, então o RLS vale para ele.
do $$ begin
  create role vyve_app nologin;
exception when duplicate_object then null; end $$;

grant usage on schema vyve to vyve_app;
grant select, insert, update, delete on all tables in schema vyve to vyve_app;
grant usage, select on all sequences in schema vyve to vyve_app;
alter default privileges in schema vyve grant select, insert, update, delete on tables to vyve_app;
alter default privileges in schema vyve grant usage, select on sequences to vyve_app;
