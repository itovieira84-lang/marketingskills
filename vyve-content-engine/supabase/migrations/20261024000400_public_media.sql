-- VYVE CONTENT ENGINE — mídia pública para a publicação oficial
-- A Meta baixa a mídia por URL. Esta função só devolve arquivos que são saída
-- de uma peça APROVADA (a URL ainda exige assinatura HMAC no aplicativo).

create or replace function vyve.public_asset(p_asset uuid)
returns table (storage_path text, mime text)
language sql stable security definer set search_path = vyve, pg_temp as $$
  select a.storage_path, a.mime
  from vyve.media_assets a
  where a.id = p_asset
    and exists (select 1 from vyve.pieces p where p.approval = 'aprovado' and a.id = any(p.output_asset_ids))
$$;

revoke all on function vyve.public_asset(uuid) from public;
grant execute on function vyve.public_asset(uuid) to vyve_app;
