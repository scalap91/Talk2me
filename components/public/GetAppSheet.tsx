'use client';

/**
 * Talk2Me — GetAppSheet (module « REJOINDRE / Récupérer l'app », Pascal 2026-07-08).
 * Modale ouverte depuis les pages PUBLIQUES : un visiteur Google veut rejoindre /
 * enrichir → il chope l'app (QR, badges stores, SMS opt-in, copier le lien).
 *
 * Thème CLAIR (tokens --t2m-*). Pas de dépendance externe. L'app n'étant pas
 * encore sur les stores, PAS d'APK : les liens stores restent « Bientôt » jusqu'à
 * ce qu'on ait les vrais liens (env vars) ; QR/copier/SMS pointent sur la version WEB.
 */
import { useEffect, useState } from 'react';

const APP_LINK = process.env.NEXT_PUBLIC_APP_LINK || 'https://talk2me.fr';
const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || '';
const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || '';

interface Props {
  open: boolean;
  onClose: () => void;
  context: 'join' | 'enrich';
}

export default function GetAppSheet({ open, onClose, context }: Props) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Fermeture au clavier (Échap) + verrou du scroll de fond.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  const title = context === 'enrich' ? 'Rejoins pour enrichir' : 'Rejoins Talk2Me';
  const subtitle =
    context === 'enrich'
      ? 'Prends l’app pour ajouter ce que tu sais et rester crédité.'
      : 'Le web qui comprend ta conversation — installe l’app en 10 secondes.';

  async function onSendSms() {
    const p = phone.trim();
    if (!p || sending) return;
    if (!/^\+[1-9]\d{7,14}$/.test(p)) {
      showToast('Numéro invalide — format +261…');
      return;
    }
    setSending(true);
    try {
      const r = await fetch('/api/public/app-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        showToast('Lien envoyé par SMS 📲');
        setPhone('');
      } else if (j?.reason === 'sms_indisponible') {
        showToast('SMS indispo pour l’instant, utilise le QR ou les stores');
      } else if (j?.reason === 'trop_de_demandes') {
        showToast('Doucement — réessaie dans une minute');
      } else if (j?.reason === 'phone_invalide') {
        showToast('Numéro invalide — format +261…');
      } else {
        showToast('Envoi impossible — utilise le QR ou les stores');
      }
    } catch {
      showToast('Envoi impossible — utilise le QR ou les stores');
    } finally {
      setSending(false);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(APP_LINK);
      showToast('Lien copié ✅');
    } catch {
      showToast('Copie impossible — sélectionne le lien manuellement');
    }
  }

  const qrSrc = `/api/public/qr?url=${encodeURIComponent(APP_LINK)}`;

  // Badge store réutilisable.
  function StoreBadge({
    href,
    top,
    label,
    disabled,
  }: {
    href?: string;
    top: string;
    label: string;
    disabled?: boolean;
  }) {
    const inner = (
      <>
        <span style={{ fontSize: 11, color: 'var(--t2m-ink-3)', fontWeight: 600 }}>{top}</span>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--t2m-ink)' }}>{label}</span>
      </>
    );
    const style: React.CSSProperties = {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      padding: '9px 14px',
      borderRadius: 12,
      border: '1px solid var(--t2m-line)',
      background: 'var(--t2m-paper)',
      textDecoration: 'none',
      textAlign: 'left',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    };
    if (disabled || !href) {
      return (
        <div aria-disabled style={style}>
          {inner}
        </div>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {inner}
      </a>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          maxHeight: '92svh',
          overflowY: 'auto',
          background: 'var(--t2m-paper)',
          color: 'var(--t2m-ink)',
          borderRadius: 22,
          border: '1px solid var(--t2m-line)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
          padding: '22px 22px 24px',
          position: 'relative',
        }}
      >
        {/* Fermer */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--t2m-wash)',
            color: 'var(--t2m-ink-2)',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>

        <h2
          style={{
            fontFamily: "'Outfit',sans-serif",
            fontSize: 21,
            fontWeight: 800,
            margin: '2px 0 4px',
            color: 'var(--t2m-ink)',
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--t2m-ink-3)', margin: '0 0 16px', lineHeight: 1.5 }}>{subtitle}</p>

        {/* QR code */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ padding: 10, background: '#fff', borderRadius: 16, border: '1px solid var(--t2m-line)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} width={180} height={180} alt="QR Talk2Me" style={{ display: 'block' }} />
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--t2m-ink-3)', fontWeight: 600 }}>Scanne avec ton téléphone</span>
        </div>

        {/* Badges stores — PAS d'APK : « Bientôt » tant qu'on n'a pas les vrais liens stores. */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {PLAY_STORE_URL ? (
            <StoreBadge top="Disponible sur" label="Google Play" href={PLAY_STORE_URL} />
          ) : (
            <StoreBadge top="Google Play" label="Bientôt" disabled />
          )}
          {APP_STORE_URL ? (
            <StoreBadge top="Télécharger dans" label="App Store" href={APP_STORE_URL} />
          ) : (
            <StoreBadge top="App Store" label="Bientôt" disabled />
          )}
        </div>

        {/* SMS opt-in */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <label style={{ fontSize: 12.5, color: 'var(--t2m-ink-2)', fontWeight: 700 }}>Recevoir le lien par SMS</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+261 34 12 345 67"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '11px 14px',
                borderRadius: 12,
                border: '1px solid var(--t2m-line)',
                background: 'var(--t2m-paper)',
                color: 'var(--t2m-ink)',
                fontSize: 15,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={onSendSms}
              disabled={!phone.trim() || sending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 46,
                padding: '11px 16px',
                borderRadius: 12,
                border: 'none',
                background: 'var(--t2m-primary)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 14,
                cursor: !phone.trim() || sending ? 'default' : 'pointer',
                opacity: !phone.trim() || sending ? 0.55 : 1,
              }}
            >
              {sending ? (
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.5)',
                    borderTopColor: '#fff',
                    display: 'inline-block',
                    animation: 'gas-spin 0.7s linear infinite',
                  }}
                />
              ) : (
                'Envoyer'
              )}
            </button>
          </div>
        </div>

        {/* Copier le lien (fallback gratuit) */}
        <button
          type="button"
          onClick={onCopy}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid var(--t2m-line)',
            background: 'var(--t2m-wash)',
            color: 'var(--t2m-ink)',
            fontWeight: 700,
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          Copier le lien
        </button>

        <style>{`@keyframes gas-spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {toast && (
        <div
          role="status"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: 'var(--t2m-ink)',
            color: '#fff',
            padding: '11px 18px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            zIndex: 110,
            maxWidth: 'calc(100% - 36px)',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
