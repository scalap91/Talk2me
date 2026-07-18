#!/usr/bin/env python3
"""Sauvegarde auto de la base BÊTA (Pascal 2026-06-14).
Backup cohérent (API sqlite .backup, OK même en WAL) → gz → rotation 14 jours.
Cron quotidien. Backblaze/S3 = à brancher plus tard (compte Pascal)."""
import sqlite3, os, time, gzip, glob, shutil

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'talktome.db')  # portable (racine du repo)
DIR = '/home/ubuntu/backups/talktome'
KEEP = 14

os.makedirs(DIR, exist_ok=True)
ts = time.strftime('%Y%m%d-%H%M')
dst = os.path.join(DIR, f'talktome-{ts}.db')

src = sqlite3.connect(SRC)
bck = sqlite3.connect(dst)
with bck:
    src.backup(bck)
bck.close(); src.close()

with open(dst, 'rb') as f, gzip.open(dst + '.gz', 'wb') as g:
    shutil.copyfileobj(f, g)
os.remove(dst)

files = sorted(glob.glob(os.path.join(DIR, 'talktome-*.db.gz')), reverse=True)
for old in files[KEEP:]:
    os.remove(old)

print(time.strftime('%Y-%m-%d %H:%M'), 'backup OK', dst + '.gz', os.path.getsize(dst + '.gz'), 'octets')
