-- VYVE CONTENT ENGINE — fila de execução dos agentes
-- O worker não pertence a uma equipe: ele "reivindica" a próxima etapa pronta
-- por esta função (security definer) e depois trabalha DENTRO do contexto da
-- equipe dona da etapa, sujeito ao RLS como qualquer usuário.

-- Dependências: 'pesquisa' = todas as etapas com esse nome concluídas com sucesso;
-- 'roteiros:*' = todas as etapas com esse prefixo; prefixo '~' = basta terem
-- terminado (sucesso, falha, pulada ou bloqueada).
create or replace function vyve.deps_satisfied(p_run uuid) returns boolean
language plpgsql stable security definer set search_path = vyve, pg_temp as $$
declare
  r vyve.agent_runs;
  d text;
  settled boolean;
  pattern text;
  pending int;
begin
  select * into r from vyve.agent_runs where id = p_run;
  foreach d in array r.depends_on loop
    settled := left(d, 1) = '~';
    pattern := case when settled then substr(d, 2) else d end;
    pattern := replace(pattern, '*', '%');
    select count(*) into pending from vyve.agent_runs x
      where x.batch_id = r.batch_id and x.step like pattern and x.id <> r.id
        and not (
          (settled and x.status in ('succeeded','failed','skipped','blocked')) or
          (not settled and x.status in ('succeeded','skipped'))
        );
    if pending > 0 then return false; end if;
  end loop;
  return true;
end $$;

create or replace function vyve.claim_next_run(p_worker text)
returns table (run_id uuid, team_id uuid, client_id uuid, batch_id uuid, step text, agent text)
language plpgsql security definer set search_path = vyve, pg_temp as $$
declare r record;
begin
  -- Etapas presas (worker caiu no meio) voltam para a fila depois de 30 minutos.
  update vyve.agent_runs set status = 'queued', locked_by = null, locked_at = null
    where status = 'running' and locked_at < now() - interval '30 minutes';

  for r in
    select ar.id from vyve.agent_runs ar
    join vyve.batches b on b.id = ar.batch_id
    where ar.status = 'queued' and ar.next_attempt_at <= now()
      and b.status not in ('cancelled','failed','blocked')
    order by ar.created_at, ar.step
    for update of ar skip locked
  loop
    if vyve.deps_satisfied(r.id) then
      update vyve.agent_runs a
        set status = 'running', locked_by = p_worker, locked_at = now(), attempt = a.attempt + 1,
            started_at = coalesce(a.started_at, now())
        where a.id = r.id;
      return query select a.id, a.team_id, a.client_id, a.batch_id, a.step, a.agent from vyve.agent_runs a where a.id = r.id;
      return;
    end if;
  end loop;
end $$;

revoke all on function vyve.deps_satisfied(uuid) from public;
revoke all on function vyve.claim_next_run(text) from public;
grant execute on function vyve.deps_satisfied(uuid), vyve.claim_next_run(text) to vyve_app;
