'use client';

/**
 * CardLongPressMenu — Bottom-sheet contextuel sur appui long d'une card.
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Doctrine [[talk2me-card-vivante]] +
 * master prompt point 14 ("Appui long sur la Card → Modifier → Archiver →
 * Supprimer").
 *
 * Composé de 2 hooks/composants :
 *   - useLongPress({ onLongPress })  — handlers à attacher sur la card
 *   - <CardLongPressMenu /> — bottom-sheet déclenché par les handlers
 *
 * Actions disponibles (selon ownership ET contexte) :
 *   - Modifier      (owner, context='drafts' uniquement)
 *   - Archiver      (owner, context='drafts' uniquement)
 *   - Supprimer     (owner, context='drafts' uniquement) → ouvre DeleteCardConfirm
 *   - Enregistrer   (non-owner, direct_card uniquement MVP)
 *   - Partager      (toujours)
 *   - Signaler      (placeholder désactivé)
 *
 * Contextes (#354 Pascal 2026-06-04) :
 *   - 'home'    : feed public — actions de gestion (modif/archive/supprime)
 *                 sont MASQUÉES (la gestion vit dans /drafts). Sur sa propre
 *                 card → Partage + Signaler. Sur card d'un autre →
 *                 Enregistrer + Partage + Signaler.
 *   - 'drafts'  : Mes cards — owner uniquement, toutes les actions.
 *   - 'profile' : lecture pure — Partage + Signaler (+ Enregistrer si pas owner).
 *
 * Hook useLongPress (#354) :
 *   - Délai 700ms (avant 480ms) — résiste à un tap maladroit pendant le scroll.
 *   - Cancel si mouvement > 8px depuis touchstart (le scroll déclenche le move).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  Braces,
  Edit3,
  Flag,
  Share2,
  Trash2,
  X,
} from '@/lib/icons';
import DeleteCardConfirm from './DeleteCardConfirm';
import ReportSheet from '@/components/moderation/ReportSheet';
import CardInspector from './CardInspector';
import { isDevMode, onDevModeChange } from '@/lib/client/dev-mode';

export type CardKindCrud = 'direct_card' | 'post';

/**
 * Contexte d'affichage du menu — détermine quelles actions sont proposées.
 * Voir tableau dans la docstring du fichier.
 */
export type LongPressMenuContext = 'home' | 'drafts' | 'profile';

interface MenuPayload {
  cardKind: CardKindCrud;
  cardId: string;
  isOwner: boolean;
  /** type du contenu, pour personnaliser le bouton "Modifier" (only direct_card editable MVP). */
  cardType?: 'image' | 'video' | 'texte' | 'conv_clip';
  shareUrl?: string;
}

interface CardLongPressMenuProps {
  open: boolean;
  payload: MenuPayload | null;
  onClose: () => void;
  /** Card OS : la card déjà résolue par le lecteur → l'Inspecteur rend sans fetch. */
  card?: import('@/lib/cards/supercard').SuperCard;
  /** Notif au parent (refetch feed/list, etc.). */
  onMutated?: (kind: 'deleted' | 'archived' | 'unarchived' | 'saved' | 'shared') => void;
  /**
   * Contexte d'affichage (#354). Défaut 'home' — le plus restrictif pour
   * éviter qu'une corbeille apparaisse par accident dans le feed public.
   */
  context?: LongPressMenuContext;
}

const LONG_PRESS_DURATION_MS = 700;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

/**
 * Hook : ajoute des handlers pointer/mouse/touch pour détecter un appui long.
 * Annule si l'utilisateur déplace le doigt de >8px ou relâche avant 700ms.
 *
 * Retourne {bind} → à étaler sur la card : `<div {...bind} />`.
 */
export function useLongPress(onLongPress: (e: PointerEvent | MouseEvent | TouchEvent) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  const start = useCallback(
    (e: React.PointerEvent | React.TouchEvent) => {
      // Anti-orphelin : pointer + touch déclenchent tous deux `start` pour un même toucher.
      // Sans nettoyer, le 1er timer devient orphelin et se déclenche « tout seul ». On repart propre.
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const pt = 'touches' in e ? e.touches[0] : (e as React.PointerEvent);
      const x = (pt && 'clientX' in pt && typeof pt.clientX === 'number') ? pt.clientX : 0;
      const y = (pt && 'clientY' in pt && typeof pt.clientY === 'number') ? pt.clientY : 0;
      startPos.current = { x, y };
      fired.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        // navigator.vibrate facultatif si dispo
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            (navigator as Navigator & { vibrate: (p: number) => void }).vibrate(20);
          }
        } catch {
          /* ignore */
        }
        onLongPress(e.nativeEvent as PointerEvent | TouchEvent);
      }, LONG_PRESS_DURATION_MS);
    },
    [onLongPress]
  );

  const move = useCallback(
    (e: React.PointerEvent | React.TouchEvent) => {
      if (!startPos.current) return;
      const pt = 'touches' in e ? e.touches[0] : (e as React.PointerEvent);
      const x = (pt && 'clientX' in pt && typeof pt.clientX === 'number') ? pt.clientX : 0;
      const y = (pt && 'clientY' in pt && typeof pt.clientY === 'number') ? pt.clientY : 0;
      const dx = x - startPos.current.x;
      const dy = y - startPos.current.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cleanup();
    },
    [cleanup]
  );

  const end = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // bind compatible mouse + touch + pointer
  const bind = {
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: end,
    onContextMenu: (e: React.MouseEvent) => {
      // Sur desktop, clic droit = long-press
      e.preventDefault();
      onLongPress(e.nativeEvent);
    },
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { bind, didFire: () => fired.current };
}

export default function CardLongPressMenu({
  open,
  payload,
  onClose,
  onMutated,
  context = 'home',
  card,
}: CardLongPressMenuProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<null | 'inspect' | 'edit'>(null);
  const [devMode, setDevModeState] = useState(false);
  useEffect(() => { setDevModeState(isDevMode()); return onDevModeChange(setDevModeState); }, []);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
      setBusy(null);
    }
  }, [open]);

  if (!open || !payload) return null;

  const { cardKind, cardId, isOwner, cardType } = payload;

  // === Filtrage des actions selon le contexte (#354) ===
  // Doctrine : la gestion de la bibliothèque (modif/archive/supprime) vit
  // dans /drafts. Le feed /home et les profils sont en lecture/partage seul.
  const isDraftsContext = context === 'drafts';
  // Modifier/Archiver/Supprimer : owner ET context === 'drafts'.
  const showEdit = isOwner && isDraftsContext && cardKind === 'direct_card';
  const showArchive = isOwner && isDraftsContext;
  const showDelete = isOwner && isDraftsContext;
  // Enregistrer : pour non-owner (toujours hors drafts, /drafts c'est mes cards).
  const showSave = !isOwner && cardKind === 'direct_card' && !isDraftsContext;
  // Partager : toujours.
  const showShare = true;
  // Signaler : toujours (placeholder).
  const showReport = true;

  async function doArchive() {
    if (!payload) return;
    setBusy('archive');
    try {
      const url = `/api/cards/${encodeURIComponent(payload.cardId)}/archive?kind=${payload.cardKind}`;
      const res = await fetch(url, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setToast('Archivée');
        onMutated?.('archived');
        setTimeout(() => {
          setToast(null);
          onClose();
        }, 900);
      } else {
        setToast('Échec');
      }
    } catch {
      setToast('Erreur réseau');
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 1200);
    }
  }

  async function doShare() {
    if (!payload) return;
    setBusy('share');
    const url =
      payload.shareUrl ||
      (typeof window !== 'undefined'
        ? `${window.location.origin}/home#card-${payload.cardId}`
        : '');
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav && typeof nav.share === 'function') {
        try {
          await nav.share({ url });
          setToast('Partagé');
        } catch {
          // Annulé par l'user → silencieux
        }
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        setToast('Lien copié');
      }
      onMutated?.('shared');
    } finally {
      setBusy(null);
      setTimeout(() => {
        setToast(null);
        onClose();
      }, 900);
    }
  }

  async function doSave() {
    if (!payload) return;
    setBusy('save');
    try {
      const res = await fetch('/api/cards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          card_kind:
            cardType === 'video'
              ? 'video_card'
              : cardType === 'texte'
                ? 'texte_card'
                : 'image_card',
          card_data: { id: payload.cardId, kind: payload.cardKind },
        }),
      });
      if (res.ok) {
        setToast('Enregistré');
        onMutated?.('saved');
      } else {
        setToast('Échec');
      }
    } catch {
      setToast('Erreur réseau');
    } finally {
      setBusy(null);
      setTimeout(() => {
        setToast(null);
        onClose();
      }, 900);
    }
  }

  function doEdit() {
    if (!payload) return;
    // MVP : seuls direct_cards de type image/video/texte ont un éditeur dédié.
    // Pas de page édition publiée → on dirige vers /drafts/<id>/edit (existante
    // pour brouillons) si le user veut éditer. À élargir plus tard.
    if (typeof window !== 'undefined') {
      window.location.href = `/drafts/${encodeURIComponent(payload.cardId)}/edit`;
    }
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer le menu"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px]"
        data-testid="card-longpress-backdrop"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Actions de la card"
        data-testid="card-longpress-sheet"
        data-card-kind={cardKind}
        data-card-id={cardId}
        className={
          'fixed inset-x-0 bottom-0 z-[81] mx-auto w-full max-w-md ' +
          'rounded-t-3xl border-t border-x border-[var(--t2m-line)] bg-[var(--t2m-paper)] backdrop-blur-xl ' +
          'shadow-[0_2px_10px_rgba(47,52,58,.05)] ' +
          'p-3 pb-6 space-y-1 animate-in slide-in-from-bottom-3 duration-200'
        }
      >
        {/* grabber + close */}
        <div className="flex items-center justify-center pt-1.5 pb-2">
          <div className="w-9 h-1 rounded-full bg-[var(--t2m-line)]" />
        </div>
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[12px] uppercase tracking-wider text-[var(--t2m-ink-3)]">
            Actions
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            data-testid="card-longpress-close"
            className="w-8 h-8 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] flex items-center justify-center hover:text-[var(--t2m-ink)] hover:bg-[var(--t2m-wash)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-col">
          {/* Éditer = le feutre grand public : dispo pour le PROPRIÉTAIRE (texte/photo/catégorie). */}
          {isOwner && (
            <ActionRow
              icon={<Edit3 size={16} />}
              label="Éditer la Card"
              testid="card-longpress-editcard"
              onClick={() => setInspectorMode('edit')}
            />
          )}
          {/* Inspecter = le capot moteur : seulement en MODE DÉVELOPPEUR (activé dans le Profil). */}
          {devMode && (
            <ActionRow
              icon={<Braces size={16} />}
              label="Inspecter la Card (dev)"
              testid="card-longpress-inspect"
              onClick={() => setInspectorMode('inspect')}
            />
          )}

          {showEdit && (
            <ActionRow
              icon={<Edit3 size={16} />}
              label="Modifier"
              testid="card-longpress-edit"
              onClick={doEdit}
            />
          )}

          {showArchive && (
            <ActionRow
              icon={<Archive size={16} />}
              label="Archiver"
              testid="card-longpress-archive"
              onClick={doArchive}
              disabled={busy === 'archive'}
            />
          )}

          {showDelete && (
            <ActionRow
              icon={<Trash2 size={16} />}
              label="Supprimer"
              testid="card-longpress-delete"
              danger
              onClick={() => setConfirmDelete(true)}
            />
          )}

          {showSave && (
            <ActionRow
              icon={<Bookmark size={16} />}
              label="Enregistrer"
              testid="card-longpress-save"
              onClick={doSave}
              disabled={busy === 'save'}
            />
          )}

          {showShare && (
            <ActionRow
              icon={<Share2 size={16} />}
              label="Partager"
              testid="card-longpress-share"
              onClick={doShare}
              disabled={busy === 'share'}
            />
          )}

          {showReport && !isOwner && (
            <ActionRow
              icon={<Flag size={16} />}
              label="Signaler ce contenu"
              testid="card-longpress-report"
              onClick={() => setReportOpen(true)}
            />
          )}
        </div>

        {toast && (
          <p
            role="status"
            data-testid="card-longpress-toast"
            className="text-center text-[12px] text-[var(--t2m-ink-2)] pt-1"
          >
            {toast}
          </p>
        )}
      </div>

      {/* Modal de confirmation suppression */}
      {confirmDelete && (
        <DeleteCardConfirm
          cardKind={cardKind}
          cardId={cardId}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            setToast('Supprimée');
            onMutated?.('deleted');
            setTimeout(() => {
              setToast(null);
              onClose();
            }, 700);
          }}
        />
      )}

      {reportOpen && (
        <ReportSheet
          title="Signaler ce contenu"
          onClose={() => { setReportOpen(false); onClose(); }}
          onSubmit={async (reason) => {
            try {
              const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ target: 'content', content_kind: cardKind, content_id: cardId, reason }),
              });
              return res.ok;
            } catch { return false; }
          }}
        />
      )}

      {inspectorMode && (
        <CardInspector
          cardId={cardId}
          card={card}
          isOwner={isOwner}
          startEdit={inspectorMode === 'edit'}
          dev={inspectorMode === 'inspect'}
          onClose={() => { setInspectorMode(null); onClose(); }}
        />
      )}
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  testid,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testid: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className={
        'flex items-center gap-3 w-full px-3 h-12 rounded-xl text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
        (danger
          ? 'text-red-600 hover:bg-red-500/[0.06]'
          : 'text-[var(--t2m-ink)] hover:bg-[var(--t2m-wash)]')
      }
    >
      <span
        className={
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ' +
          (danger
            ? 'bg-red-500/10 border-red-400/30 text-red-600'
            : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)]')
        }
      >
        {icon}
      </span>
      <span className="text-[14px] font-medium">{label}</span>
    </button>
  );
}
