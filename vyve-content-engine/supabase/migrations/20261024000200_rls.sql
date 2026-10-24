-- VYVE CONTENT ENGINE — isolamento por agência (team) e por cliente (RLS)
--
-- A aplicação conecta com um papel de login membro de `vyve_app` (não dono das
-- tabelas) e, em cada transação, declara quem está agindo:
--   select set_config('app.team_id', '<uuid>', true);
--   select set_config('app.user_id', '<uuid>', true);
--   select set_config('app.role',    '<papel>', true);
-- Sem esse contexto, nenhuma linha é visível. Usuários com papel `client` só
-- enxergam os clientes aos quais estão vinculados em client_members.

create or replace function vyve.current_team() returns uuid
language sql stable as $$
  select nullif(current_setting('app.team_id', true), '')::uuid
$$;

create or replace function vyve.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function vyve.current_role_name() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.role', true), ''), 'anon')
$$;

-- security definer: precisa ler client_members sem depender da própria política
create or replace function vyve.can_access_client(target uuid) returns boolean
language sql stable security definer set search_path = vyve, pg_temp as $$
  select case
    when vyve.current_team() is null then false
    when vyve.current_role_name() = 'client' then exists (
      select 1 from vyve.client_members m
      join vyve.clients c on c.id = m.client_id
      where m.client_id = target and m.user_id = vyve.current_user_id()
        and c.team_id = vyve.current_team())
    else exists (select 1 from vyve.clients c where c.id = target and c.team_id = vyve.current_team())
  end
$$;

-- Login: única forma de ler usuário sem contexto de equipe.
create or replace function vyve.auth_lookup(p_email text)
returns table (id uuid, team_id uuid, name text, role vyve.user_role, password_hash text, active boolean)
language sql stable security definer set search_path = vyve, pg_temp as $$
  select u.id, u.team_id, u.name, u.role, u.password_hash, u.active
  from vyve.users u where lower(u.email) = lower(p_email)
$$;

-- API (n8n): resolve o token (já em sha256) para a equipe.
create or replace function vyve.api_key_lookup(p_hash text)
returns table (id uuid, team_id uuid)
language sql stable security definer set search_path = vyve, pg_temp as $$
  select k.id, k.team_id from vyve.api_keys k where k.key_hash = p_hash and k.revoked_at is null
$$;

-- Bootstrap: cria a primeira equipe e o primeiro dono (só funciona com o banco vazio).
create or replace function vyve.bootstrap_team(p_team text, p_email text, p_name text, p_hash text)
returns uuid
language plpgsql security definer set search_path = vyve, pg_temp as $$
declare t uuid;
begin
  if exists (select 1 from vyve.users) then
    raise exception 'bootstrap já realizado';
  end if;
  insert into vyve.teams(name) values (p_team) returning id into t;
  insert into vyve.users(team_id, email, name, password_hash, role) values (t, p_email, p_name, p_hash, 'owner');
  return t;
end $$;

revoke all on function vyve.auth_lookup(text) from public;
revoke all on function vyve.api_key_lookup(text) from public;
revoke all on function vyve.bootstrap_team(text,text,text,text) from public;
grant execute on function vyve.auth_lookup(text), vyve.api_key_lookup(text), vyve.bootstrap_team(text,text,text,text) to vyve_app;
grant execute on function vyve.current_team(), vyve.current_user_id(), vyve.current_role_name(), vyve.can_access_client(uuid) to vyve_app;

-- ---------------------------------------------------------------- políticas
alter table vyve.teams enable row level security;
drop policy if exists team_self on vyve.teams;
create policy team_self on vyve.teams using (id = vyve.current_team()) with check (id = vyve.current_team());

alter table vyve.users enable row level security;
drop policy if exists users_team on vyve.users;
create policy users_team on vyve.users
  using (team_id = vyve.current_team() and (vyve.current_role_name() <> 'client' or id = vyve.current_user_id()))
  with check (team_id = vyve.current_team() and vyve.current_role_name() in ('owner','admin'));

alter table vyve.api_keys enable row level security;
drop policy if exists api_keys_team on vyve.api_keys;
create policy api_keys_team on vyve.api_keys
  using (team_id = vyve.current_team() and vyve.current_role_name() in ('owner','admin'))
  with check (team_id = vyve.current_team() and vyve.current_role_name() in ('owner','admin'));

alter table vyve.clients enable row level security;
drop policy if exists clients_scope on vyve.clients;
create policy clients_scope on vyve.clients
  using (team_id = vyve.current_team() and (vyve.current_role_name() <> 'client' or vyve.can_access_client(id)))
  with check (team_id = vyve.current_team() and vyve.current_role_name() <> 'client');

alter table vyve.client_members enable row level security;
drop policy if exists members_scope on vyve.client_members;
create policy members_scope on vyve.client_members
  using (vyve.can_access_client(client_id))
  with check (vyve.can_access_client(client_id) and vyve.current_role_name() in ('owner','admin'));

-- Tabelas com client_id obrigatório: mesma política em todas.
do $$
declare t text;
begin
  foreach t in array array[
    'consents','media_assets','brands','briefings','batches','research','ideas','scripts',
    'pieces','piece_history','approvals','calendar_entries','publications','metrics',
    'learnings','agent_runs'
  ] loop
    execute format('alter table vyve.%I enable row level security', t);
    execute format('drop policy if exists %I on vyve.%I', t || '_scope', t);
    execute format($p$create policy %I on vyve.%I
      using (team_id = vyve.current_team() and vyve.can_access_client(client_id))
      with check (team_id = vyve.current_team() and vyve.can_access_client(client_id))$p$, t || '_scope', t);
  end loop;
end $$;

-- Tabelas com client_id opcional (registro da agência inteira quando nulo).
do $$
declare t text;
begin
  foreach t in array array['commercial_dates','api_costs','logs','integrations'] loop
    execute format('alter table vyve.%I enable row level security', t);
    execute format('drop policy if exists %I on vyve.%I', t || '_scope', t);
    execute format($p$create policy %I on vyve.%I
      using (team_id = vyve.current_team() and (
        (client_id is null and vyve.current_role_name() <> 'client') or
        (client_id is not null and vyve.can_access_client(client_id))))
      with check (team_id = vyve.current_team() and (
        (client_id is null and vyve.current_role_name() <> 'client') or
        (client_id is not null and vyve.can_access_client(client_id))))$p$, t || '_scope', t);
  end loop;
end $$;

-- Clientes (papel `client`) não editam peças diretamente: só decidem aprovações.
drop policy if exists pieces_client_readonly on vyve.pieces;
create policy pieces_client_readonly on vyve.pieces as restrictive for update
  using (vyve.current_role_name() <> 'client');
