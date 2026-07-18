#!/usr/bin/env bash
# Sauvegarde auto des uploads BÊTA (Pascal 2026-06-15, après incident merge).
# rsync ADDITIF (PAS de --delete) : une suppression de la source n'est JAMAIS
# propagée au backup → protège contre l'effacement accidentel (cf incident où
# un merge a écrasé public/uploads). Le backup est un sur-ensemble qui ne perd
# jamais un fichier. Cron horaire.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/public/uploads/"
DST=/home/ubuntu/backups/talktome-uploads/
LOG=/home/ubuntu/backups/talktome-uploads.log

mkdir -p "$DST"
# -a archive, --ignore-existing évite de réécrire, PAS de --delete (volontaire)
OUT=$(rsync -a "$SRC" "$DST" 2>&1) || {
  echo "$(date '+%F %T') BACKUP UPLOADS ECHEC : $OUT" >> "$LOG"
  # Watchdog : aboyer si le script échoue (doctrine pipeline qui foire = Telegram)
  command -v /home/ubuntu/bin/tg-alert >/dev/null 2>&1 && /home/ubuntu/bin/tg-alert "T2M backup uploads ECHEC: $OUT" || true
  exit 1
}
N=$(find "$DST" -type f | wc -l)
echo "$(date '+%F %T') backup uploads OK — $N fichiers dans $DST" >> "$LOG"
