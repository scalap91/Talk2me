#!/usr/bin/env python3
"""
Talk2Me #327 — E2E Playwright pour 3 fixes critiques :
  1. Sous-header conv P2P sans "& Talk2Me" (Talk2Me n'est PAS un participant)
  2. WebRTC cam activée (constraints + fallback + permissions-policy)
  3. CallModal minimisable (PiP) + chat texte parallèle + reopen fullscreen

Architecture : 2 contexts navigateur (Alice + Bob), 2 users en DB direct,
fake media stream via flags Chromium.

Lance les 4 screenshots demandés :
  - talk2me_p327_header_fixed.png
  - talk2me_p327_call_minimized.png
  - talk2me_p327_call_fullscreen.png
  - talk2me_p327_cam_active.png
"""

import os
import sqlite3
import secrets
import uuid
import time
from playwright.sync_api import sync_playwright, Page, BrowserContext, expect

DB_PATH = "/home/ubuntu/talktome/data/talktome.db"
BASE = "http://127.0.0.1:3010"
UPLOADS = "/home/ubuntu/dashboard/uploads"
SESSION_COOKIE = "talk2me_session"

# Mobile viewport S23-ish
VIEWPORT = {"width": 390, "height": 844}
UA = "Mozilla/5.0 (Linux; Android 14; SM-S711B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"


def db():
    return sqlite3.connect(DB_PATH)


def create_user(display_name: str, username: str):
    uid = str(uuid.uuid4())
    email = f"{username}_p327_{secrets.token_hex(2)}@bizzi.test"
    now = int(time.time() * 1000)
    talk2me_id = str(100000 + secrets.randbelow(900000))
    default_ai = f"T2M de {display_name}"
    conn = db()
    try:
        conn.execute(
            """INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email,
                                 created_at, last_seen, ai_name, ai_gender)
               VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'neutre')""",
            (uid, talk2me_id, username, display_name, email, now, now, default_ai),
        )
        # Conversation agent (solo) du user
        conv_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO conversations (id, user_id, created_at, kind, created_by)
               VALUES (?, ?, ?, 'agent', ?)""",
            (conv_id, uid, now, uid),
        )
        conn.execute(
            "INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)",
            (conv_id, uid, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": uid, "display_name": display_name, "username": username, "email": email}


def create_session(user_id: str) -> str:
    token = str(uuid.uuid4())
    now = int(time.time() * 1000)
    exp = now + 30 * 24 * 60 * 60 * 1000
    conn = db()
    try:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, exp),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def befriend(a_id: str, b_id: str):
    fid = str(uuid.uuid4())
    lo, hi = sorted([a_id, b_id])
    conn = db()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (fid, lo, hi, "accepted", int(time.time() * 1000)),
        )
        conn.commit()
    finally:
        conn.close()


def create_p2p_conv(api_token: str, friend_id: str) -> str:
    import urllib.request
    import json as _json

    req = urllib.request.Request(
        f"{BASE}/api/conversations/create-p2p",
        method="POST",
        data=_json.dumps({"friend_id": friend_id}).encode(),
        headers={
            "Content-Type": "application/json",
            "Cookie": f"{SESSION_COOKIE}={api_token}",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        body = _json.loads(r.read().decode())
    return body["conversation"]["id"]


def set_cookie(context: BrowserContext, token: str):
    context.add_cookies(
        [
            {
                "name": SESSION_COOKIE,
                "value": token,
                "url": BASE,
                "httpOnly": False,
                "secure": False,
                "sameSite": "Lax",
            }
        ]
    )


results = []


def record(name: str, ok: bool, detail: str = ""):
    icon = "OK" if ok else "KO"
    print(f"[{icon}] {name}{' — ' + detail if detail else ''}")
    results.append((name, ok, detail))


def shot(page: Page, name: str):
    path = f"{UPLOADS}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"  → screenshot {path}")


def main():
    os.makedirs(UPLOADS, exist_ok=True)
    print("=== Talk2Me #327 — Header + Cam + Minimize ===\n")

    alice = create_user("Alice", f"alice_{secrets.token_hex(2)}")
    bob = create_user("Bob", f"bob_{secrets.token_hex(2)}")
    aliceT = create_session(alice["id"])
    bobT = create_session(bob["id"])
    befriend(alice["id"], bob["id"])
    conv_id = create_p2p_conv(aliceT, bob["id"])
    print(f"Alice id={alice['id'][:8]} | Bob id={bob['id'][:8]} | conv={conv_id[:8]}\n")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
            ],
        )

        alice_ctx = browser.new_context(
            viewport=VIEWPORT,
            user_agent=UA,
            permissions=["camera", "microphone"],
            ignore_https_errors=True,
        )
        bob_ctx = browser.new_context(
            viewport=VIEWPORT,
            user_agent=UA,
            permissions=["camera", "microphone"],
            ignore_https_errors=True,
        )
        set_cookie(alice_ctx, aliceT)
        set_cookie(bob_ctx, bobT)

        alice_page = alice_ctx.new_page()
        bob_page = bob_ctx.new_page()

        # Capture console for debugging
        alice_page.on("console", lambda m: m.type == "error" and print(f"[A-console-error] {m.text}"))
        bob_page.on("console", lambda m: m.type == "error" and print(f"[B-console-error] {m.text}"))

        # --- TEST 1 : sous-header conv P2P sans Talk2Me ---
        print("--- Test 1 : Sub-header conv P2P sans 'Talk2Me' ---")
        alice_page.goto(f"{BASE}/c/{conv_id}", wait_until="domcontentloaded")
        alice_page.wait_for_timeout(1500)

        # On lit le texte du header
        header_text = alice_page.locator("header").first.inner_text()
        no_talk2me = "Talk2Me" not in header_text and "talk2me" not in header_text.lower()
        has_bob = "Bob" in header_text or alice_page.locator("text=Bob").first.is_visible()
        record("p2p_header_no_talk2me", no_talk2me, f"header_text={header_text!r}")
        record("p2p_header_has_peer", has_bob, "")

        shot(alice_page, "talk2me_p327_header_fixed")

        # --- TEST 2 : Démarrer call vidéo + vérifier cam ---
        print("\n--- Test 2 : Call vidéo + cam active ---")
        bob_page.goto(f"{BASE}/c/{conv_id}", wait_until="domcontentloaded")
        bob_page.wait_for_timeout(1500)

        # Alice clique sur le bouton "Appel vidéo"
        alice_page.locator('button[aria-label="Appel vidéo"]').click()
        alice_page.wait_for_timeout(2000)

        # Bob accepte
        try:
            bob_page.wait_for_selector('button[aria-label="Accepter"]', timeout=8000)
            bob_page.locator('button[aria-label="Accepter"]').click()
        except Exception as e:
            print(f"  ! Bob couldn't see Accept button: {e}")

        # Attendre que le call passe en 'active'
        alice_page.wait_for_timeout(4500)

        # Vérifier qu'on a 2 <video> (local + remote) avec srcObject
        video_tracks_alice = alice_page.evaluate(
            """() => {
              const vids = Array.from(document.querySelectorAll('video'));
              return vids.map(v => ({
                hasSrc: !!v.srcObject,
                width: v.videoWidth,
                height: v.videoHeight,
                muted: v.muted,
                autoplay: v.autoplay,
                playsinline: v.playsInline,
              }));
            }"""
        )
        print(f"  Alice videos: {video_tracks_alice}")
        has_local_video = any(v["hasSrc"] for v in video_tracks_alice)
        record(
            "cam_local_stream_attached",
            has_local_video,
            f"{len(video_tracks_alice)} video elts, hasSrc={[v['hasSrc'] for v in video_tracks_alice]}",
        )

        # Vérifier pas d'erreur "Permission micro/caméra refusée" sur Alice
        has_perm_err = alice_page.locator("text=Permission micro/caméra refusée").count() > 0
        record("cam_no_permission_error", not has_perm_err, "")

        shot(alice_page, "talk2me_p327_cam_active")

        # --- TEST 3 : Minimize → PiP flottant ---
        print("\n--- Test 3 : Minimize call → PiP ---")
        try:
            alice_page.wait_for_selector('[data-testid="call-minimize"]', timeout=8000)
            alice_page.locator('[data-testid="call-minimize"]').click()
            alice_page.wait_for_timeout(900)
            pip_visible = alice_page.locator('[data-testid="call-pip"]').is_visible()
            record("call_minimize_pip_visible", pip_visible, "")
        except Exception as e:
            record("call_minimize_pip_visible", False, f"err: {e}")

        # --- TEST 4 : Chat texte fonctionne pendant le call minimisé ---
        print("\n--- Test 4 : Chat texte pendant call minimisé ---")
        try:
            # ChatInput utilise un <input> (cf composants/chat/ChatInput.tsx)
            ta = alice_page.locator('input[type="text"], textarea').first
            ta.click(timeout=8000)
            ta.fill("Hello pendant call")
            # Bouton send : aria-label "Envoyer" quand text non vide
            sent = False
            for sel in ['button[aria-label="Envoyer"]', 'button[type="submit"]']:
                if alice_page.locator(sel).count() > 0:
                    alice_page.locator(sel).first.click()
                    sent = True
                    break
            if not sent:
                ta.press("Enter")
                sent = True
            alice_page.wait_for_timeout(2500)
            bob_sees = bob_page.locator("text=Hello pendant call").count() > 0
            record("chat_works_during_call", sent and bob_sees, f"sent={sent} bob_sees={bob_sees}")
        except Exception as e:
            record("chat_works_during_call", False, f"err: {e}")

        shot(alice_page, "talk2me_p327_call_minimized")

        # --- TEST 5 : Reopen fullscreen via tap PiP ---
        print("\n--- Test 5 : Tap PiP → fullscreen ---")
        try:
            alice_page.locator('[data-testid="call-pip"]').click()
            alice_page.wait_for_timeout(900)
            fullscreen = alice_page.locator('[data-testid="call-minimize"]').is_visible()
            record("call_reopen_fullscreen", fullscreen, "")
            shot(alice_page, "talk2me_p327_call_fullscreen")
        except Exception as e:
            record("call_reopen_fullscreen", False, f"err: {e}")

        # --- TEST 6 : Bob raccroche → toast Alice ---
        print("\n--- Test 6 : Bob raccroche → toast ---")
        try:
            bob_page.locator('button[aria-label="Raccrocher"]').click()
            alice_page.wait_for_timeout(1500)
            # Le modal va se fermer dans 800ms ; soit on capte le toast soit le modal a disparu
            toast_visible = (
                alice_page.locator('[data-testid="call-ended-toast"]').count() > 0
                or alice_page.locator("text=Appel terminé").count() > 0
            )
            # OK si modal fermé proprement
            modal_closed = alice_page.locator('[data-testid="call-minimize"]').count() == 0
            record("hangup_cleanup", toast_visible or modal_closed, f"toast={toast_visible} modalClosed={modal_closed}")
        except Exception as e:
            record("hangup_cleanup", False, f"err: {e}")

        browser.close()

    # --- Rapport ---
    print("\n=== RAPPORT ===")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    for name, ok, detail in results:
        print(f"  [{'OK' if ok else 'KO'}] {name}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
