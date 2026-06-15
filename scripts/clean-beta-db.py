#!/usr/bin/env python3
"""Nettoyage base BÊTA : ne garder que les 2 comptes user de Pascal + leur contenu.
Tout le reste (comptes test/seed, dropship, autres users) est purgé.
Backup déjà fait (talktome.beta-backup-pre-clean.db). DEV garde tout."""
import sqlite3, sys

DB = '/home/ubuntu/talktome/data/talktome.db'
KEEP = ('46295688-8ad0-4c66-a9c5-865f45e802a1',  # pascalrepir (gmail)
        '8fb98222-5615-40fb-89ae-1ba6a8b5e3d2')  # pascalrepir_e20 (genius-diagnostic)
ph = ','.join('?' * len(KEEP))

db = sqlite3.connect(DB)
db.execute('PRAGMA foreign_keys=OFF')

def count(t):
    try: return db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    except Exception: return -1

WATCH = ['users','posts','direct_cards','boutiques','simple_shops','simple_shop_items',
         'conversations','messages','friendships','card_likes','card_search']
before = {t: count(t) for t in WATCH}

# 1. Tables vidées entièrement (repart à neuf : messagerie, sessions, amis, activités test)
WIPE = ['conversations','messages','conversation_participants','presence','sessions',
        'magic_links','friendships','rides','ride_events','escrows','calls',
        'chess_games','dame_games']
for t in WIPE:
    try: db.execute(f'DELETE FROM {t}')
    except Exception as e: print('skip wipe', t, e)

# 2. Tables avec réf user → supprimer ce qui n'appartient PAS aux 2 comptes gardés
USER_REF = {
    'posts':'user_id','direct_cards':'user_id','ai_memories':'user_id','saved_cards':'user_id',
    'card_drafts':'user_id','card_likes':'user_id','user_habits':'user_id','route_learnings':'user_id',
    'music_play_events':'user_id','music_manual_score':'user_id','wallet_transactions':'user_id',
    'boutiques':'user_id','comm_contacts':'owner_id','drivers':'user_id','business_inboxes':'owner_id',
    'business_guests':'user_id','simple_shops':'owner_id','deposit_annonces':'user_id',
    'push_subscriptions':'user_id','push_fcm_tokens':'user_id','composer_projects':'user_id',
    'statuses':'owner_id','connected_accounts':'user_id','user_permissions':'user_id',
    'user_ai_keys':'user_id','shipping_addresses':'user_id',
}
for t, col in USER_REF.items():
    try: db.execute(f'DELETE FROM {t} WHERE {col} NOT IN ({ph})', KEEP)
    except Exception as e: print('skip', t, e)

# 3. Comptes : ne garder que les 2
db.execute(f'DELETE FROM users WHERE id NOT IN ({ph})', KEEP)

# 4. Orphelins : items de boutiques supprimées, likes sur cartes supprimées
db.execute('DELETE FROM simple_shop_items WHERE shop_id NOT IN (SELECT id FROM simple_shops)')
db.execute("DELETE FROM card_likes WHERE card_kind='direct_card' AND card_id NOT IN (SELECT id FROM direct_cards)")

# 5. Index de recherche FTS : ne garder que les cartes/posts restants
kept_ids = [r[0] for r in db.execute('SELECT id FROM direct_cards')] + \
           [r[0] for r in db.execute('SELECT id FROM posts')]
if kept_ids:
    kph = ','.join('?' * len(kept_ids))
    db.execute(f'DELETE FROM card_search WHERE post_id NOT IN ({kph})', kept_ids)
else:
    db.execute('DELETE FROM card_search')

db.commit()
db.execute('VACUUM')
db.commit()

after = {t: count(t) for t in WATCH}
print(f"{'TABLE':22} {'avant':>8} {'après':>8}")
for t in WATCH:
    print(f"{t:22} {before[t]:>8} {after[t]:>8}")
print('\nComptes restants :')
for r in db.execute('SELECT username, email FROM users'):
    print('  -', r[0], '|', r[1])
db.close()
