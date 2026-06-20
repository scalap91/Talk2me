'use client';

/**
 * Talk2Me — UI du chat VISITEUR (contenu de l'iframe d'une messagerie entreprise).
 * Public, sans authentification. Crée/retrouve la conversation du visiteur,
 * envoie les messages et poll les réponses (propriétaire ou IA).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Msg { id: string; from: 'me' | 'support' | 'agent'; text: string; at: number }

export default function BizChat({ inboxKey }: { inboxKey: string }) {
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [accent, setAccent] = useState('#dc2626');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string>('');
  const convRef = useRef<string>('');
  const lastTsRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lsKey = `t2mbiz:${inboxKey}`;

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMsgs((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      if (add.length === 0) return prev;
      const next = [...prev, ...add].sort((a, b) => a.at - b.at);
      lastTsRef.current = Math.max(lastTsRef.current, ...next.map((m) => m.at));
      return next;
    });
  }, []);

  // Démarrage : crée/retrouve la conversation.
  useEffect(() => {
    let alive = true;
    let stored = '';
    try { stored = localStorage.getItem(lsKey) || ''; } catch { /* ignore */ }
    fetch(`/api/biz/${inboxKey}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_token: stored || undefined }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.ok) return;
        tokenRef.current = d.visitor_token;
        convRef.current = d.conversation_id;
        try { localStorage.setItem(lsKey, d.visitor_token); } catch { /* ignore */ }
        setName(d.name || '');
        setGreeting(d.greeting || '');
        setAccent(d.accent || '#dc2626');
        merge((d.history || []) as Msg[]);
        lastTsRef.current = d.now || Date.now();
        setReady(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [inboxKey, lsKey, merge]);

  // Polling des réponses.
  useEffect(() => {
    if (!ready) return;
    const iv = setInterval(async () => {
      if (!tokenRef.current || !convRef.current) return;
      try {
        const r = await fetch(`/api/biz/${inboxKey}/poll?t=${tokenRef.current}&c=${convRef.current}&after=${lastTsRef.current}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (d?.ok) merge((d.messages || []) as Msg[]);
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [ready, inboxKey, merge]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const send = async () => {
    const t = text.trim();
    if (!t || !tokenRef.current || !convRef.current) return;
    setText('');
    const optimistic: Msg = { id: 'tmp-' + Date.now(), from: 'me', text: t, at: Date.now() };
    setMsgs((p) => [...p, optimistic]);
    try {
      const r = await fetch(`/api/biz/${inboxKey}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_token: tokenRef.current, conversation_id: convRef.current, text: t }),
      });
      const d = await r.json();
      if (d?.ok) {
        setMsgs((p) => p.map((m) => (m.id === optimistic.id ? { ...m, id: d.id, at: d.at } : m)));
        lastTsRef.current = Math.max(lastTsRef.current, d.at || Date.now());
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-[100svh] bg-white text-gray-900">
      <div className="shrink-0 px-4 py-3 text-white font-semibold text-[15px] shadow" style={{ background: accent }}>
        {name || 'Discutons'}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
        {greeting && (
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white border border-gray-200 px-3 py-2 text-[14px] shadow-sm">
            {greeting}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={'flex ' + (m.from === 'me' ? 'justify-end' : 'justify-start')}>
            <div
              className={
                'max-w-[85%] px-3 py-2 text-[14px] whitespace-pre-wrap break-words shadow-sm ' +
                (m.from === 'me'
                  ? 'rounded-2xl rounded-tr-sm text-white'
                  : 'rounded-2xl rounded-tl-sm bg-white border border-gray-200')
              }
              style={m.from === 'me' ? { background: accent } : undefined}
            >
              {m.from === 'agent' && <span className="block text-[10px] font-bold opacity-60 mb-0.5">Assistant</span>}
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 flex items-end gap-2 p-2.5 border-t border-gray-200 bg-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.625rem)' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder="Votre message…"
          className="flex-1 resize-none max-h-28 rounded-2xl border border-gray-300 px-3 py-2 text-[14px] outline-none focus:border-gray-400"
        />
        <button onClick={send} className="shrink-0 h-10 px-4 rounded-2xl text-white font-semibold text-[14px] active:scale-95" style={{ background: accent }}>
          Envoyer
        </button>
      </div>
    </div>
  );
}
