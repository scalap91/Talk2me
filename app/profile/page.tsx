'use client';

/**
 * Profil T2M — page POSÉE d'après la maquette Gemini « L'Éclat du Quotidien »
 * (dashboard.genius-web.fr/profil-gemini.html), couvrant 100% des fonctions de
 * l'ancien profil. Design = Gemini ; branchement des handlers = ici.
 * Fonctions : avatar+recadrage, nom éditable, @pseudo, email, téléphone, wallet,
 * mon activité, amis, cards enregistrées, appareils, monétisation/contributeur,
 * transporteur, IA Léa (avatar/nom/genre/mémoire), salle 3D (photo+tagline),
 * notifications (→ /notifications), affichage Carte/Photo, mentions légales,
 * ESPACE ADMIN (DevModeToggle + Corbeille + Boussole + AdminSection), déco, suppression.
 * NB : Confidentialité / Comptes bloqués / Langue retirés (pages /settings/* absentes → 404).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AvatarCropper from '@/components/AvatarCropper';
import BottomNav from '@/components/chat/BottomNav';
import AdminSection from '@/components/profile/AdminSection';
import DevModeToggle from '@/components/profile/DevModeToggle';
import ComputePoolPanel from '@/components/compute/ComputePoolPanel';
import DevOnly from '@/components/system/DevOnly';

type AiGender = 'feminin' | 'masculin' | 'neutre';
interface Me {
  id: string; username: string; display_name: string | null; avatar_url: string | null;
  email?: string | null; phone?: string | null;
  ai_name?: string | null; ai_gender?: AiGender | null; ai_avatar_url?: string | null;
  room_photo?: string | null; room_tagline?: string | null;
  is_admin_capable?: boolean; is_admin?: boolean;
}

const card: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 18, boxShadow: '0 4px 16px rgba(47,52,58,.06)', marginBottom: 20, padding: '15px 0', overflow: 'hidden' };
const title: React.CSSProperties = { fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 18, margin: '0 20px 12px', color: '#2F343A' };
// Rubrique repliable : on ne voit que le titre, tap → déroule (accordéon natif <details>/<summary>).
const sumStyle: React.CSSProperties = { ...title, marginBottom: 8, cursor: 'pointer', outline: 'none', userSelect: 'none' };
const rowBase: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid #E7EAF0', width: '100%', background: 'none', border: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: '#2F343A' };
const chev = <span style={{ fontSize: 18, color: '#9DAAB7' }}>›</span>;
const ic = (color?: string): React.CSSProperties => ({ fontSize: 20, marginRight: 15, ...(color ? { color } : {}) });

function LinkRow({ icon, label, sub, value, badge, onGo, last }: { icon: string; label: string; sub?: string; value?: string; badge?: number; onGo: () => void; last?: boolean }) {
  return (
    <button style={last ? { ...rowBase, borderBottom: 'none' } : rowBase} onClick={onGo}>
      <span style={ic()}>{icon}</span>
      <span style={{ flexGrow: 1, minWidth: 0 }}><span style={{ display: 'block' }}>{label}</span>{sub && <span style={{ display: 'block', fontSize: 12, color: '#9DAAB7', marginTop: 2 }}>{sub}</span>}</span>
      {value && <span style={{ color: '#6A7585', marginRight: 8, fontSize: 13 }}>{value}</span>}
      {badge ? <span style={{ background: '#FF7F11', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, marginRight: 8 }}>{badge}</span> : null}
      {chev}
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ file: File; kind: 'avatar' | 'ai' } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [isContrib, setIsContrib] = useState(false); // accès formation ouvert → voit sa formation
  const [isValidateur, setIsValidateur] = useState(false); // validateur → peut former/certifier
  const [editName, setEditName] = useState(false); const [nameInput, setNameInput] = useState('');
  const [editAi, setEditAi] = useState(false); const [aiInput, setAiInput] = useState('');
  const [editTag, setEditTag] = useState(false); const [tagInput, setTagInput] = useState('');
  const [genderSaving, setGenderSaving] = useState(false);
  const [roomUploading, setRoomUploading] = useState(false);
  const fileAvatar = useRef<HTMLInputElement>(null);
  const fileAi = useRef<HTMLInputElement>(null);
  const fileRoom = useRef<HTMLInputElement>(null);
  // Affichage Carte / Photo — préférence PAR USER (pour tout le monde), stockée en
  // localStorage, appliquée sans flash au boot (layout) et en direct ici.
  const [display, setDisplay] = useState<'cards' | 'photo'>('cards');
  useEffect(() => { try { const d = localStorage.getItem('t2m_display'); if (d === 'photo' || d === 'cards') setDisplay(d); } catch { /* */ } }, []);
  const applyDisplay = (d: 'cards' | 'photo') => {
    setDisplay(d);
    try { localStorage.setItem('t2m_display', d); } catch { /* */ }
    const r = document.documentElement;
    r.dataset.feed = d;
    ['annonces', 'eat', 'boutique', 'service', 'discussions', 'profil', 'card', 'drive'].forEach((s) => r.setAttribute('data-d-' + s, d));
    window.dispatchEvent(new Event('t2m:theme'));
  };
  // Profil en mode Photo : en-tête = bannière de couverture (room_photo) + avatar posé dessus.
  const [profilPhoto, setProfilPhoto] = useState(false);
  useEffect(() => {
    const read = () => setProfilPhoto(document.documentElement.dataset.dProfil === 'photo');
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) { window.location.replace('/signin'); return; }
        setMe(d.user); setNameInput(d.user.display_name || ''); setAiInput(d.user.ai_name || ''); setTagInput(d.user.room_tagline || '');
        if (d.user.is_admin_capable) fetch('/api/cards/trash?scope=admin', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((t) => { if (t && typeof t.count === 'number') setTrashCount(t.count); }).catch(() => {});
      }).catch(() => {}).finally(() => setLoading(false));
    fetch('/api/formation/access', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.has_access) setIsContrib(true); if (d?.is_validateur) setIsValidateur(true); }).catch(() => {});
  }, []);

  function pick(e: React.ChangeEvent<HTMLInputElement>, kind: 'avatar' | 'ai') {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !me) return;
    if (file.size > 5 * 1024 * 1024) { setUploadError('Photo trop lourde (max 5 Mo)'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setUploadError('Format non supporté'); return; }
    setUploadError(null); setCrop({ file, kind });
  }
  async function uploadCropped(blob: Blob) {
    if (!me || !crop) return; const kind = crop.kind; setCrop(null);
    const form = new FormData(); form.append('file', new File([blob], 'a.webp', { type: 'image/webp' }));
    setUploading(true);
    try {
      const res = await fetch(kind === 'avatar' ? '/api/users/me/avatar' : '/api/users/me/ai-avatar', { method: 'POST', body: form });
      const d = await res.json();
      if (res.ok && kind === 'avatar' && d?.avatar_url) setMe({ ...me, avatar_url: d.avatar_url });
      else if (res.ok && kind === 'ai' && d?.ai_avatar_url) setMe({ ...me, ai_avatar_url: d.ai_avatar_url });
      else setUploadError(d?.error || 'Échec upload');
    } catch { setUploadError('Erreur réseau'); } finally { setUploading(false); }
  }
  async function saveName() { if (!me) return; const c = nameInput.trim(); if (!c) return; setEditName(false); try { const r = await fetch('/api/users/me/name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: c }) }); if (r.ok) setMe({ ...me, display_name: c }); } catch { /* */ } }
  async function saveAi() { if (!me) return; const c = aiInput.trim(); if (!c) return; setEditAi(false); try { const r = await fetch('/api/users/me/ai-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_name: c }) }); if (r.ok) setMe({ ...me, ai_name: c }); } catch { /* */ } }
  async function selectGender(g: AiGender) { if (!me || genderSaving) return; setGenderSaving(true); try { const r = await fetch('/api/users/me/ai-gender', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_gender: g }) }); if (r.ok) setMe({ ...me, ai_gender: g }); } catch { /* */ } finally { setGenderSaving(false); } }
  async function onPickRoom(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file || !me) return; setRoomUploading(true);
    try { const form = new FormData(); form.append('file', file); const up = await (await fetch('/api/upload', { method: 'POST', body: form })).json(); if (up?.url) { await fetch('/api/users/me/room-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_photo: up.url, room_tagline: me.room_tagline || null }) }); setMe({ ...me, room_photo: up.url }); } } catch { /* */ } finally { setRoomUploading(false); }
  }
  async function saveTag() { if (!me) return; setEditTag(false); const v = tagInput.trim(); try { await fetch('/api/users/me/room-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_photo: me.room_photo || null, room_tagline: v }) }); setMe({ ...me, room_tagline: v }); } catch { /* */ } }
  async function onSignOut() { if (signingOut) return; setSigningOut(true); try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { /* */ } try { (window as unknown as { T2MAuth?: { clear?: () => void } }).T2MAuth?.clear?.(); } catch { /* */ } router.replace('/signin'); router.refresh(); }
  async function onDelete() { if (deleting) return; setDeleting(true); try { const r = await fetch('/api/auth/delete', { method: 'POST' }); if (r.ok) { try { (window as unknown as { T2MAuth?: { clear?: () => void } }).T2MAuth?.clear?.(); } catch { /* */ } router.replace('/signin'); router.refresh(); return; } } catch { /* */ } setDeleting(false); }

  const who = me ? (me.display_name || me.username) : '';
  const GENDERS: [AiGender, string][] = [['feminin', 'Féminin'], ['masculin', 'Masculin'], ['neutre', 'Neutre']];

  return (
    <div style={{ minHeight: '100svh', background: '#F5F6F8', color: '#2F343A', fontFamily: "'Inter',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexGrow: 1, padding: 20, paddingBottom: 90, maxWidth: 390, width: '100%', margin: '0 auto', boxSizing: 'border-box', overflowY: 'auto' }}>
        {loading || !me ? (
          <p style={{ textAlign: 'center', color: '#9DAAB7', fontSize: 13, padding: '48px 0' }}>Chargement…</p>
        ) : (
          <>
            {/* EN-TÊTE — mode Photo : bannière de couverture (room_photo) + avatar posé dessus ; sinon avatar centré. */}
            {profilPhoto ? (
              <div style={{ position: 'relative', height: 175, margin: '0 -20px 46px', backgroundColor: '#2a2340' }}>
                {/* Cover CLIPPÉ dans un calque interne (l'avatar, lui, déborde SANS être coupé). */}
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  {/* Dégradé de base TOUJOURS présent (fond propre même sans/si photo cassée). */}
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 20% 0%, #9d86ff, #7C5CFF 45%, #FF7F11 120%)' }} />
                  {/* room_photo par-dessus ; si le fichier manque (404), on la masque → le dégradé reste. */}
                  {me.room_photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={me.room_photo} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,.1) 62%)' }} />
                </div>
                <button type="button" onClick={() => fileAvatar.current?.click()} disabled={uploading} style={{ position: 'absolute', left: 16, bottom: -30, width: 84, height: 84, borderRadius: '50%', border: '3px solid #fff', padding: 0, background: 'radial-gradient(circle at 50% 35%,#FFB86B,#FF7F11)', cursor: 'pointer', overflow: 'hidden' }}>
                  {me.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={me.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : <span style={{ color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 30 }}>{who[0]?.toUpperCase()}</span>}
                </button>
                <div style={{ position: 'absolute', left: 112, bottom: 10, color: '#fff', textShadow: '0 1px 5px rgba(0,0,0,.6)' }}>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 21, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{who}<span onClick={() => setEditName(true)} style={{ fontSize: 13, opacity: .9, cursor: 'pointer' }}>✎</span></div>
                  <div style={{ fontSize: 14, opacity: .92 }}>@{me.username}</div>
                </div>
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 26, paddingTop: 'env(safe-area-inset-top)' }}>
              <button type="button" onClick={() => fileAvatar.current?.click()} disabled={uploading} style={{ width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle at 50% 35%,#FFB86B,#FF7F11)', display: 'grid', placeItems: 'center', marginBottom: 14, border: 'none', cursor: 'pointer', boxShadow: '0 0 0 4px rgba(255,127,17,.18)', position: 'relative' }}>
                {me.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={me.avatar_url} alt="" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' }} />
                  : <span style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid #fff', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 34 }}>{who[0]?.toUpperCase()}</span>}
                <span style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,.15)' }}>📷</span>
              </button>
              {editName ? (
                <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && saveName()} placeholder="Ton nom" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 26, textAlign: 'center', border: '1px solid #E7EAF0', borderRadius: 10, padding: '4px 10px', outline: 'none' }} />
              ) : (
                <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 28, margin: '0 0 4px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{who}<span onClick={() => setEditName(true)} style={{ fontSize: 15, color: '#9DAAB7', cursor: 'pointer' }}>✎</span></h1>
              )}
              <p style={{ fontSize: 15, color: '#6A7585', margin: '4px 0 0' }}>@{me.username}</p>
              {uploadError && <p style={{ color: '#E24C4C', fontSize: 12, marginTop: 8 }}>{uploadError}</p>}
              {uploading && <p style={{ color: '#9DAAB7', fontSize: 12, marginTop: 8 }}>Envoi…</p>}
            </div>
            )}

            {/* MON COMPTE */}
            <details style={card}>
              <summary style={sumStyle}>Mon Compte</summary>
              <div style={rowBase}><span style={ic()}>📧</span>Email<span style={{ flexGrow: 1, textAlign: 'right', color: '#6A7585', marginRight: 10, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.email || '—'}</span></div>
              <div style={rowBase}><span style={ic()}>📞</span>Téléphone<span style={{ flexGrow: 1, textAlign: 'right', color: '#6A7585', marginRight: 10, fontSize: 13 }}>{me.phone || '—'}</span></div>
              <LinkRow icon="🔔" label="Notifications" sub="Messages, ventes, activité" onGo={() => router.push('/notifications')} />
              {/* « Cards enregistrées » déménagé dans le hub Card (/drafts, onglet Enregistrées). Pascal 2026-08-05. */}
              <LinkRow icon="💻" label="Appareils connectés" sub="Voir / déconnecter les sessions web" onGo={() => router.push('/appareils')} last />
            </details>

            {/* MES ACHATS (remonté : tout le monde achète) */}
            <details style={card}>
              <summary style={sumStyle}>Mes achats</summary>
              {/* COMPTE ACHETEUR UNIVERSEL (Pascal 2026-08-06) — transversal à TOUS les modules
                  (boutique, plat/eat, annonce, service, location) : le Shop n'est qu'une porte d'achat. */}
              <LinkRow icon="🛒" label="Mon panier" sub="Tes paniers en cours (reprendre une commande)" onGo={() => router.push('/shop/panier')} />
              <LinkRow icon="📦" label="Mes commandes" sub="Tous tes achats protégés — boutique, plat, annonce…" onGo={() => router.push('/shop/historique')} />
              <LinkRow icon="🚚" label="Mes livraisons" sub="Suis tes livraisons en temps réel" onGo={() => router.push('/livraison')} />
              {/* « Messages vendeurs » (chat vendeur libre) SUPPRIMÉ — Étape 3a (Pascal 2026-08-06). Modèle SHEIN :
                  pas de chat vendeur libre. Le seul chemin acheteur↔vendeur = un LITIGE, arbitré par le chef de secteur.
                  Recours = bouton « Signaler un problème » sur la commande. Voir [[project_talk2me_litige_chef_de_zone]]. */}
              <LinkRow icon="📍" label="Mes adresses" onGo={() => router.push('/shop/adresse')} last />
            </details>

            {/* GAGNER (gains + contributeur) */}
            <details style={card}>
              <summary style={sumStyle}>Gagner</summary>
              <LinkRow icon="📒" label="Mon relevé" sub="Ventes, commissions, transactions" onGo={() => router.push('/wallet')} />
              <LinkRow icon="💸" label="Monétisation" sub="Tes gains : boutique, affiliation, parrainage" onGo={() => router.push('/monetisation')} />
              <LinkRow icon="🤝" label="Mon parcours" sub="Mes niveaux · parrainer un inscrit" onGo={() => router.push('/parcours')} last={!isContrib && !isValidateur} />
              {isContrib && <LinkRow icon="🎓" label="Ma formation" sub="Ta formation de contributeur + le simulateur de gains" onGo={() => router.push('/formation')} last={!isValidateur} />}
              {isValidateur && <LinkRow icon="🛡️" label="Former mes recrutés" sub="Ouvrir / certifier l'accès formation (validateur)" onGo={() => router.push('/formation/sessions')} last />}
            </details>

            {/* TRANSPORT & LIVRAISON */}
            <details style={card}>
              <summary style={sumStyle}>Envoyer &amp; transporter</summary>
              {/* « Livraison » (suivi acheteur) déplacé dans « Mes achats » → compte universel. Pascal 2026-08-06. */}
              <LinkRow icon="📦" label="Envoyer un colis" sub="Confie un colis à une agence près de toi" onGo={() => router.push('/envoyer-colis')} />
              <LinkRow icon="🏬" label="Mon agence" sub="Point de dépôt/retrait, flotte, chauffeurs, colis" onGo={() => router.push('/mon-agence')} />
              <LinkRow icon="🛺" label="Devenir transporteur" onGo={() => router.push('/devenir-transporteur')} last />
            </details>

            {/* MON IA LÉA */}
            <details style={card}>
              <summary style={sumStyle}>Mon IA{me.ai_name ? ` « ${me.ai_name} »` : ''}</summary>
              <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 14px', gap: 14 }}>
                <button type="button" onClick={() => fileAi.current?.click()} style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid #7C5CFF', padding: 0, background: 'radial-gradient(circle at 50% 35%,#9d86ff,#5E80FE)', position: 'relative', cursor: 'pointer' }}>
                  {me.ai_avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={me.ai_avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : <span style={{ color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700 }}>{(me.ai_name || 'IA')[0]?.toUpperCase()}</span>}
                  <span style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, boxShadow: '0 2px 6px rgba(0,0,0,.15)' }}>📷</span>
                </button>
                {editAi ? (
                  <input autoFocus value={aiInput} onChange={(e) => setAiInput(e.target.value)} onBlur={saveAi} onKeyDown={(e) => e.key === 'Enter' && saveAi()} placeholder="Nom de mon IA" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 18, color: '#7C5CFF', border: '1px solid #E7EAF0', borderRadius: 8, padding: '4px 8px', outline: 'none' }} />
                ) : (
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 18, color: '#7C5CFF', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{me.ai_name || 'Mon IA'}<span onClick={() => setEditAi(true)} style={{ fontSize: 13, color: '#9DAAB7', cursor: 'pointer' }}>✎</span></span>
                )}
              </div>
              <div style={{ ...rowBase, cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ marginRight: 6 }}>Genre de {me.ai_name || 'mon IA'}</span>
                {GENDERS.map(([g, label]) => (
                  <button key={g} type="button" onClick={() => selectGender(g)} disabled={genderSaving} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', ...(me.ai_gender === g ? { background: '#7C5CFF', color: '#fff', border: 'none' } : { background: '#fff', color: '#6A7585', border: '1px solid #E7EAF0' }) }}>{label}</button>
                ))}
              </div>
              <LinkRow icon="✨" label="Sa mémoire & mes habitudes" onGo={() => router.push('/profile/habits')} last />
            </details>

            {/* MA SALLE 3D — au labo (dev-only), pas prête pour le Profil public */}
            <DevOnly>
            <details style={card}>
              <summary style={sumStyle}>Ma Salle 3D</summary>
              <div style={{ padding: '0 20px 14px' }}>
                <button type="button" onClick={() => fileRoom.current?.click()} disabled={roomUploading} style={{ width: '100%', aspectRatio: '16/9', borderRadius: 14, border: '1px solid #E7EAF0', background: me.room_photo ? `#eef1f5 center/cover url(${me.room_photo})` : 'radial-gradient(60% 60% at 50% 40%,#2a2340,#12101c)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#fff', fontSize: 13 }}>
                  {roomUploading ? 'Envoi…' : (!me.room_photo && '📷 Ajouter une photo de ta salle')}
                </button>
                {editTag ? (
                  <input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} onBlur={saveTag} onKeyDown={(e) => e.key === 'Enter' && saveTag()} placeholder="Visite ma salle ✨" style={{ width: '100%', marginTop: 10, border: '1px solid #E7EAF0', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                ) : (
                  <div onClick={() => setEditTag(true)} style={{ marginTop: 10, fontSize: 14, color: '#2F343A', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>{me.room_tagline || 'Visite ma salle ✨'}<span style={{ fontSize: 13, color: '#9DAAB7' }}>✎</span></div>
                )}
              </div>
            </details>
            </DevOnly>

            {/* PRÉFÉRENCES */}
            <details style={card}>
              <summary style={sumStyle}>Préférences</summary>
              {/* Affichage Carte / Photo — pour TOUT LE MONDE, chacun son choix. */}
              <div style={{ ...rowBase, cursor: 'default', gap: 8 }}>
                <span style={ic()}>🖼️</span>
                <span style={{ flexGrow: 1 }}>Affichage</span>
                <button type="button" onClick={() => applyDisplay('cards')} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', ...(display === 'cards' ? { background: '#FF7F11', color: '#fff', border: 'none' } : { background: '#fff', color: '#6A7585', border: '1px solid #E7EAF0' }) }}>🃏 Carte</button>
                <button type="button" onClick={() => applyDisplay('photo')} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', ...(display === 'photo' ? { background: '#FF7F11', color: '#fff', border: 'none' } : { background: '#fff', color: '#6A7585', border: '1px solid #E7EAF0' }) }}>📸 Photo</button>
              </div>
              <LinkRow icon="📄" label="À propos & mentions légales" onGo={() => router.push('/legal')} last />
            </details>

            {/* ESPACE ADMIN (gaté) */}
            {me.is_admin_capable && (
              <details style={card}>
                <summary style={sumStyle}>Espace Admin</summary>
                <div style={{ padding: '0 20px 6px' }}><DevModeToggle /></div>
                <ComputePoolPanel />
                <LinkRow icon="🗑️" label="Corbeille (modération)" badge={trashCount || undefined} onGo={() => router.push('/trash')} />
                {me.is_admin && <LinkRow icon="🛡️" label="Nommer des validateurs" sub="Ouvrir le rôle neutre (gouvernance, staff-only)" onGo={() => router.push('/admin/validateurs')} />}
                <DevOnly><LinkRow icon="🧭" label="Boussole" onGo={() => router.push('/schema')} /></DevOnly>
                <div style={{ padding: '6px 20px 0' }}><AdminSection /></div>
              </details>
            )}

            {/* ZONE SENSIBLE */}
            <div style={card}>
              <button style={rowBase} onClick={onSignOut} disabled={signingOut}><span style={ic()}>➡️</span><span style={{ flexGrow: 1 }}>{signingOut ? 'Déconnexion…' : 'Se déconnecter'}</span>{chev}</button>
              <button style={{ ...rowBase, borderBottom: 'none' }} onClick={() => setShowDelete(true)}><span style={ic('#E24C4C')}>🗑️</span><span style={{ flexGrow: 1, color: '#E24C4C' }}>Supprimer mon compte</span>{chev}</button>
            </div>
            <a href="/suppression-compte" target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', fontSize: 12, color: '#9DAAB7', marginTop: 10, textDecoration: 'none' }}>
              Comment mes données sont supprimées
            </a>
          </>
        )}
      </div>

      <input ref={fileAvatar} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e, 'avatar')} className="hidden" aria-hidden="true" />
      <input ref={fileAi} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e, 'ai')} className="hidden" aria-hidden="true" />
      <input ref={fileRoom} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickRoom} className="hidden" aria-hidden="true" />

      {crop && <AvatarCropper file={crop.file} onCancel={() => setCrop(null)} onCropped={uploadCropped} />}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(20,20,26,.5)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => !deleting && setShowDelete(false)}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 340, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>Supprimer ton compte ?</h3>
            <p style={{ fontSize: 14, color: '#6A7585', margin: '0 0 16px', lineHeight: 1.5 }}>Action définitive : ton compte et tes données sont supprimés.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDelete(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #E7EAF0', background: '#fff', fontWeight: 600, fontSize: 14 }}>Annuler</button>
              <button onClick={onDelete} disabled={deleting} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#E24C4C', color: '#fff', fontWeight: 600, fontSize: 14 }}>{deleting ? 'Suppression…' : 'Supprimer'}</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
