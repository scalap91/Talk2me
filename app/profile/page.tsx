'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Camera, Loader2, Sparkles, Check, X, Pencil, Bookmark, Trash2 } from 'lucide-react';
import Talk2MeContactCard from '@/components/contact/Talk2MeContactCard';
import { InstallAppButton } from '@/components/pwa/InstallAppButton';
import BottomNav from '@/components/chat/BottomNav';
import AdminSection from '@/components/profile/AdminSection';
import { initialsOf as avatarInitialsOf, gradientFromSeed } from '@/lib/avatar';
import DevOnly from '@/components/system/DevOnly';
import AvatarCropper from '@/components/AvatarCropper';

interface MeResponse {
  user: {
    id: string;
    email: string | null;
    talk2me_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    ai_name?: string | null;
    ai_avatar_url?: string | null;
    ai_gender?: 'feminin' | 'masculin' | 'neutre' | null;
    room_photo?: string | null;
    room_tagline?: string | null;
    friends_count?: number;
  } | null;
}

type AiGender = 'feminin' | 'masculin' | 'neutre';

const AI_GENDER_OPTIONS: Array<{ value: AiGender; label: string; symbol: string }> = [
  { value: 'feminin', label: 'Féminin', symbol: '♀' },
  { value: 'masculin', label: 'Masculin', symbol: '♂' },
  { value: 'neutre', label: 'Neutre', symbol: '•' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [trashCount, setTrashCount] = useState(0); // notif Corbeille (modération admin)
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roomFileRef = useRef<HTMLInputElement>(null);
  const [roomUploading, setRoomUploading] = useState(false);
  // Recadrage avatar (profil + IA) : on glisse/zoome avant l'upload -> 512×512 bien cadré.
  const [crop, setCrop] = useState<{ file: File; kind: 'avatar' | 'ai' } | null>(null);

  async function onPickRoomPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !me) return;
    if (file.size > 8 * 1024 * 1024) return;
    setRoomUploading(true);
    try {
      const form = new FormData(); form.append('file', file);
      const up = await (await fetch('/api/upload', { method: 'POST', body: form })).json();
      if (up?.url) {
        await fetch('/api/users/me/room-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_photo: up.url }) });
        setMe({ ...me, room_photo: up.url });
      }
    } catch { /* */ } finally { setRoomUploading(false); }
  }
  async function saveRoomTagline(v: string) {
    if (!me) return;
    setMe({ ...me, room_tagline: v });
    try { await fetch('/api/users/me/room-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_photo: me.room_photo || null, room_tagline: v }) }); } catch { /* */ }
  }
  // Compteur Corbeille (modération admin) → badge "notif" sur le lien Corbeille.
  useEffect(() => {
    fetch('/api/cards/trash?scope=admin', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.count === 'number') setTrashCount(d.count); })
      .catch(() => {});
  }, []);
  // Talk2Me #324 v2 — Section "Mon IA"
  const [editingAiName, setEditingAiName] = useState(false);
  const [aiNameInput, setAiNameInput] = useState('');
  const [aiNameSaving, setAiNameSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [aiNameError, setAiNameError] = useState<string | null>(null);
  const [aiAvatarUploading, setAiAvatarUploading] = useState(false);
  const [aiAvatarError, setAiAvatarError] = useState<string | null>(null);
  const aiAvatarInputRef = useRef<HTMLInputElement>(null);
  // Talk2Me #325 — Genre de l'IA
  const [aiGenderSaving, setAiGenderSaving] = useState<AiGender | null>(null);
  const [aiGenderError, setAiGenderError] = useState<string | null>(null);
  const [aiGenderToast, setAiGenderToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) {
          router.replace('/signin');
          return;
        }
        const data = (await res.json()) as MeResponse;
        setMe(data.user);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset pour pouvoir re-uploader la même image
    if (!file || !me) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Photo trop lourde (max 5 Mo)');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Format non supporté (JPG, PNG, WEBP)');
      return;
    }
    setUploadError(null);
    setCrop({ file, kind: 'avatar' }); // ouvre le recadreur ; l'upload se fait après "Valider"
  }

  /** Upload de la photo recadrée (512×512 webp) vers le bon endpoint selon le type. */
  async function uploadCropped(blob: Blob) {
    if (!me || !crop) return;
    const kind = crop.kind;
    setCrop(null);
    const cropped = new File([blob], 'avatar.webp', { type: 'image/webp' });
    const form = new FormData();
    form.append('file', cropped);
    if (kind === 'avatar') {
      setUploadError(null);
      setUploading(true);
      try {
        const res = await fetch('/api/users/me/avatar', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok && data?.avatar_url) setMe({ ...me, avatar_url: data.avatar_url });
        else setUploadError(data?.error || 'Échec de l\'upload');
      } catch {
        setUploadError('Erreur réseau');
      } finally {
        setUploading(false);
      }
    } else {
      setAiAvatarError(null);
      setAiAvatarUploading(true);
      try {
        const res = await fetch('/api/users/me/ai-avatar', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok && data?.ai_avatar_url) setMe({ ...me, ai_avatar_url: data.ai_avatar_url });
        else setAiAvatarError(data?.error || 'Échec upload');
      } catch {
        setAiAvatarError('Erreur réseau');
      } finally {
        setAiAvatarUploading(false);
      }
    }
  }

  /**
   * Talk2Me #324 v2 — Save nouveau nom IA.
   * Doctrine [[talk2me-ia-personnelle-integree]] : l'IA est consciente du
   * nouveau nom dès le prochain message (system prompt dynamique).
   */
  async function saveName() {
    if (!me) return;
    const clean = nameInput.trim();
    if (!clean) return;
    setNameSaving(true);
    try {
      const res = await fetch('/api/users/me/name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: clean }),
      });
      const data = await res.json();
      if (res.ok && data?.display_name) {
        setMe({ ...me, display_name: data.display_name });
        setEditingName(false);
      }
    } catch { /* */ } finally {
      setNameSaving(false);
    }
  }

  async function saveAiName() {
    if (!me) return;
    const clean = aiNameInput.trim();
    if (!clean) {
      setAiNameError('Le nom ne peut pas être vide');
      return;
    }
    setAiNameError(null);
    setAiNameSaving(true);
    try {
      const res = await fetch('/api/users/me/ai-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_name: clean }),
      });
      const data = await res.json();
      if (res.ok && data?.ai_name) {
        setMe({ ...me, ai_name: data.ai_name });
        setEditingAiName(false);
      } else {
        setAiNameError(data?.error || 'Erreur');
      }
    } catch {
      setAiNameError('Erreur réseau');
    } finally {
      setAiNameSaving(false);
    }
  }

  async function onPickAiAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !me) return;
    if (file.size > 5 * 1024 * 1024) {
      setAiAvatarError('Photo trop lourde (max 5 Mo)');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAiAvatarError('Format non supporté (JPG, PNG, WEBP)');
      return;
    }
    setAiAvatarError(null);
    setCrop({ file, kind: 'ai' }); // ouvre le recadreur ; upload après "Valider"
  }

  /**
   * Talk2Me #325 — Change le genre de l'IA personnelle (feminin/masculin/neutre).
   * L'IA est consciente du nouveau genre dès le prochain message (system prompt).
   */
  async function selectAiGender(gender: AiGender) {
    if (!me || aiGenderSaving) return;
    if (me.ai_gender === gender) return;
    setAiGenderError(null);
    setAiGenderSaving(gender);
    try {
      const res = await fetch('/api/users/me/ai-gender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_gender: gender }),
      });
      const data = await res.json();
      if (res.ok && data?.ai_gender) {
        setMe({ ...me, ai_gender: data.ai_gender });
        setAiGenderToast('Genre mis à jour');
        setTimeout(() => setAiGenderToast(null), 1800);
      } else {
        setAiGenderError(data?.error || 'Erreur');
      }
    } catch {
      setAiGenderError('Erreur réseau');
    } finally {
      setAiGenderSaving(null);
    }
  }

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.replace('/signin');
    router.refresh();
  }

  return (
    <main className="min-h-[100svh] w-full flex flex-col bg-[#0e0e12]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
        <Link
          href="/"
          className="text-white/55 hover:text-white/90 transition-colors inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft size={18} />
          Retour
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-white/95">
          Profil
        </h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-5">
          {loading ? (
            <div className="text-center text-white/55 text-[13px] py-12">Chargement…</div>
          ) : me ? (
            <>
              {/* Avatar uploader : photo cercle 96px avec overlay caméra */}
              <div className="flex flex-col items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="relative group rounded-full focus:outline-none focus:ring-2 focus:ring-red-400/40"
                  aria-label="Modifier la photo de profil"
                >
                  {me.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={me.avatar_url}
                      alt={me.display_name || me.username}
                      className="w-24 h-24 rounded-full object-cover border border-white/10"
                    />
                  ) : (
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center text-white text-[28px] font-medium border border-white/10"
                      style={{ background: gradientFromSeed(me.id) }}
                      aria-hidden="true"
                    >
                      {avatarInitialsOf({ display_name: me.display_name, username: me.username }, '?')}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-center justify-center">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-[12px] text-red-300/85 hover:text-red-200 transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Envoi…' : me.avatar_url ? 'Modifier la photo' : 'Ajouter une photo'}
                </button>
                {uploadError && (
                  <p className="text-[12px] text-red-400/90">{uploadError}</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  onChange={onPickAvatar}
                  className="hidden"
                  aria-hidden="true"
                />
              </div>

              <Talk2MeContactCard
                user={{
                  id: me.id,
                  talk2me_id: me.talk2me_id,
                  username: me.username,
                  display_name: me.display_name,
                  avatar: me.avatar_url,
                }}
                is_friend={false}
                is_self={true}
              />

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-white/45">
                    Talk2Me ID
                  </div>
                  <div className="text-[28px] font-mono font-medium text-white tracking-[0.15em]">
                    {me.talk2me_id}
                  </div>
                  <div className="text-[12px] text-white/50">
                    Partage ce numéro pour qu&apos;on t&apos;ajoute en ami.
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-white/45">
                    Amis
                  </div>
                  <div className="text-[20px] font-medium text-white/95">
                    {me.friends_count ?? 0}
                  </div>
                </div>
                <Link
                  href="/friends"
                  className="text-[12.5px] text-white/85 hover:text-white px-3 h-9 inline-flex items-center rounded-full border border-white/12 bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                >
                  Voir mes amis
                </Link>
              </div>

              {/* Monétisation — hub "comment je gagne" (Pascal 2026-06-19) */}
              <Link
                href="/monetisation"
                data-testid="profile-monetisation-link"
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-300 text-[18px]">💰</div>
                  <div>
                    <div className="text-[14px] text-white/95 font-medium">Monétisation</div>
                    <div className="text-[12px] text-white/55">Tes gains : boutique, affiliation, parrainage</div>
                  </div>
                </div>
                <span className="text-white/45">›</span>
              </Link>

              {/* Wallet (déplacé hors de la barre du bas — Phase 1.4) */}
              <Link
                href="/wallet"
                data-testid="profile-wallet-link"
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-400/25 flex items-center justify-center text-red-300 text-[18px]">🪙</div>
                  <div>
                    <div className="text-[14px] text-white/95 font-medium">Mon portefeuille</div>
                    <div className="text-[12px] text-white/55">Solde, encaissements, transactions</div>
                  </div>
                </div>
                <span className="text-white/45">›</span>
              </Link>

              {/* Talk2Me #331 — Lien vers la bibliothèque de cards bookmarkées */}
              <Link
                href="/saved-cards"
                data-testid="profile-saved-cards-link"
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-400/25 flex items-center justify-center text-red-300">
                    <Bookmark size={16} />
                  </div>
                  <div>
                    <div className="text-[14px] text-white/95 font-medium">
                      Mes cards sauvegardées
                    </div>
                    <div className="text-[12px] text-white/55">
                      Retrouve les cards que tu as enregistrées
                    </div>
                  </div>
                </div>
                <span className="text-white/45">›</span>
              </Link>

              {/* Talk2Me Lot A — Lien vers la corbeille (cards soft-deleted 30j) */}
              <Link
                href="/trash"
                data-testid="profile-trash-link"
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/12 border border-red-400/25 flex items-center justify-center text-red-300">
                    <Trash2 size={16} />
                  </div>
                  <div>
                    <div className="text-[14px] text-white/95 font-medium">
                      Corbeille{trashCount > 0 ? ` (${trashCount})` : ''}
                    </div>
                    <div className="text-[12px] text-white/55">
                      Supprimées — restaurer ou effacer définitivement (30 j)
                    </div>
                  </div>
                </div>
                <span className="text-white/45">›</span>
              </Link>

              {/* Talk2Me #324 v2 — Section "Mon IA" : nom + avatar customisables */}
              <div
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-4"
                data-testid="profile-ai-section"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-red-300/85" />
                  <div className="text-[11px] uppercase tracking-wider text-white/45">
                    Mon IA personnelle
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Avatar IA (photo de ton IA) — éditable */}
                  <button
                    type="button"
                    onClick={() => aiAvatarInputRef.current?.click()}
                    disabled={aiAvatarUploading}
                    className="relative group rounded-full focus:outline-none focus:ring-2 focus:ring-red-400/40 shrink-0"
                    aria-label="Modifier la photo de l'IA"
                  >
                    {me.ai_avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={me.ai_avatar_url}
                        alt={me.ai_name || 'Mon IA'}
                        className="w-16 h-16 rounded-full object-cover border border-white/10"
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-white text-[22px] font-medium border border-white/10"
                        style={{
                          background:
                            'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
                        }}
                        aria-hidden="true"
                      >
                        T
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-center justify-center">
                      {aiAvatarUploading ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </button>
                  <div className="flex-1 min-w-0">
                    {!editingAiName ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[15px] font-medium text-white/95 truncate"
                            data-testid="profile-ai-name"
                          >
                            {me.ai_name || `T2M de ${me.display_name || me.username}`}
                          </div>
                          <div className="text-[11.5px] text-white/45 mt-0.5">
                            Tape <span className="text-red-300">@{me.ai_name || `T2M de ${me.display_name || me.username}`}</span> dans une conv pour l&apos;invoquer
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAiNameInput(
                              me.ai_name || `T2M de ${me.display_name || me.username}`
                            );
                            setAiNameError(null);
                            setEditingAiName(true);
                          }}
                          className="p-1.5 text-red-300/85 hover:text-red-200 transition-colors shrink-0"
                          aria-label="Modifier le nom de l'IA"
                          data-testid="profile-ai-name-edit"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={aiNameInput}
                          onChange={(e) => setAiNameInput(e.target.value)}
                          maxLength={40}
                          autoFocus
                          placeholder="Nom de mon IA"
                          data-testid="profile-ai-name-input"
                          className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/12 text-[14px] text-white/95 placeholder-white/35 outline-none focus:border-red-400/60"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={saveAiName}
                            disabled={aiNameSaving}
                            data-testid="profile-ai-name-save"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[12.5px] font-medium transition-colors disabled:opacity-50"
                          >
                            <Check size={13} />
                            {aiNameSaving ? '…' : 'Enregistrer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAiName(false);
                              setAiNameError(null);
                            }}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-white/12 text-white/75 hover:text-white text-[12.5px] transition-colors"
                          >
                            <X size={13} />
                            Annuler
                          </button>
                        </div>
                        {aiNameError && (
                          <p className="text-[12px] text-red-400/90">{aiNameError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {aiAvatarError && (
                  <p className="text-[12px] text-red-400/90">{aiAvatarError}</p>
                )}
                <input
                  ref={aiAvatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onPickAiAvatar}
                  className="hidden"
                  aria-hidden="true"
                />

                {/* Talk2Me #325 — Sélecteur genre IA (3 pills) */}
                <div
                  className="pt-3 border-t border-white/8 space-y-2"
                  data-testid="profile-ai-gender-section"
                >
                  <div className="text-[11px] uppercase tracking-wider text-white/45">
                    Genre
                  </div>
                  <div className="flex gap-2" role="radiogroup" aria-label="Genre de l'IA">
                    {AI_GENDER_OPTIONS.map((opt) => {
                      const current = (me.ai_gender || 'neutre') as AiGender;
                      const isActive = current === opt.value;
                      const isSaving = aiGenderSaving === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => selectAiGender(opt.value)}
                          disabled={!!aiGenderSaving}
                          data-testid={`profile-ai-gender-${opt.value}`}
                          data-active={isActive ? 'true' : 'false'}
                          className={
                            'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-[12.5px] font-medium transition-colors disabled:opacity-50 ' +
                            (isActive
                              ? 'bg-red-500/15 border border-red-400/30 text-white'
                              : 'bg-white/[0.04] border border-white/10 text-white/75 hover:bg-white/[0.08] hover:text-white')
                          }
                        >
                          <span aria-hidden="true" className="text-[13px] opacity-80">
                            {opt.symbol}
                          </span>
                          <span>{isSaving ? '…' : opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {aiGenderError && (
                    <p className="text-[12px] text-red-400/90">{aiGenderError}</p>
                  )}
                  {aiGenderToast && (
                    <p
                      className="text-[12px] text-red-200/90"
                      data-testid="profile-ai-gender-toast"
                    >
                      {aiGenderToast}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
                <div className="text-white/90 text-[14px] font-semibold">🚪 Ma salle 3D</div>
                <div className="text-white/55 text-[12px]">La photo affichée sur ta carte d&apos;invitation dans le feed (porte vers ta salle).</div>
                <button type="button" onClick={() => roomFileRef.current?.click()} disabled={roomUploading} className="relative block w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/30">
                  {me.room_photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={me.room_photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <span className="absolute inset-0 grid place-items-center text-white/50 text-[13px]">+ Ajouter une photo de salle</span>}
                  {roomUploading && <span className="absolute inset-0 grid place-items-center bg-black/50 text-white text-[13px]">Envoi…</span>}
                </button>
                <input ref={roomFileRef} type="file" accept="image/*" className="hidden" onChange={onPickRoomPhoto} />
                <input defaultValue={me.room_tagline || ''} placeholder="Visite ma salle ✨" onBlur={(e) => saveRoomTagline(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-[13px] outline-none placeholder:text-white/35" />
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
                {!editingName ? (
                  <div className="flex justify-between items-center gap-3 text-[13px]">
                    <span className="text-white/55 shrink-0">Nom affiché</span>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-white/95 font-medium truncate">{me.display_name || '—'}</span>
                      <button type="button" onClick={() => { setNameInput(me.display_name || ''); setEditingName(true); }} aria-label="Renommer" className="p-1 text-red-300/85 hover:text-red-200 shrink-0"><Pencil size={13} /></button>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-white/55 text-[13px]">Nom affiché</span>
                    <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={40} autoFocus placeholder="Ton nom" className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/12 text-[14px] text-white/95 placeholder-white/35 outline-none focus:border-red-400/60" />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={saveName} disabled={nameSaving} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[12.5px] font-medium disabled:opacity-50"><Check size={13} />{nameSaving ? '…' : 'Enregistrer'}</button>
                      <button type="button" onClick={() => setEditingName(false)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-white/12 text-white/75 text-[12.5px]"><X size={13} />Annuler</button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-[13px]">
                  <span className="text-white/55 shrink-0">Username</span>
                  <span className="text-white/95 font-mono truncate">
                    @{me.username}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-[13px]">
                  <span className="text-white/55 shrink-0">Email</span>
                  <span className="text-white/95 truncate">
                    {me.email || '—'}
                  </span>
                </div>
              </div>

              {/* Talk2Me #332 — Section "Installation app" : bouton custom
                  qui capture beforeinstallprompt (Chrome) ou ouvre la modale
                  d'instructions iOS Safari. Caché si déjà installé. */}
              <div
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-3"
                data-testid="profile-install-section"
              >
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-white/45">
                    Installation app
                  </div>
                  <div className="text-[12.5px] text-white/65 leading-relaxed">
                    Garde Talk2Me à portée de pouce, plein écran, comme une app native.
                  </div>
                </div>
                <InstallAppButton variant="inline" />
              </div>

              <AdminSection />

              <Link
                href="/legal"
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-white/10 bg-white/[0.04] text-white/70 text-[13px] font-medium hover:bg-white/[0.08] transition-colors"
              >
                À propos &amp; mentions légales
              </Link>

              <button
                type="button"
                onClick={onSignOut}
                disabled={signingOut}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-white/10 bg-white/[0.04] text-white/90 text-[14px] font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-50"
              >
                <LogOut size={16} />
                {signingOut ? 'Déconnexion…' : 'Déconnexion'}
              </button>

              {/* Talk2Me #312 — Lien Boussole technique (doctrine
                  [[airbizness-schema-technique]]). DEV ONLY : outil interne, jamais sur beta. */}
              <DevOnly>
                <div className="text-center pt-3">
                  <Link
                    href="/schema"
                    data-testid="profile-link-schema"
                    className="text-[12px] text-white/45 hover:text-white/75 transition-colors"
                  >
                    Boussole technique
                  </Link>
                </div>
              </DevOnly>
            </>
          ) : (
            <div className="text-center text-white/55 text-[13px] py-12">
              Session expirée.
            </div>
          )}
        </div>
      </div>
      <BottomNav />
      {crop && (
        <AvatarCropper
          file={crop.file}
          onCancel={() => setCrop(null)}
          onCropped={uploadCropped}
        />
      )}
    </main>
  );
}
