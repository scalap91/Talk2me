#!/usr/bin/env python3
"""
Talk2Me #352 — Screenshot test for refactor cards /home 100% viewport.

Seeds DB via better-sqlite3 (called from a helper node script) is too complex,
so we use direct sqlite3 from python. Same DB path. Then take Playwright shots
on 390x844 (S23 FE) with auth cookie via session token.

Outputs (in /home/ubuntu/dashboard/uploads/) :
  - talk2me_home_refactor_youtube.png
  - talk2me_home_refactor_image.png
  - talk2me_home_refactor_video.png
  - talk2me_home_refactor_texte.png
  - talk2me_home_refactor_scroll.png
"""
import sqlite3
import uuid
import json
import time
import sys
import os

DB = "/home/ubuntu/talktome/data/talktome.db"
OUT_DIR = "/home/ubuntu/dashboard/uploads"
HOST = "http://127.0.0.1:3010"

con = sqlite3.connect(DB)
con.execute("PRAGMA journal_mode=WAL")
cur = con.cursor()


def now_ms() -> int:
    return int(time.time() * 1000)


def make_t2m_id() -> str:
    import random
    for _ in range(50):
        i = str(100000 + random.randint(0, 899999))
        r = cur.execute("SELECT 1 FROM users WHERE talk2me_id = ?", (i,)).fetchone()
        if not r:
            return i
    raise RuntimeError("cannot generate talk2me id")


def create_user(display_name: str) -> str:
    uid = str(uuid.uuid4())
    username = "p352_" + uuid.uuid4().hex[:4]
    email = f"p352_{uuid.uuid4().hex[:6]}@bizzi.test"
    n = now_ms()
    t2m = make_t2m_id()
    cur.execute(
        """INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name, ai_gender)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')""",
        (uid, t2m, username, display_name, email, n, n, f"T2M de {display_name}"),
    )
    return uid


def create_session(user_id: str) -> str:
    tok = str(uuid.uuid4())
    n = now_ms()
    exp = n + 24 * 3600 * 1000
    cur.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (tok, user_id, n, exp),
    )
    return tok


def create_conv(user_id: str) -> str:
    cid = str(uuid.uuid4())
    n = now_ms()
    cur.execute(
        "INSERT INTO conversations (id, user_id, created_at, kind, created_by, last_message_preview, last_message_at) VALUES (?, ?, ?, 'agent', ?, ?, ?)",
        (cid, user_id, n, user_id, "seed", n),
    )
    cur.execute(
        "INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)",
        (cid, user_id, n),
    )
    return cid


def insert_message(conv_id: str, role: str, text: str, **opts) -> str:
    mid = str(uuid.uuid4())
    n = now_ms()
    cur.execute(
        """INSERT INTO messages (id, conversation_id, role, text, links, created_at, youtube, places, requires_geoloc, recipe, intent_query, intent_label_fr, user_lat, user_lng, web_search, kind)
           VALUES (?, ?, ?, ?, '[]', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'user')""",
        (
            mid, conv_id, role, text, n,
            json.dumps(opts["youtube"]) if opts.get("youtube") else None,
            json.dumps(opts["places"]) if opts.get("places") else None,
            json.dumps(opts["recipe"]) if opts.get("recipe") else None,
            opts.get("intent_query"),
            opts.get("intent_label_fr"),
            opts.get("user_lat"),
            opts.get("user_lng"),
            json.dumps(opts["web_search"]) if opts.get("web_search") else None,
        ),
    )
    return mid


def create_post_at(user_id: str, conv_id: str, message_ids, ts: int) -> str:
    pid = str(uuid.uuid4())
    cur.execute(
        """INSERT INTO posts (id, user_id, conversation_id, message_ids, created_at, likes, views)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (pid, user_id, conv_id, json.dumps(message_ids), ts, 12, 84),
    )
    return pid


def create_direct_card_at(user_id: str, type_: str, ts: int, **fields) -> str:
    cid = str(uuid.uuid4())
    cur.execute(
        """INSERT INTO direct_cards (id, user_id, type, media_url, caption, text, bg_variant, created_at, likes, views, share_count, save_count, comment_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)""",
        (
            cid, user_id, type_,
            fields.get("media_url"),
            fields.get("caption"),
            fields.get("text"),
            fields.get("bg_variant"),
            ts,
            fields.get("likes", 7),
            fields.get("views", 42),
        ),
    )
    return cid


def purge_prior_p352():
    """Supprime les artefacts de runs précédents pour avoir un feed propre."""
    rows = cur.execute("SELECT id FROM users WHERE username LIKE 'p352_%'").fetchall()
    for (uid,) in rows:
        cur.execute("DELETE FROM sessions WHERE user_id = ?", (uid,))
        cur.execute("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)", (uid,))
        cur.execute("DELETE FROM posts WHERE user_id = ?", (uid,))
        cur.execute("DELETE FROM direct_cards WHERE user_id = ?", (uid,))
        cur.execute("DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)", (uid,))
        cur.execute("DELETE FROM conversations WHERE user_id = ?", (uid,))
        cur.execute("DELETE FROM users WHERE id = ?", (uid,))
    con.commit()


def seed():
    purge_prior_p352()
    me = create_user("Pascal")
    tok = create_session(me)
    conv = create_conv(me)

    # Pour s'assurer que NOS 4 cards atterrissent au TOP du feed, on les date
    # 1 minute dans le FUTUR (le feed sort par created_at DESC).
    # Ordre voulu (1er en haut) : YT, Image, Video, Texte.
    future_base = 60_000  # 1 min in the future
    # On utilise des décalages négatifs internes pour garder l'ordre
    delta = 5_000  # 5s entre chaque
    # post_yt = top (future + 0)
    # image = top - 5s
    # video = top - 10s
    # texte = top - 15s

    # YouTube post — thumbnail required by parseYoutube() in lib/db.ts
    m_yt = insert_message(
        conv, "agent", "Voici une vidéo qui devrait te plaire.",
        youtube={
            "video_id": "dQw4w9WgXcQ",
            "title": "Never Gonna Give You Up",
            "channel": "Rick Astley",
            "description": "The official music video for Never Gonna Give You Up.",
            "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        },
    )
    post_yt = create_post_at(me, conv, [m_yt], ts=now_ms() + future_base)
    print(f"  post_yt = {post_yt[:8]}")

    img = create_direct_card_at(
        me, "image", ts=now_ms() + future_base - delta,
        media_url="/uploads/2f60230f-781b-4788-aa25-6cd0a95e40f0.jpg",
        caption="Coucher de soleil sur les quais, juin 2026.",
        likes=23, views=187,
    )
    print(f"  image = {img[:8]}")

    vid = create_direct_card_at(
        me, "video", ts=now_ms() + future_base - 2 * delta,
        media_url="/uploads/27d41e7c-b9b9-48a2-ae46-faa1be75f084.mp4",
        caption="Petit moment musical du matin",
        likes=18, views=142,
    )
    print(f"  video = {vid[:8]}")

    tx = create_direct_card_at(
        me, "texte", ts=now_ms() + future_base - 3 * delta,
        text="On ne devient pas ce qu'on rêve. On devient ce qu'on fait.",
        bg_variant="purple",
        likes=41, views=312,
    )
    print(f"  texte = {tx[:8]}")

    con.commit()
    return me, tok, {"post_yt": post_yt, "img": img, "vid": vid, "tx": tx}


def cleanup(user_id: str):
    cur.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    con.commit()


def run_shots(token: str, seeds: dict):
    from playwright.sync_api import sync_playwright

    os.makedirs(OUT_DIR, exist_ok=True)

    def scroll_to_card(page, card_id: str):
        """Scroll le <main> de sorte que la section #card-<id> soit alignée tout en haut."""
        page.evaluate(
            """(id) => {
                const main = document.querySelector('main');
                const target = document.getElementById('card-' + id);
                if (!main || !target) return null;
                const offset = target.offsetTop - main.offsetTop;
                main.scrollTo({ top: offset, behavior: 'instant' });
                return offset;
            }""",
            card_id,
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S711B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36",
        )
        context.add_cookies([{
            "name": "talk2me_session",
            "value": token,
            "url": HOST,
        }])
        page = context.new_page()

        # 1. YouTube post (au top du feed grâce au timestamp futur)
        print("[1/5] YouTube post")
        page.goto(f"{HOST}/home", wait_until="networkidle")
        page.wait_for_timeout(3500)
        scroll_to_card(page, seeds["post_yt"])
        page.wait_for_timeout(800)
        page.screenshot(path=f"{OUT_DIR}/talk2me_home_refactor_youtube.png")

        # 2. ImageCard
        print("[2/5] ImageCard")
        scroll_to_card(page, seeds["img"])
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT_DIR}/talk2me_home_refactor_image.png")

        # 3. VideoCard
        print("[3/5] VideoCard")
        scroll_to_card(page, seeds["vid"])
        page.wait_for_timeout(2500)
        page.screenshot(path=f"{OUT_DIR}/talk2me_home_refactor_video.png")

        # 4. TexteCard
        print("[4/5] TexteCard")
        scroll_to_card(page, seeds["tx"])
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT_DIR}/talk2me_home_refactor_texte.png")

        # 5. Scroll intermédiaire entre carte 1 (YT) et carte 2 (Image)
        # = demi-viewport au-dessus de l'image card
        print("[5/5] Scroll intermédiaire (transition YT → Image)")
        page.evaluate(
            """(id) => {
                const main = document.querySelector('main');
                const target = document.getElementById('card-' + id);
                if (!main || !target) return null;
                const offset = target.offsetTop - main.offsetTop;
                main.scrollTo({ top: Math.max(0, offset - 362), behavior: 'instant' });
                return offset;
            }""",
            seeds["img"],
        )
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT_DIR}/talk2me_home_refactor_scroll.png")

        # Capture diagnostic : positions des sections snap
        diag = page.evaluate("""
            () => {
                const sections = document.querySelectorAll('[data-snap-card]');
                const main = document.querySelector('main');
                return {
                    main: { clientHeight: main?.clientHeight, scrollTop: main?.scrollTop, scrollHeight: main?.scrollHeight },
                    nSections: sections.length,
                    first4: Array.from(sections).slice(0, 4).map((s, i) => {
                        const r = s.getBoundingClientRect();
                        return { i, id: s.id, top: r.top, height: r.height };
                    })
                };
            }
        """)
        print("DIAG:", json.dumps(diag, indent=2))

        browser.close()


if __name__ == "__main__":
    me, token, seeds = seed()
    print(f"User session token = {token[:8]}…")
    try:
        run_shots(token, seeds)
    finally:
        cleanup(me)
    print("done.")
