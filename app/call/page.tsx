'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface CallHistoryItem {
  id: string;
  peer: {
    id: string;
    talk2me_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  direction: 'in' | 'out';
  kind: 'audio' | 'video';
  state: string;
  started_at: string;
  duration_s: number | null;
}

interface CallHistoryResponse {
  ok: boolean;
  history: CallHistoryItem[];
}

interface CallNewResponse {
  ok: boolean;
  call_id: string;
  callee: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export default function CallPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'keypad' | 'recent'>('keypad');
  const [dialedNumber, setDialedNumber] = useState('');
  const [pseudoInput, setPseudoInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [authError, setAuthError] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setAuthError(false);
    try {
      const res = await fetch('/api/calls/history');
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      const data: CallHistoryItem[] | CallHistoryResponse = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else if (data.ok && Array.isArray(data.history)) {
        setHistory(data.history);
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'recent') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const handleDial = (digit: string) => {
    setDialedNumber((prev) => prev + digit);
    setError(null);
  };

  const handleDelete = () => {
    setDialedNumber((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handlePseudoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPseudoInput(e.target.value);
    setError(null);
  };

  const getTarget = () => {
    if (pseudoInput.trim()) {
      return pseudoInput.trim().startsWith('@') ? pseudoInput.trim() : `@${pseudoInput.trim()}`;
    }
    return dialedNumber.trim();
  };

  const initiateCall = async (kind: 'audio' | 'video') => {
    const target = getTarget();
    if (!target) {
      setError('Veuillez entrer un ID Talk ou @pseudo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/calls/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: target, kind, layer: 'comm' }),
      });

      if (res.status === 401) {
        setAuthError(true);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        const errorCode = data.error || data.code || '';
        switch (errorCode) {
          case 'callee_not_found':
          case 404:
            setError('Numéro Talk introuvable');
            break;
          case 'blocked_comm':
          case 403:
            setError('Tu es bloqué');
            break;
          case 'callee_busy':
          case 409:
            setError('Occupé');
            break;
          case 'caller_already_in_call':
            setError('Déjà en appel');
            break;
          case 'cannot_call_self':
            setError('Tu ne peux pas t\'appeler toi-même');
            break;
          default:
            setError(data.message || 'Erreur lors de l\'appel');
        }
        return;
      }

      const callData: CallNewResponse = data;
      if (callData.ok) {
        window.dispatchEvent(
          new CustomEvent('ttm:call:start', {
            detail: {
              call_id: callData.call_id,
              kind,
              callee: callData.callee,
            },
          })
        );
        setDialedNumber('');
        setPseudoInput('');
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryItemClick = (item: CallHistoryItem) => {
    if (!item.peer) return;
    initiateCallToPeer(item.peer.talk2me_id);
  };

  const initiateCallToPeer = async (talk2meId: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/calls/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: talk2meId, kind: 'audio', layer: 'comm' }),
      });

      if (res.status === 401) {
        setAuthError(true);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        const errorCode = data.error || data.code || '';
        switch (errorCode) {
          case 'callee_not_found':
          case 404:
            setError('Numéro Talk introuvable');
            break;
          case 'blocked_comm':
          case 403:
            setError('Tu es bloqué');
            break;
          case 'callee_busy':
          case 409:
            setError('Occupé');
            break;
          case 'caller_already_in_call':
            setError('Déjà en appel');
            break;
          case 'cannot_call_self':
            setError('Tu ne peux pas t\'appeler toi-même');
            break;
          default:
            setError(data.message || 'Erreur lors de l\'appel');
        }
        return;
      }

      const callData: CallNewResponse = data;
      if (callData.ok) {
        window.dispatchEvent(
          new CustomEvent('ttm:call:start', {
            detail: {
              call_id: callData.call_id,
              kind: 'audio',
              callee: callData.callee,
            },
          })
        );
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const getInitial = (name: string | null): string => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  if (authError) {
    return (
      <div className="h-[100svh] bg-[#0a0a0d] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Connecte-toi</p>
          <button
            onClick={() => router.push('/signin')}
            className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100svh] bg-[#0a0a0d] flex flex-col">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'keypad' ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-6">
            {/* Display area */}
            <div className="w-full max-w-xs mb-6">
              <div className="text-center">
                <div className="text-3xl font-mono text-white tracking-wider mb-2 min-h-[48px]">
                  {dialedNumber || pseudoInput || (
                    <span className="text-gray-500 text-lg font-sans">Entrez un ID Talk</span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="@pseudo (optionnel)"
                  value={pseudoInput}
                  onChange={handlePseudoChange}
                  className="w-full bg-transparent border-b border-gray-700 text-center text-gray-300 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="text-red-400 text-sm mb-4 text-center">{error}</div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-4 max-w-xs w-full mb-6">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDial(digit)}
                  className="w-16 h-16 rounded-full bg-[#1c1c1e] text-white text-2xl font-light flex items-center justify-center hover:bg-[#2c2c2e] active:bg-[#3c3c3e] transition-colors mx-auto"
                >
                  {digit}
                </button>
              ))}
            </div>

            {/* Delete button */}
            <button
              onClick={handleDelete}
              className="w-16 h-16 rounded-full bg-[#1c1c1e] text-gray-400 text-xl flex items-center justify-center hover:bg-[#2c2c2e] active:bg-[#3c3c3e] transition-colors mb-6"
            >
              ⌫
            </button>

            {/* Call buttons */}
            <div className="flex gap-6 mb-4">
              <button
                onClick={() => initiateCall('audio')}
                disabled={loading}
                className="w-16 h-16 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.24 1.01l-2.2 2.2z" />
                </svg>
              </button>
              <button
                onClick={() => initiateCall('video')}
                disabled={loading}
                className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                </svg>
              </button>
            </div>

            <p className="text-gray-600 text-xs text-center">
              Appelle par ID Talk — pas besoin d'être amis
            </p>
          </div>
        ) : (
          <div className="h-full px-4 py-4">
            <h2 className="text-white text-lg font-semibold mb-4">Récents</h2>
            {historyLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : history.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-gray-500">Aucun appel récent.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleHistoryItemClick(item)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#1c1c1e] transition-colors text-left"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-[#2c2c2e] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {item.peer?.avatar_url ? (
                        <img
                          src={item.peer.avatar_url}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        getInitial(item.peer?.display_name || item.peer?.username || null)
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate">
                          {item.peer?.display_name || item.peer?.username || 'Inconnu'}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {item.direction === 'in' ? (
                            <span className={item.state !== 'ended' && !item.duration_s ? 'text-red-400' : 'text-gray-400'}>
                              ↙
                            </span>
                          ) : (
                            <span className="text-gray-400">↗</span>
                          )}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {item.kind === 'audio' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.24 1.01l-2.2 2.2z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                            </svg>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{formatTime(item.started_at)}</span>
                        {item.duration_s && (
                          <>
                            <span>·</span>
                            <span>{formatDuration(item.duration_s)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom tabs */}
      <div className="flex border-t border-gray-800 bg-[#0a0a0d]">
        <button
          onClick={() => setActiveTab('keypad')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
            activeTab === 'keypad'
              ? 'text-blue-500 border-t-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Clavier
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
            activeTab === 'recent'
              ? 'text-blue-500 border-t-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Récents
        </button>
      </div>
    </div>
  );
}
