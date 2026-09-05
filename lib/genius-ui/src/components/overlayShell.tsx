import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Coquille d'overlay interne (NON exportée) sur l'élément <dialog> NATIF. Fournit gratuitement :
 * focus trap, Échap, ::backdrop, top-layer (aucun z-index), inert du reste de la page. Contrôlée
 * par `open`. Dialog et BottomSheet ne diffèrent que par leur classe/mise en forme.
 */
export function OverlayShell({ open, title, dismissible, onClose, className, children }: {
  open: boolean; title?: string; dismissible: boolean; onClose?: () => void; className: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { try { d.showModal(); } catch { /* déjà ouvert / non supporté */ } }
    else if (!open && d.open) { d.close(); }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onClose={() => onClose?.()}
      onCancel={(e) => { if (!dismissible) e.preventDefault(); }} // Échap
      onClick={(e) => { if (dismissible && e.target === ref.current) ref.current?.close(); }} // clic sur le fond
    >
      <div className="gu-overlay-body">
        {title && <div className="gu-overlay-title">{title}</div>}
        {children}
      </div>
    </dialog>
  );
}
