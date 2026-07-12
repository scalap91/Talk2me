'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * CaptionField — champ légende du composer AVEC picker @mention (Pascal 2026-07-12).
 * Pattern standard FB/IG (on ne réinvente pas) : taper « @ » → dropdown des AMIS
 * (via /api/friends/list) + RECHERCHE d'autres users (via /api/friends/search) → tap = insère
 * `@pseudo`. Réutilisable partout (photo, vidéo, boutique…). Rendu des tokens = `rich-text.tsx`.
 */

interface UserLite { id: string; username: string | null; display_name?: string | null; avatar_url?: string | null }

export default function CaptionField({
  value, onChange, placeholder, className, style, maxLength = 200, rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  maxLength?: number;
  rows?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [friends, setFriends] = useState<UserLite[]>([]);
  const [results, setResults] = useState<UserLite[]>([]);
  const [token, setToken] = useState<string | null>(null); // le @partial actif (sans @), null si pas de tag en cours
  const [tokenStart, setTokenStart] = useState(0);

  // Amis chargés une fois (liste par défaut du picker).
  useEffect(() => {
    fetch('/api/friends/list').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.friends) setFriends(d.friends); }).catch(() => {});
  }, []);

  // Recherche d'autres users dès que le token a ≥1 caractère (débounce léger).
  useEffect(() => {
    if (token == null || token.length < 1) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/friends/search?q=${encodeURIComponent(token)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.users) setResults(d.users); }).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [token]);

  // Détecte un @token juste avant le curseur.
  const detect = useCallback((el: HTMLTextAreaElement) => {
    const pos = el.selectionStart ?? 0;
    const upto = el.value.slice(0, pos);
    const m = /(?:^|\s)@([\p{L}\p{N}_]*)$/u.exec(upto);
    if (m) { setToken(m[1]); setTokenStart(pos - m[1].length - 1); }
    else setToken(null);
  }, []);

  const pick = (u: UserLite) => {
    const el = taRef.current;
    if (!el || !u.username) return;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, tokenStart);
    const after = value.slice(pos);
    const inserted = `@${u.username} `;
    onChange(before + inserted + after);
    setToken(null);
    requestAnimationFrame(() => { el.focus(); const c = (before + inserted).length; el.setSelectionRange(c, c); });
  };

  // Liste affichée : amis (filtrés par le token) d'abord, puis résultats recherche (dédup), users sans pseudo exclus.
  const q = (token || '').toLowerCase();
  const fFriends = friends.filter((u) => u.username && (!q || u.username.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q)));
  const seen = new Set(fFriends.map((u) => u.id));
  const list = [...fFriends, ...results.filter((u) => u.username && !seen.has(u.id))].slice(0, 8);

  return (
    <div style={{ position: 'relative' }}>
      {token != null && list.length > 0 && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8, background: 'rgba(18,18,24,.97)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderRadius: 16, overflow: 'hidden', maxHeight: 232, overflowY: 'auto', border: '1px solid rgba(255,255,255,.12)', zIndex: 40, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
          {list.map((u) => (
            <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer' }}>
              {u.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={u.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(45deg,#FF7F11,#ef4444)', flexShrink: 0 }} />}
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.display_name || u.username}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>@{u.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target); }}
        onKeyUp={(e) => detect(e.currentTarget)}
        onClick={(e) => detect(e.currentTarget)}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        className={className}
        style={style}
      />
    </div>
  );
}
