#!/usr/bin/env bash
# Recria o banco de teste (vyve_test) e roda os testes. Nada é publicado; nenhuma API paga é chamada.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/reset-dev-db.sh vyve_test >/dev/null
rm -rf "${VYVE_STORAGE_DIR:-/tmp/vyve-test-storage}"
node --import tsx --test --test-concurrency=1 tests/*.test.ts "$@"
