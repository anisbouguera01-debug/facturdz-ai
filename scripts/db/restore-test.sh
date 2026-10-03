#!/usr/bin/env bash
# Test RÉEL de restauration : sauvegarde la base courante, la restaure dans une base temporaire,
# compare le nombre de lignes de CHAQUE table, les contraintes et le schéma Prisma, puis supprime la
# base temporaire. Code de sortie ≠ 0 au moindre écart.
#   DATABASE_URL=<url> pnpm db:restore-test
# Nécessite le droit CREATE DATABASE (en local ou sur un serveur de test, pas sur la base de production
# d'un fournisseur managé : y restaurer dans une base neuve créée depuis leur console).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL manquant}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
name="facturdz_restore_test_$$"
admin="${DATABASE_URL%/*}/postgres"
scratch="${DATABASE_URL%/*}/$name"
cleanup() { psql "$admin" -qc "drop database if exists \"$name\"" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

echo "1/5 sauvegarde de la base courante…"
BACKUP_DIR="$work" bash scripts/db/backup.sh
dump="$(ls "$work"/*.dump)"

echo "2/5 création de la base temporaire $name…"
psql "$admin" -qc "create database \"$name\""

echo "3/5 restauration…"
bash scripts/db/restore.sh "$dump" "$scratch"

counts() {
  psql "$1" -tA -c "select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'" \
    | psql "$1" -tA -F' ' -f - | sort
}
echo "4/5 comparaison des lignes de chaque table…"
counts "$DATABASE_URL" > "$work/src.txt"
counts "$scratch" > "$work/dst.txt"
if ! diff -u "$work/src.txt" "$work/dst.txt"; then echo "ÉCART de données après restauration" >&2; exit 1; fi
tables="$(wc -l < "$work/src.txt")"; rows="$(awk '{s+=$2} END {print s+0}' "$work/src.txt")"
[[ "$rows" -gt 0 ]] || { echo "Base source vide : le test ne prouverait rien (lancez pnpm db:reset:local)." >&2; exit 1; }
cons() { psql "$1" -tAc "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'"; }
[[ "$(cons "$DATABASE_URL")" == "$(cons "$scratch")" ]] || { echo "ÉCART de contraintes" >&2; exit 1; }

echo "5/5 conformité du schéma restauré avec prisma/schema.prisma…"
DATABASE_URL="$scratch" pnpm -s db:verify

echo "RESTAURATION VÉRIFIÉE : $tables tables, $rows lignes identiques, $(cons "$scratch") contraintes, schéma conforme."
