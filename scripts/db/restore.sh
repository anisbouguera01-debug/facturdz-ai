#!/usr/bin/env bash
# Restauration d'une sauvegarde dans une base CIBLE EXPLICITE (jamais déduite de DATABASE_URL).
#   pnpm db:restore ./backups/facturdz-AAAAMMJJTHHMMSSZ.dump postgresql://…/base_cible
# La base cible doit exister et être VIDE (la restauration refuse sinon). Pour remplacer une base
# en production : restaurer d'abord dans une base neuve, vérifier (pnpm db:verify), puis basculer
# l'application dessus. Tout se fait en une transaction : tout ou rien.
set -euo pipefail
dump="${1:?usage: db:restore <fichier.dump> <url-base-cible>}"
target="${2:?usage: db:restore <fichier.dump> <url-base-cible>}"
[[ -f "$dump" ]] || { echo "Fichier introuvable : $dump" >&2; exit 1; }
if [[ -f "$dump.sha256" ]]; then
  ( cd "$(dirname "$dump")" && sha256sum --check --quiet "$(basename "$dump").sha256" ) \
    || { echo "Somme de contrôle invalide : sauvegarde corrompue ou modifiée." >&2; exit 1; }
else
  echo "Attention : pas de fichier .sha256, intégrité non vérifiée." >&2
fi
if [[ -n "${DATABASE_URL:-}" && "$target" == "$DATABASE_URL" && "${RESTORE_CONFIRM:-}" != "ecraser-la-base-courante" ]]; then
  echo "Refus : la cible est DATABASE_URL. Restaurez dans une base neuve (recommandé)," >&2
  echo "ou définissez RESTORE_CONFIRM=ecraser-la-base-courante en connaissance de cause." >&2
  exit 1
fi
tables="$(psql "$target" -tAc "select count(*) from information_schema.tables where table_schema='public'")"
if [[ "$tables" != "0" ]]; then
  echo "Refus : la base cible contient déjà $tables table(s). Utilisez une base vide." >&2
  exit 1
fi
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname "$target" "$dump"
echo "Restauration terminée dans la base cible."
