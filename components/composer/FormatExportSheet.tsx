'use client';

/**
 * Talk2Me — DÉCLINER POUR… (Pascal 2026-06-10). Multi-canal SANS API externe :
 * on reformate le post (image ou card texte) au bon RATIO par réseau
 * (1:1 Insta · 9:16 TikTok/Reels/Story · 16:9 YouTube/paysage), avec la légende,
 * puis PARTAGE NATIF (navigator.share → menu Android : TikTok, Insta…) ou
 * téléchargement. La personne poste elle-même. Vidéo = réencodage serveur (à venir).
 */

import { useState, useEffect } from 'react';
import { X, Loader2, Share2, Download, Square, Smartphone, RectangleHorizontal, Send, Link2 } from 'lucide-react';

const PROVIDER_LABEL: Record<string, string> = { facebook_page: 'Facebook', instagram: 'Instagram', youtube: 'YouTube' };

const GRAD: Record<string, [string, string]> = {
  neutral: ['#1a1a22', '#232330'], purple: ['#3a1418', '#56181f'],
  blue: ['#18233a', '#213254'], warm: ['#2a1d20', '#3d2530'],
};

const FORMATS = [
  { k: 'carre', label: 'Carré · Insta', w: 1080, h: 1080, ratio: '1:1' as const, icon: Square },
  { k: 'story', label: 'Story · Reels · TikTok', w: 1080, h: 1920, ratio: '9:16' as const, icon: Smartphone },
  { k: 'paysage', label: 'Paysage · YouTube', w: 1920, h: 1080, ratio: '16:9' as const, icon: RectangleHorizontal },
];

interface Props {
  title: string; description: string; hashtags: string;
  mediaUrl: string | null; mediaKind: 'image' | 'video' | null; variant: string;
  onClose: () => void;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' '); let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export default function FormatExportSheet({ title, description, hashtags, mediaUrl, mediaKind, variant, onClose }: Props) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  // Comptes connectés (post direct) — n'affiche RIEN tant que pas configuré/connecté.
  const [accounts, setAccounts] = useState<{ provider: string; name: string | null }[]>([]);
  const [available, setAvailable] = useState<{ meta?: boolean; google?: boolean }>({});
  useEffect(() => {
    fetch('/api/connect/status', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) { setAccounts(d.accounts || []); setAvailable(d.available || {}); } }).catch(() => {});
  }, []);

  const caption = [title.trim(), description.trim(), hashtags.trim()].filter(Boolean).join('\n\n');

  const render = async (w: number, h: number): Promise<Blob | null> => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return null;

    if (mediaUrl && mediaKind === 'image') {
      const img = await loadImg(mediaUrl);
      const s = Math.max(w / img.width, h / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      // voiles haut+bas pour lisibilité du texte
      const gTop = ctx.createLinearGradient(0, 0, 0, h * 0.35); gTop.addColorStop(0, 'rgba(0,0,0,0.65)'); gTop.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gTop; ctx.fillRect(0, 0, w, h * 0.35);
      const gBot = ctx.createLinearGradient(0, h * 0.6, 0, h); gBot.addColorStop(0, 'rgba(0,0,0,0)'); gBot.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = gBot; ctx.fillRect(0, h * 0.6, w, h * 0.4);
    } else {
      const [a, b] = GRAD[variant] || GRAD.neutral;
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }

    const pad = Math.round(w * 0.08);
    const maxW = w - pad * 2;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;

    // Titre (haut-centre)
    if (title.trim()) {
      const fs = Math.round(w * 0.062);
      ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = '#fff';
      const lines = wrapText(ctx, title.trim(), maxW);
      let y = mediaUrl ? Math.round(h * 0.14) : Math.round(h * 0.34);
      for (const ln of lines) { ctx.fillText(ln, w / 2, y); y += fs * 1.2; }
    }
    // Description + hashtags (bas-centre)
    const bottomText = [description.trim(), hashtags.trim()].filter(Boolean).join('\n');
    if (bottomText) {
      const fs = Math.round(w * 0.038);
      ctx.font = `${fs}px sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.92)';
      const lines = wrapText(ctx, bottomText, maxW);
      let y = h - pad - (lines.length - 1) * fs * 1.3;
      for (const ln of lines) { ctx.fillStyle = ln.trim().startsWith('#') ? '#fca5a5' : 'rgba(255,255,255,0.92)'; ctx.fillText(ln, w / 2, y); y += fs * 1.3; }
    }
    ctx.shadowBlur = 0;

    return new Promise((res) => c.toBlob((bl) => res(bl), 'image/jpeg', 0.92));
  };

  const go = async (f: typeof FORMATS[number], mode: 'share' | 'download') => {
    if (busy) return;
    setErr(''); setBusy(f.k + mode);
    try {
      let blob: Blob | null; let ext: string; let mime: string;
      if (mediaKind === 'video' && mediaUrl) {
        // Réencodage serveur au bon ratio (ffmpeg).
        const r = await fetch('/api/media/reframe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_url: mediaUrl, ratio: f.ratio }),
        }).then((x) => x.json());
        if (!r?.ok || !r.url) { setErr('Réencodage échoué.'); return; }
        blob = await fetch(r.url).then((x) => x.blob());
        ext = 'mp4'; mime = 'video/mp4';
      } else {
        blob = await render(f.w, f.h);
        ext = 'jpg'; mime = 'image/jpeg';
      }
      if (!blob) { setErr('Rendu impossible.'); return; }
      const file = new File([blob], `talk2me-${f.k}.${ext}`, { type: mime });
      const navAny = navigator as unknown as { share?: (d: unknown) => Promise<void>; canShare?: (d: unknown) => boolean };
      if (mode === 'share' && navAny.share && (!navAny.canShare || navAny.canShare({ files: [file] }))) {
        await navAny.share({ files: [file], text: caption });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        if (caption) { try { await navigator.clipboard.writeText(caption); } catch { /* */ } }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setErr('Échec — réessaie.');
    } finally { setBusy(''); }
  };

  // Publier DIRECT sur un réseau connecté : génère l'asset au bon format, l'héberge, poste.
  const publishTo = async (provider: string) => {
    if (busy) return;
    setErr(''); setOk(''); setBusy('pub-' + provider);
    try {
      let media_url = ''; let media_kind = '';
      if (mediaKind === 'video' && mediaUrl) {
        const ratio = provider === 'youtube' ? '16:9' : '9:16';
        const rr = await fetch('/api/media/reframe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ media_url: mediaUrl, ratio }) }).then((x) => x.json());
        if (!rr?.ok) { setErr('Réencodage échoué.'); return; }
        media_url = rr.url; media_kind = 'video';
      } else if (provider !== 'youtube') {
        const blob = await render(1080, 1080);
        if (!blob) { setErr('Rendu impossible.'); return; }
        const fd = new FormData(); fd.append('file', new File([blob], 'post.jpg', { type: 'image/jpeg' }));
        const up = await fetch('/api/upload', { method: 'POST', body: fd }).then((x) => x.json());
        if (!up?.url) { setErr('Upload échoué.'); return; }
        media_url = up.url; media_kind = 'image';
      } else { setErr('YouTube : ajoute une vidéo.'); return; }
      const r = await fetch('/api/social/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, media_url, media_kind, caption, title: title.trim() }) }).then((x) => x.json());
      if (r?.ok) setOk(`Publié sur ${PROVIDER_LABEL[provider] || provider} ✓`);
      else setErr(`Échec ${PROVIDER_LABEL[provider] || provider} : ${r?.error || ''}`);
    } catch { setErr('Échec de la publication directe.'); }
    finally { setBusy(''); }
  };

  const showDirect = available.meta || available.google;

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end" onClick={onClose}>
      <div className="w-full bg-[#15151c] rounded-t-3xl p-4 pb-8 space-y-3" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-white">Décliner pour…</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-white/60"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-[12px] text-white/55">Choisis le format → <b className="text-white/80">Partager</b> (ouvre TikTok, Insta… du téléphone) ou <b className="text-white/80">Télécharger</b> (la légende est copiée).{mediaKind === 'video' && <span className="text-amber-200"> La vidéo est réencodée — quelques secondes.</span>}</p>

        {FORMATS.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.k} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
              <span className="w-9 h-9 rounded-lg bg-white/5 grid place-items-center text-red-200 shrink-0"><Icon className="w-5 h-5" /></span>
              <span className="flex-1 text-[13px] text-white/90">{f.label}</span>
              <button onClick={() => go(f, 'share')} disabled={!!busy} className="px-3 py-2 rounded-xl bg-red-600 text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-40">
                {busy === f.k + 'share' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Partager
              </button>
              <button onClick={() => go(f, 'download')} disabled={!!busy} className="w-9 h-9 rounded-xl bg-white/[0.07] border border-white/10 grid place-items-center text-white/80 disabled:opacity-40">
                {busy === f.k + 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
        {showDirect && (
          <div className="pt-2 mt-1 border-t border-white/10 space-y-2">
            <p className="text-[12px] text-white/55">Publier direct (compte connecté) :</p>
            {accounts.map((a) => (
              <button key={a.provider + (a.name || '')} onClick={() => publishTo(a.provider)} disabled={!!busy}
                className="w-full flex items-center justify-between gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-3 py-2.5 disabled:opacity-50">
                <span className="text-[13px] text-white/90 truncate">{PROVIDER_LABEL[a.provider] || a.provider}{a.name ? ` · ${a.name}` : ''}</span>
                <span className="inline-flex items-center gap-1 text-emerald-200 text-[12px] font-semibold">{busy === 'pub-' + a.provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publier</span>
              </button>
            ))}
            {available.meta && !accounts.some((a) => a.provider === 'facebook_page' || a.provider === 'instagram') && (
              <a href="/api/connect/meta" className="w-full flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/80"><Link2 className="w-4 h-4" /> Connecter Facebook / Instagram</a>
            )}
            {available.google && !accounts.some((a) => a.provider === 'youtube') && (
              <a href="/api/connect/google" className="w-full flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/80"><Link2 className="w-4 h-4" /> Connecter YouTube</a>
            )}
          </div>
        )}
        {ok && <p className="text-[12px] text-emerald-300">{ok}</p>}
        {err && <p className="text-[12px] text-red-300">{err}</p>}
      </div>
    </div>
  );
}
