#!/usr/bin/env bash
# Prueba la migración en un Postgres local (emula Supabase). Uso:
#   PGHOST=... PGPORT=... PGUSER=postgres scripts/probar-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -c 'drop database if exists cpf2_test' -c 'create database cpf2_test' >/dev/null
$P -d cpf2_test -f supabase/tests/emular-supabase.sql >/dev/null
$P -d cpf2_test -f supabase/migrations/0001_cpf2.sql 2>/dev/null >/dev/null
$P -d cpf2_test -f supabase/migrations/0001_cpf2.sql 2>/dev/null >/dev/null   # idempotente
$P -d cpf2_test -t -f supabase/tests/flujo.sql
