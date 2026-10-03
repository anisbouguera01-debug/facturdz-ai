#!/usr/bin/env bash
# Sauvegarde logique PostgreSQL (format custom, compressé) + somme de contrôle + test de lecture.
#   DATABASE_URL=<url directe> pnpm db:backup            # écrit dans ./backups (ou $BACKUP_DIR)
# BACKUP_KEEP_DAYS=N supprime les sauvegardes de plus de N jours (dans ce dossier uniquement).
# Complète, ne remplace pas, les sauvegardes automatiques + PITR du fournisseur managé.
# Le fichier contient TOUTES les données clients : droits 600, dossier hors dépôt, à chiffrer au repos.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL manquant}"
dir="${BACKUP_DIR:-./backups}"
mkdir -p "$dir"
umask 077
file="$dir/facturdz-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file "$file" "$DATABASE_URL"
( cd "$dir" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256" )
pg_restore --list "$file" > /dev/null   # l'archive doit être relisible
echo "Sauvegarde : $file ($(du -h "$file" | cut -f1))"
if [[ -n "${BACKUP_KEEP_DAYS:-}" ]]; then
  find "$dir" -maxdepth 1 -name 'facturdz-*.dump*' -mtime "+${BACKUP_KEEP_DAYS}" -delete
fi
