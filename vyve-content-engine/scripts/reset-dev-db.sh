#!/usr/bin/env bash
# Recria o banco local de desenvolvimento (APAGA TUDO). Uso: scripts/reset-dev-db.sh [nome_do_banco]
set -euo pipefail
DB="${1:-vyve}"
psql "${PG_SUPERUSER_URL:-postgres://postgres:postgres@localhost:5432/postgres}" -v ON_ERROR_STOP=1 <<SQL
drop database if exists $DB;
create database $DB;
SQL
psql "${PG_SUPERUSER_URL:-postgres://postgres:postgres@localhost:5432/postgres}" -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin create role vyve_login login password 'vyve_dev'; exception when duplicate_object then null; end \$\$;
SQL
DATABASE_ADMIN_URL="postgres://postgres:postgres@localhost:5432/$DB" npx tsx packages/engine/src/cli.ts db migrate
psql "postgres://postgres:postgres@localhost:5432/$DB" -c "grant vyve_app to vyve_login"
