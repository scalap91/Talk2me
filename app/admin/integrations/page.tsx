'use client';

/**
 * Console ADMIN — Intégrations Marketplaces (Pascal 2026-06-28).
 * Vue réelle du « docking » T2M ↔ marketplaces (SHEIN, TEMU) : état de connexion,
 * endpoint, test live de l'API, échantillon de produits. Sert de preuve pour la
 * validation développeur SHEIN (« docking platform » + « system screenshot »).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Plug, RefreshCw } from '@/lib/icons';

interface Provider { key: string; label: string; configured: boolean; base: string; path: string; portal: string }
interface TestResult { ok: boolean; count?: number; error?: string; tested_at?: number; sample?: { title: string; image_url: string | null; price_label: string | null }[] }

export default function AdminIntegrationsPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/integrations', { cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); return; }
      const d = await r.json();
      if (d?.ok) setProviders(d.providers || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const test = async (key: string) => {
    setTesting(key);
    try {
      const d = await fetch('/api/admin/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: key, action: 'test' }) }).then((x) => x.json());
      setResults((p) => ({ ...p, [key]: d }));
    } catch { setResults((p) => ({ ...p, [key]: { ok: false, error: 'network' } })); } finally { setTesting(null); }
  };

  if (forbidden) return <div className="min-h-[100svh] bg-[#0e0e12] text-white grid place-items-center p-8 text-center text-white/60">Accès réservé à l’administrateur.</div>;

  return (
    <div className="min-h-[100svh] bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 h-14 border-b border-white/8 bg-[#0e0e12]/90 backdrop-blur">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold inline-flex items-center gap-2"><Plug className="w-5 h-5 text-red-300" /> Intégrations Marketplaces</h1>
        <button onClick={load} className="ml-auto w-9 h-9 rounded-full grid place-items-center text-white/60"><RefreshCw className="w-4.5 h-4.5" /></button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <p className="text-[12.5px] text-white/50 leading-relaxed">
          T2M se connecte aux marketplaces partenaires via leurs API officielles (modèle hub : une connexion plateforme, pas par marchand). Statut, point d’accès (endpoint) et test en direct ci-dessous.
        </p>

        {loading ? (
          <div className="grid place-items-center py-16 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : providers.map((p) => {
          const res = results[p.key];
          return (
            <div key={p.key} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[16px] font-bold">{p.label}</div>
                  <a href={p.portal} target="_blank" rel="noreferrer" className="text-[11.5px] text-red-300/80 underline">{p.portal}</a>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${p.configured ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {p.configured ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {p.configured ? 'Clés configurées' : 'Clés manquantes'}
                </span>
              </div>

              <div className="px-4 pb-2 grid grid-cols-1 gap-1.5 text-[12px]">
                <div className="flex justify-between gap-3 text-white/60"><span>Point d’accès API</span><span className="text-white/85 font-mono text-[11px] truncate max-w-[60%]">{p.base}{p.path}</span></div>
                <div className="flex justify-between gap-3 text-white/60"><span>Authentification</span><span className="text-white/85">Clé app + signature HMAC-SHA256</span></div>
                <div className="flex justify-between gap-3 text-white/60"><span>Mode</span><span className="text-white/85">Hub plateforme (comparaison multi-marketplace)</span></div>
              </div>

              <div className="p-4 pt-2">
                <button onClick={() => test(p.key)} disabled={testing === p.key} className="w-full py-2.5 rounded-xl bg-red-600 text-white text-[13.5px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {testing === p.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Tester la connexion
                </button>
                {res && (
                  <div className={`mt-3 rounded-xl border p-3 text-[12.5px] ${res.ok ? 'border-emerald-400/25 bg-emerald-500/[0.06]' : 'border-amber-400/25 bg-amber-500/[0.06]'}`}>
                    {res.ok ? (
                      <>
                        <p className="text-emerald-200 font-medium">✓ Connexion OK — {res.count} produit(s) récupéré(s) en direct.</p>
                        {!!res.sample?.length && (
                          <div className="mt-2 flex gap-2 overflow-x-auto">
                            {res.sample.map((s, i) => (
                              <div key={i} className="shrink-0 w-24">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {s.image_url && <img src={s.image_url} alt="" className="w-24 h-24 object-cover rounded-lg border border-white/10" />}
                                <p className="text-[10px] text-white/70 line-clamp-2 mt-1">{s.title}</p>
                                {s.price_label && <p className="text-[10px] text-white/50">{s.price_label}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-amber-200">{res.error === 'not_configured' ? 'Clés non posées — ajoute les identifiants partenaire dans la config serveur, puis re-teste.' : `Échec du test : ${res.error}`}</p>
                    )}
                    {res.tested_at && <p className="text-white/35 text-[10.5px] mt-1.5">Testé le {new Date(res.tested_at).toLocaleString('fr-FR')}</p>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
