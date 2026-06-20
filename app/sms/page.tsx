'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Peer {
  id: string;
  talk2me_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

interface Thread {
  peer: Peer;
  last_text: string;
  last_at: string;
  unread: number;
  blocked: boolean;
}

interface Message {
  id: string;
  from_me: boolean;
  text: string;
  created_at: string;
}

export default function SMSPage() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'conversation'>('list');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newMessageTo, setNewMessageTo] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [showNewThread, setShowNewThread] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (view === 'conversation' && peer) {
      fetchMessages(peer.id);
      pollRef.current = setInterval(() => {
        fetchMessages(peer.id);
      }, 4000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [view, peer]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleUnauthorized = () => {
    setError('Connecte-toi');
    router.push('/login');
  };

  const fetchThreads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sms/threads');
      if (res.status === 401) return handleUnauthorized();
      const data = await res.json();
      if (data.ok) {
        setThreads(data.threads);
      }
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (peerId: string) => {
    try {
      const res = await fetch(`/api/sms/messages?with=${peerId}`);
      if (res.status === 401) return handleUnauthorized();
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        setPeer(data.peer);
        setBlocked(data.peer?.blocked || false);
      }
    } catch {
      // silent
    }
  };

  const sendMessage = async (toId?: string, to?: string, text?: string) => {
    const messageText = text || inputText;
    if (!messageText.trim()) return;
    setSending(true);
    try {
      const body: any = { text: messageText };
      if (toId) body.to_id = toId;
      if (to) body.to = to;
      const res = await fetch('/api/sms/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const data = await res.json();
      if (data.ok) {
        if (toId) {
          setInputText('');
          await fetchMessages(toId);
        } else {
          setNewMessageText('');
          setNewMessageTo('');
          setShowNewThread(false);
          await fetchThreads();
          // open thread
          const thread = threads.find(t => t.peer.id === data.peer_id);
          if (thread) {
            setPeer(thread.peer);
            setView('conversation');
            await fetchMessages(data.peer_id);
          }
        }
      }
    } catch {
      setError('Erreur d\'envoi');
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    if (!peer) return;
    try {
      const res = await fetch('/api/sms/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ with: peer.id, blocked: !blocked }),
      });
      if (res.status === 401) return handleUnauthorized();
      const data = await res.json();
      if (data.ok) {
        setBlocked(!blocked);
        await fetchThreads();
      }
    } catch {
      setError('Erreur');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

  const truncate = (str: string, len: number) => {
    if (str.length <= len) return str;
    return str.substring(0, len) + '…';
  };

  const getInitial = (name?: string, username?: string) => {
    const char = name?.[0] || username?.[0] || '?';
    return char.toUpperCase();
  };

  if (error === 'Connecte-toi') {
    return (
      <div className="flex items-center justify-center h-[100svh] bg-[#0a0a0d] text-white">
        <p className="text-lg">Connecte-toi</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100svh] bg-[#0a0a0d] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        {view === 'list' ? (
          <>
            <div>
              <h1 className="text-lg font-semibold">SMS Talk</h1>
              <p className="text-xs text-white/50">Messagerie Talk — sans être amis</p>
            </div>
            <button
              onClick={() => setShowNewThread(true)}
              className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-xl font-bold hover:bg-red-500 transition"
            >
              ＋
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setView('list');
                setPeer(null);
                setMessages([]);
                if (pollRef.current) clearInterval(pollRef.current);
              }}
              className="text-red-400 hover:text-red-300 transition"
            >
              ← Retour
            </button>
            <div className="flex items-center gap-2">
              {peer?.avatar_url ? (
                <img src={peer.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-sm font-bold">
                  {getInitial(peer?.display_name, peer?.username)}
                </div>
              )}
              <span className="font-medium">{peer?.display_name || `@${peer?.username}`}</span>
            </div>
            <button
              onClick={toggleBlock}
              className={`text-sm px-3 py-1 rounded-full border transition ${
                blocked
                  ? 'border-green-500 text-green-400 hover:bg-green-500/10'
                  : 'border-red-500 text-red-400 hover:bg-red-500/10'
              }`}
            >
              {blocked ? 'Débloquer' : 'Bloquer'}
            </button>
          </>
        )}
      </header>

      {/* Content */}
      {view === 'list' ? (
        <div className="flex-1 overflow-y-auto">
          {showNewThread && (
            <div className="p-4 border-b border-white/10 bg-white/5">
              <input
                type="text"
                placeholder="talk2me_id ou @pseudo"
                value={newMessageTo}
                onChange={(e) => setNewMessageTo(e.target.value)}
                className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:ring-1 focus:ring-red-500"
              />
              <textarea
                placeholder="Votre message…"
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:ring-1 focus:ring-red-500 resize-none"
                rows={2}
              />
              <button
                onClick={() => sendMessage(undefined, newMessageTo, newMessageText)}
                disabled={sending || !newMessageTo || !newMessageText}
                className="w-full bg-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition"
              >
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full text-white/50">Chargement…</div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/50 px-4 text-center">
              <p className="text-lg mb-2">Aucune conversation</p>
              <p className="text-sm">Tape ＋ pour écrire à un Talk.</p>
            </div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.peer.id}
                onClick={() => {
                  setPeer(thread.peer);
                  setView('conversation');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition border-b border-white/5"
              >
                {thread.peer.avatar_url ? (
                  <img src={thread.peer.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-lg font-bold shrink-0">
                    {getInitial(thread.peer.display_name, thread.peer.username)}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">
                      {thread.peer.display_name || `@${thread.peer.username}`}
                    </span>
                    <span className="text-xs text-white/40 shrink-0 ml-2">
                      {formatTime(thread.last_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-sm text-white/60 truncate">
                      {truncate(thread.last_text, 40)}
                    </span>
                    {thread.unread > 0 && (
                      <span className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 ml-2 shrink-0">
                        {thread.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Blocked banner */}
          {blocked && (
            <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-2 text-sm text-center text-red-300">
              Bloqué
              <button onClick={toggleBlock} className="ml-2 underline hover:text-red-200">
                Débloquer
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                    msg.from_me
                      ? 'bg-red-600 rounded-br-md'
                      : 'bg-white/10 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>
                  <p className="text-[10px] text-white/40 text-right mt-1">
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-white/10 p-3 shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Écrire un message…"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (peer) sendMessage(peer.id);
                  }
                }}
                className="flex-1 bg-white/10 rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-red-500"
              />
              <button
                onClick={() => peer && sendMessage(peer.id)}
                disabled={sending || !inputText.trim() || blocked}
                className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-500 disabled:opacity-50 transition shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
