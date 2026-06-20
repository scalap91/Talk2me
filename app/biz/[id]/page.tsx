'use client';

/**
 * Talk2Me — Vue d'une messagerie ENTREPRISE (Pascal 2026-06-09).
 * Modèle "1 ligne, clients dedans" : on ouvre la messagerie, on voit les fils
 * clients. Le menu « … » (DANS le chat, pas de page à côté) donne :
 * ① Code iframe ② Chatbot (réponse auto) ③ Base documentaire.
 * Cf [[feedback_talk2me_tout_dans_le_chat]].
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MoreHorizontal, X, Copy, Check, Code2, Bot, BookText, Loader2 } from 'lucide-react';

interface Thread { conversation_id: string; display_name: string | null; last_text: string | null; last_at: number | null }
interface Inbox { id: string; name: string; public_key: string; bot_enabled: boolean; knowledge: string; greeting: string | null }

export default function BizInboxPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<null | 'iframe' | 'bot' | 'doc'>(null);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [knowledge, setKnowledge] = useState('');
  const [botOn, setBotOn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/biz/manage?id=${id}`, { cache: 'no-store' });
      if (r.status === 401) { router.replace('/signin'); return; }
      const d = await r.json();
      if (d?.ok) {
        setInbox(d.inbox);
        setThreads(d.threads || []);
        setKnowledge(d.inbox.knowledge || '');
        setBotOn(!!d.inbox.bot_enabled);
      }
    } finally { setLoading(false); }
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  const snippet = inbox ? `<script src="${origin}/biz-widget.js" data-key="${inbox.public_key}" async></script>` : '';

  const copy = async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };

  const saveBot = async (next: boolean) => {
    setBotOn(next);
    await fetch('/api/biz/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, bot_enabled: next }) });
  };
  const saveDoc = async () => {
    setSaving(true);
    await fetch('/api/biz/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, knowledge }) });
    setSaving(false);
    setMenu(null);
  };

  const fmt = (ts: number | null) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto bg-[#0e0e12] text-white overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/8 bg-[#0e0e12]/85 px-3 backdrop-blur-xl">
        <button onClick={() => router.push('/friends')} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{inbox?.name || 'Messagerie'}</div>
          <div className="text-[11px] text-white/45">Messagerie entreprise{botOn ? ' · IA active' : ''}</div>
        </div>
        <button data-testid="biz-menu" onClick={() => setMenu('iframe')} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/[0.06] border border-white/10"><MoreHorizontal size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-white/40 py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : threads.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] text-white/85 font-medium mb-1">Aucun client pour le moment</p>
            <p className="text-[12.5px] text-white/55 max-w-xs mx-auto">Colle le code (menu « … » → Code iframe) sur ton site. Les clients qui écrivent apparaîtront ici.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {threads.map((t) => (
              <li key={t.conversation_id}>
                <button onClick={() => router.push(`/c/${t.conversation_id}`)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] text-left">
                  <span className="w-11 h-11 rounded-full bg-gradient-to-br from-red-500/60 to-red-700/60 grid place-items-center text-white font-bold flex-shrink-0">{(t.display_name || 'V')[0].toUpperCase()}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-medium text-white/95 truncate">{t.display_name || 'Visiteur'}</div>
                    <p className="text-[12.5px] text-white/55 truncate mt-0.5">{t.last_text || 'Nouveau client'}</p>
                  </div>
                  <span className="text-[11px] text-white/40 flex-shrink-0">{fmt(t.last_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* MENU « … » — volet DANS le chat (3 sections) */}
      {menu && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setMenu(null)}>
          <div className="w-full max-w-md bg-[#0e0e12] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/8">
              <h2 className="text-[16px] font-semibold">{inbox?.name}</h2>
              <button onClick={() => setMenu(null)} className="text-white/50 hover:text-white"><X size={20} /></button>
            </div>
            {/* onglets */}
            <div className="flex gap-1.5 px-4 pt-3">
              {([['iframe', 'Code', Code2], ['bot', 'Chatbot', Bot], ['doc', 'Base doc', BookText]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => setMenu(k)} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold border ' + (menu === k ? 'bg-red-500/20 border-red-400/40 text-red-100' : 'border-white/10 text-white/55')}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {menu === 'iframe' && (
                <div className="space-y-3">
                  <p className="text-[12.5px] text-white/55">Colle ce code sur ton site (avant <code className="text-white/75">{'</body>'}</code>). La bulle de chat apparaît, les messages arrivent ici.</p>
                  <pre className="text-[11px] text-white/80 bg-black/40 border border-white/10 rounded-xl p-2.5 overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
                  <button onClick={copy} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/12 bg-white/[0.06] text-[13px] font-medium">
                    {copied ? <><Check className="w-4 h-4 text-green-400" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le code</>}
                  </button>
                </div>
              )}
              {menu === 'bot' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-medium">Réponse automatique</div>
                      <div className="text-[12px] text-white/55">L'IA répond aux clients avec ta base doc</div>
                    </div>
                    <button onClick={() => saveBot(!botOn)} className={'w-12 h-7 rounded-full transition-colors relative ' + (botOn ? 'bg-red-600' : 'bg-white/15')}>
                      <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (botOn ? 'left-[22px]' : 'left-0.5')} />
                    </button>
                  </div>
                  <p className="text-[11.5px] text-white/45">Si désactivé, c'est toi qui réponds à la main depuis chaque fil client.</p>
                </div>
              )}
              {menu === 'doc' && (
                <div className="space-y-3">
                  <p className="text-[12.5px] text-white/55">Colle ici tout ce que l'IA doit savoir (tarifs, prestations, zones, FAQ…). Elle répond UNIQUEMENT à partir de ça.</p>
                  <textarea value={knowledge} onChange={(e) => setKnowledge(e.target.value)} rows={9} placeholder="Ex : Le DPE coûte 99€, valable 10 ans. On intervient sur Lyon et alentours sous 48h…" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-red-400/50 resize-none" />
                  <button onClick={saveDoc} disabled={saving} className="w-full py-2.5 rounded-xl bg-red-600 text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer la base
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
