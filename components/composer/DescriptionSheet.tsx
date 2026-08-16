'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * DescriptionSheet — module « Description » du composer, RÉPLIQUE FIDÈLE du natif
 * (Flutter `_openDescSheet`, `main.dart`). Bottom-sheet SOMBRE (#17141F, coins hauts
 * arrondis 24, poignée 40×4) avec, dans l'ordre :
 *   1. En-tête « Description » · toggle Emoji · OK (ferme).
 *   2. Chips de phrases CONTEXTUELLES (selon attache + toggle emoji) → tap = ajoute à la Description.
 *   3. 4 champs : Titre (80), Description (200, multiline), #hashtags (120), @ tagger des amis.
 *      Le champ @ a une autocomplétion (dernier token → /api/friends/search) → chips → insère « @nom ».
 * Aucune logique publish ici : la page assemble la légende via _buildCaption (titre\ndesc\n#tags\n@amis).
 */

interface UserLite { id: string; username: string | null; display_name?: string | null; avatar_url?: string | null }

const ACCENT = '#FF7F11';

// Phrases pré-enregistrées CONTEXTUELLES (selon l'attache), avec/sans emoji — copie EXACTE du natif _phrases().
function phrasesFor(
  emoji: boolean,
  ctx: { hasBoutique?: boolean; hasArticle?: boolean; isVideo?: boolean; hasAudio?: boolean },
): string[] {
  if (ctx.hasBoutique || ctx.hasArticle) {
    return emoji
      ? ['🛍️ Nouveau produit dispo !', 'Prix imbattable 💰', 'Stock limité ⏳', 'Livraison rapide 🚚']
      : ['Nouveau produit disponible', 'Prix imbattable', 'Stock limité', 'Livraison rapide'];
  }
  if (ctx.isVideo) {
    return emoji ? ['Regardez ça 🎬', 'Trop fort 🔥', 'À ne pas manquer 👀'] : ['Regardez ça', 'Trop fort', 'À ne pas manquer'];
  }
  if (ctx.hasAudio) {
    return emoji ? ['Mon son du moment 🎶', 'En boucle 🔁', 'Montez le son 🔊'] : ['Mon son du moment', 'En boucle', 'Montez le son'];
  }
  return emoji ? ['Beau moment ✨', 'Souvenir 📸', 'Bonne journée ☀️', 'Vibe du jour 😎'] : ['Beau moment', 'Souvenir', 'Bonne journée', 'Vibe du jour'];
}

// Champ sombre commun (natif _descField) : fond white24, radius 12, sans compteur mais limite dure.
const fieldStyle = (bold: boolean): React.CSSProperties => ({
  width: '100%',
  background: 'rgba(255,255,255,0.24)',
  border: 'none',
  borderRadius: 12,
  padding: '10px 12px',
  color: '#fff',
  fontWeight: bold ? 800 : 500,
  fontSize: bold ? 18 : 14,
  outline: 'none',
  resize: 'none',
});

// Rangée horizontale de puces cliquables (natif _suggRow) : fond white16, bord white24, radius 16.
function SuggRow({ items, onTap, prefix = '' }: { items: string[]; onTap: (s: string) => void; prefix?: string }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
      {items.map((s, i) => (
        <button
          key={`${s}-${i}`}
          type="button"
          onClick={() => onTap(s)}
          style={{
            flex: '0 0 auto', height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.24)', borderRadius: 16,
            color: '#fff', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
          }}
        >
          {prefix}{s}
        </button>
      ))}
    </div>
  );
}

export default function DescriptionSheet({
  open, onClose,
  title, setTitle,
  description, setDescription,
  hashtags, setHashtags,
  atags, setAtags,
  hasBoutique, hasArticle, isVideo, hasAudio,
}: {
  open: boolean;
  onClose: () => void;
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  hashtags: string; setHashtags: (v: string) => void;
  atags: string; setAtags: (v: string) => void;
  hasBoutique?: boolean; hasArticle?: boolean; isVideo?: boolean; hasAudio?: boolean;
}) {
  const [emoji, setEmoji] = useState(false); // toggle Emoji (change les phrases proposées)
  const [friends, setFriends] = useState<UserLite[]>([]); // liste par défaut (@amis les plus proches)
  const [friendSug, setFriendSug] = useState<UserLite[]>([]); // résultats de recherche sur le dernier token @
  const [atagToken, setAtagToken] = useState(''); // dernier token @ en cours de frappe

  // Amis chargés une fois (fallback affiché quand pas de recherche active — équivalent _topFriends natif).
  useEffect(() => {
    if (!open) return;
    fetch('/api/friends/list').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.friends) setFriends(d.friends); }).catch(() => {});
  }, [open]);

  // Autocomplétion @amis : cherche sur le DERNIER token tapé (natif _onAtags → /users?q=).
  useEffect(() => {
    if (!atagToken) { setFriendSug([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/friends/search?q=${encodeURIComponent(atagToken)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.users) setFriendSug(d.users); }).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [atagToken]);

  // Ajoute une phrase à la Description (natif _addPhrase) : concatène avec un espace, cap 200.
  const addPhrase = useCallback((p: string) => {
    const cur = description.trim();
    const txt = cur ? `${cur} ${p}` : p;
    setDescription(txt.length > 200 ? txt.slice(0, 200) : txt);
  }, [description, setDescription]);

  // Ajoute un #hashtag (natif _addHtag) : normalise avec un seul #, évite les doublons.
  const addHtag = useCallback((h: string) => {
    const tok = `#${h.replace(/^#+/, '')}`;
    const cur = hashtags.trim();
    if (cur.split(/\s+/).includes(tok)) return;
    setHashtags(cur ? `${cur} ${tok}` : tok);
  }, [hashtags, setHashtags]);

  // Frappe dans le champ @ → détecte le dernier token pour la recherche (natif _onAtags).
  const onAtagsChange = useCallback((v: string) => {
    setAtags(v);
    const toks = v.split(/[\s,]+/).filter(Boolean);
    const q = (toks.length ? toks[toks.length - 1] : '').replace(/^@+/, '');
    setAtagToken(q);
  }, [setAtags]);

  // Tap sur un ami → remplace le dernier token par « @nom » (natif _insertFriend).
  const insertFriend = useCallback((name: string) => {
    const parts = atags.split(/\s+/);
    if (parts.length) parts.pop();
    parts.push(`@${name}`);
    const txt = `${parts.join(' ').trim()} `;
    setAtags(txt);
    setFriendSug([]);
    setAtagToken('');
  }, [atags, setAtags]);

  if (!open) return null;

  // Chips @amis : résultats de recherche s'ils existent, sinon la liste d'amis par défaut (natif).
  const atagUsers = friendSug.length ? friendSug : friends;
  const atagNames = atagUsers.map((u) => u.username || '').filter(Boolean);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#17141F', borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: '12px 18px 20px', maxHeight: '88vh', overflowY: 'auto',
          maxWidth: 448, width: '100%', margin: '0 auto',
        }}
      >
        {/* Poignée 40×4 */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.24)', margin: '0 auto 14px' }} />

        {/* En-tête : Description · toggle Emoji · OK */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>Description</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setEmoji((e) => !e)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 20, border: 'none',
              background: emoji ? ACCENT : 'rgba(255,255,255,0.24)', color: '#fff', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>🙂</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Emoji</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: 12, background: 'none', border: 'none', color: ACCENT, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
          >
            OK
          </button>
        </div>

        {/* Chips de phrases contextuelles → tap = ajoute à la Description */}
        <SuggRow items={phrasesFor(emoji, { hasBoutique, hasArticle, isVideo, hasAudio })} onTap={addPhrase} />

        {/* 4 champs */}
        <div style={{ marginTop: 10 }}>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
            placeholder="Titre" style={fieldStyle(true)}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={4}
            placeholder="Description" style={fieldStyle(false)}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            value={hashtags} onChange={(e) => setHashtags(e.target.value)} maxLength={120}
            placeholder="#hashtags" style={fieldStyle(false)}
          />
        </div>
        {/* (Pas de rangée de #hashtags fréquents : le web n'expose pas d'endpoint « suggest » comme le natif → omise, cf. natif quand la liste est vide.) */}
        <div style={{ marginTop: 8 }}>
          <input
            value={atags} onChange={(e) => onAtagsChange(e.target.value)}
            placeholder="@ tagger des amis" style={fieldStyle(false)}
          />
        </div>
        {atagToken && atagNames.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <SuggRow items={atagNames} onTap={insertFriend} prefix="@" />
          </div>
        )}
      </div>
    </div>
  );
}
