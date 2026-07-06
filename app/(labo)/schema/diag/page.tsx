'use client';
/**
 * /schema/diag — CENTRE DE DIAGNOSTIC (cockpit T2M, Pascal 2026-06-30). Boutons
 * « Tester » qui appellent /api/schema/diag (tests RÉELS : latence, joignabilité,
 * présence clés). Aucun voyant bidon ; la valeur des clés n'est jamais affichée.
 */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface EnvP { name: string; present: boolean }
interface DiagResult { key: string; ok: boolean; ms: number; detail: string; env?: EnvP[]; note?: string; ts: number }
interface Target { key: string; label: string; module?: string; kind: string; env?: string[]; note?: string }

function Dot({ ok }: { ok: boolean }) {
  return <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '🟢' : '🔴'}</span>;
}
function Ms({ ms }: { ms: number }) {
  const c = ms < 150 ? 'text-emerald-300' : ms < 800 ? 'text-amber-300' : 'text-red-300';
  return <span className={`text-[11px] ${c}`}>{ms} ms</span>;
}

export default function DiagPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [results, setResults] = useState<Record<string, DiagResult>>({});
  const [recent, setRecent] = useState<DiagResult[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const loadMeta = useCallback(async () => {
    const res = await fetch('/api/schema/diag');
    if (res.status === 403 || res.status === 401) { setDenied(true); return; }
    const r = await res.json();
    setTargets(r.targets || []);
    setRecent(r.recent || []);
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  if (denied) {
    return (
      <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-[16px] font-semibold mb-2">Diagnostic — accès restreint</h1>
          <p className="text-[13px] text-white/65">Connecte-toi avec un compte qui a un rôle cockpit pour lancer les tests.</p>
          <Link href="/schema/decoupage" className="inline-block mt-4 text-sky-300 text-[13px]">← Cockpit</Link>
        </div>
      </main>
    );
  }

  const test = useCallback(async (key: string) => {
    setLoading((l) => ({ ...l, [key]: true }));
    try {
      const r = await fetch(`/api/schema/diag?target=${encodeURIComponent(key)}`).then((x) => x.json());
      if (r.result) setResults((prev) => ({ ...prev, [key]: r.result }));
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
      loadMeta();
    }
  }, [loadMeta]);

  const testAll = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/schema/diag?all=1').then((x) => x.json());
      const map: Record<string, DiagResult> = {};
      (r.results || []).forEach((res: DiagResult) => { map[res.key] = res; });
      setResults(map);
    } finally {
      setBusy(false);
      loadMeta();
    }
  }, [loadMeta]);

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/decoupage" className="text-white/55 hover:text-white/90 text-[13px]">← Cockpit</Link>
          <h1 className="text-[15px] font-medium">Centre de diagnostic</h1>
          <button onClick={testAll} disabled={busy} className="text-[13px] rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-200 px-2.5 py-1 hover:bg-sky-500/30 disabled:opacity-40">
            {busy ? 'Test…' : 'Tout tester'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-7 space-y-5">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[12.5px] text-white/70 leading-relaxed">
          Tests <b className="text-white">réels</b> : base de données (<code>SELECT 1</code>), joignabilité des services, latence,
          présence des clés. Pour les API à quota/signature (Vision, AliExpress), le test vérifie <b>l&apos;hôte + la présence de la clé</b>
          sans appel facturé — honnête sur ce qui est mesuré. La <b>valeur</b> d&apos;une clé n&apos;est jamais lue ni affichée.
        </p>

        <div className="space-y-2.5">
          {targets.map((t) => {
            const r = results[t.key];
            const isLoading = loading[t.key];
            return (
              <div key={t.key} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium flex items-center gap-2">
                      {r && <Dot ok={r.ok} />}{t.label}
                    </div>
                    {t.module && <Link href={`/schema/module/${t.module}`} className="text-[11px] text-sky-300/70 hover:text-sky-200">module {t.module} →</Link>}
                  </div>
                  <button onClick={() => test(t.key)} disabled={isLoading || busy}
                    className="shrink-0 text-[12px] rounded-lg bg-white/[0.06] border border-white/12 px-2.5 py-1 hover:bg-white/[0.12] disabled:opacity-40">
                    {isLoading ? '…' : 'Tester'}
                  </button>
                </div>

                {r && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className={r.ok ? 'text-emerald-200' : 'text-red-200'}>{r.detail}</span>
                    <Ms ms={r.ms} />
                    {r.env && r.env.map((e) => (
                      <span key={e.name} className="text-[10.5px] text-white/55">
                        {e.present ? '🟢' : '⚪'} <code>{e.name}</code>
                      </span>
                    ))}
                  </div>
                )}
                {r?.note && <p className="text-[10.5px] text-white/35 mt-1">{r.note}</p>}
                {!r && t.note && <p className="text-[10.5px] text-white/35 mt-1">{t.note}</p>}
              </div>
            );
          })}
          {targets.length === 0 && <p className="text-white/40 text-[13px]">Chargement…</p>}
        </div>

        {/* Derniers appels (réels) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Derniers appels (temps de réponse réels)</h2>
          {recent.length === 0 ? <p className="text-white/35 text-[12px]">Aucun test lancé pour l&apos;instant.</p> : (
            <div className="space-y-1">
              {recent.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-[12px] border-t border-white/6 pt-1 first:border-0 first:pt-0">
                  <span className="flex items-center gap-2"><Dot ok={r.ok} /><code className="text-white/70">{r.key}</code><span className="text-white/45 truncate">{r.detail}</span></span>
                  <Ms ms={r.ms} />
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-[11px] text-white/30">
          Source : <code>lib/schema/diag.ts</code> + <code>/api/schema/diag</code> (gated dev-only). Quotas/limites détaillés = volet suivant (instrumentation par fournisseur).
        </p>
      </div>
    </main>
  );
}
