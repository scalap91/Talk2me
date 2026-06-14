'use client';

import { useState, useEffect, useCallback } from 'react';

interface ApiKey {
  provider: string;
  label: string;
  env: string;
  critical: boolean;
  active: boolean;
  enabled: boolean;
  overridden: boolean;
  source: string;
  masked: string;
  updated_at: string;
}

interface Service {
  name: string;
  host: string;
  role: string;
  provider: string;
  needs_key: boolean;
  calls: number | null;
}

interface ApiResponse {
  ok: boolean;
  keys: ApiKey[];
  services: Service[];
}

export default function AdminKeysPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/api-keys');
      if (res.status === 401 || res.status === 403) {
        setError('Accès réservé admin');
        return;
      }
      if (!res.ok) throw new Error('Erreur réseau');
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleToggle = async (provider: string, enabled: boolean, critical: boolean) => {
    if (critical && !enabled) {
      if (!window.confirm('Couper l\'IA L2 va arrêter TOUTES les réponses IA. Confirmer ?')) return;
    }
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, action: 'toggle', enabled }),
      });
      if (!res.ok) throw new Error('Erreur lors du toggle');
      fetchKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleSetKey = async (provider: string) => {
    const value = newKeys[provider];
    if (!value) return;
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, action: 'set', value }),
      });
      if (!res.ok) throw new Error('Erreur lors du remplacement');
      setNewKeys((prev) => ({ ...prev, [provider]: '' }));
      fetchKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleDeleteOverride = async (provider: string) => {
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, action: 'delete' }),
      });
      if (!res.ok) throw new Error('Erreur lors de la suppression');
      fetchKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] text-white p-8">
        <p className="text-center text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] text-white p-8">
        <p className="text-center text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Clés & accès externes</h1>
          <button
            onClick={fetchKeys}
            className="px-4 py-2 bg-white/10 border border-white/10 rounded-xl hover:bg-white/20 transition-colors"
          >
            Rafraîchir
          </button>
        </div>

        {/* Section Clés API */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-6 text-red-400">Clés API (kill switch)</h2>
          <div className="space-y-4">
            {data?.keys.map((key) => (
              <div
                key={key.provider}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-medium">{key.label}</span>
                    <span className="px-2 py-0.5 text-xs bg-white/10 rounded-full text-gray-300">
                      {key.env}
                    </span>
                    {key.critical && (
                      <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full font-medium">
                        CRITIQUE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        key.active ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className={`text-sm ${key.active ? 'text-green-400' : 'text-red-400'}`}>
                      {key.active ? 'Actif' : 'Coupé'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-gray-400">
                  <span>Source : {key.source}</span>
                  <span>Valeur : {key.masked}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleToggle(key.provider, !key.enabled, key.critical)}
                    className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                      key.active
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                    }`}
                  >
                    {key.active ? 'Couper le jus' : 'Réactiver'}
                  </button>

                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="Nouvelle clé..."
                      value={newKeys[key.provider] || ''}
                      onChange={(e) =>
                        setNewKeys((prev) => ({ ...prev, [key.provider]: e.target.value }))
                      }
                      className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-red-500/50 w-48"
                    />
                    <button
                      onClick={() => handleSetKey(key.provider)}
                      className="px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/30 transition-colors"
                    >
                      Remplacer la clé
                    </button>
                  </div>

                  {key.overridden && (
                    <button
                      onClick={() => handleDeleteOverride(key.provider)}
                      className="text-sm text-gray-400 underline hover:text-white transition-colors"
                    >
                      revenir au .env
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section Sites / APIs */}
        <section>
          <h2 className="text-xl font-semibold mb-6 text-red-400">Sites / APIs appelés</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 text-left text-sm text-gray-400">
                  <th className="p-4 font-medium">Nom</th>
                  <th className="p-4 font-medium">Host</th>
                  <th className="p-4 font-medium">Rôle</th>
                  <th className="p-4 font-medium">Clé</th>
                  <th className="p-4 font-medium">Appels</th>
                </tr>
              </thead>
              <tbody>
                {data?.services.map((service) => {
                  const relatedKey = data.keys.find((k) => k.provider === service.provider);
                  const isCut = relatedKey && !relatedKey.active;
                  return (
                    <tr
                      key={service.name}
                      className={`border-b border-white/5 last:border-0 ${
                        isCut ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <td className="p-4">
                        <span className={isCut ? 'text-red-400' : ''}>
                          {service.name}
                          {isCut && <span className="ml-2 text-xs text-red-400">coupé</span>}
                        </span>
                      </td>
                      <td className="p-4 text-gray-300">{service.host}</td>
                      <td className="p-4 text-gray-300">{service.role}</td>
                      <td className="p-4">
                        {service.needs_key ? (
                          <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                            clé requise
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-gray-500/20 text-gray-400 rounded-full">
                            sans clé
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-gray-300">
                        {service.calls !== null ? service.calls.toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
