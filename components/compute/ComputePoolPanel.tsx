'use client';
/**
 * ComputePoolPanel — panneau DEV (admin only) du compute mesh (Pascal 2026-07-04).
 * Affiché dans le profil en mode dev : état du POOL (téléphones dispo) + progression des GPU
 * en temps réel (tâches en attente / en cours / finies, barres par batch). Invisible pour
 * les non-admins et hors mode dev. [[project_talk2me_compute_mesh]]
 */
import { useEffect, useState } from 'react';
import { useIsAdmin, useDevMode } from '@/components/dev/CardDevButton';
import { hasNativeVision } from '@/lib/compute/ondevice-ocr';

interface Stats {
  pool: { registered: number; available_now: number; good: number; medium: number; charging: number };
  queue: { total: number; pending: number; assigned: number; done: number; gpuNative: number; cpuWeb: number; activeWorkers: number; batches: { id: string; total: number; done: number; assigned: number }[] };
}

export default function ComputePoolPanel() {
  const admin = useIsAdmin();
  const dev = useDevMode();
  const [s, setS] = useState<Stats | null>(null);
  const [bridge, setBridge] = useState<boolean | null>(null);
  useEffect(() => { try { setBridge(hasNativeVision()); } catch { setBridge(false); } }, []);

  useEffect(() => {
    if (!admin || !dev) return;
    let stop = false;
    const tick = async () => {
      try { const r = await fetch('/api/compute/stats', { credentials: 'include' }); const d = await r.json(); if (d?.ok && !stop) setS(d); } catch { /* */ }
      if (!stop) setTimeout(tick, 2500);
    };
    tick();
    return () => { stop = true; };
  }, [admin, dev]);

  if (!admin || !dev || !s) return null;
  const { pool, queue } = s;
  const cell: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '6px 4px' };

  return (
    <div style={{ margin: '0 20px 12px', padding: 14, borderRadius: 14, background: '#FFFFFF', color: '#2F343A', border: '1px solid #E7EAF0', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#6A7585', letterSpacing: 0.5, marginBottom: 10 }}>🧠 COMPUTE MESH · DEV</div>

      {/* Diagnostic : le pont natif GPU (ML Kit) est-il présent sur CE téléphone ? */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, marginBottom: 12,
        background: bridge ? '#ECFDF5' : '#FEF2F2', border: '1px solid ' + (bridge ? '#A7F3D0' : '#FECACA') }}>
        <span style={{ fontSize: 16 }}>{bridge == null ? '⏳' : bridge ? '✅' : '❌'}</span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: bridge ? '#059669' : '#DC2626' }}>
            {bridge == null ? 'Vérification…' : bridge ? 'Pont GPU natif présent (ML Kit)' : 'Pont GPU natif ABSENT'}
          </div>
          <div style={{ fontSize: 10.5, color: '#6A7585' }}>
            {bridge ? 'Ton tel peut traiter sur GPU/NPU.' : "Tu n'es pas sur l'APK GPU → OCR en CPU web."}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#6A7585', marginBottom: 4 }}>POOL DE TÉLÉPHONES</div>
      <div style={{ display: 'flex', background: '#F5F6F8', borderRadius: 10, marginBottom: 12 }}>
        <div style={cell}><div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80' }}>{pool.available_now}</div><div style={{ fontSize: 10, color: '#6A7585' }}>dispo</div></div>
        <div style={cell}><div style={{ fontSize: 20, fontWeight: 800 }}>{pool.registered}</div><div style={{ fontSize: 10, color: '#6A7585' }}>connus</div></div>
        <div style={cell}><div style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa' }}>{pool.good}</div><div style={{ fontSize: 10, color: '#6A7585' }}>💪 bons</div></div>
        <div style={cell}><div style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8' }}>{pool.charging}</div><div style={{ fontSize: 10, color: '#6A7585' }}>🔌 charge</div></div>
      </div>

      <div style={{ fontSize: 11, color: '#6A7585', marginBottom: 4 }}>PROGRESSION DES GPU</div>
      <div style={{ display: 'flex', background: '#F5F6F8', borderRadius: 10, marginBottom: 10 }}>
        <div style={cell}><div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>{queue.pending}</div><div style={{ fontSize: 10, color: '#6A7585' }}>en attente</div></div>
        <div style={cell}><div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>{queue.assigned}</div><div style={{ fontSize: 10, color: '#6A7585' }}>en cours</div></div>
        <div style={cell}><div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80' }}>{queue.done}</div><div style={{ fontSize: 10, color: '#6A7585' }}>finies</div></div>
        <div style={cell}><div style={{ fontSize: 18, fontWeight: 800 }}>{queue.activeWorkers}</div><div style={{ fontSize: 10, color: '#6A7585' }}>GPU actifs</div></div>
      </div>

      <div style={{ fontSize: 11, color: '#6A7585', marginBottom: 4 }}>PREUVE — QUI A TRAITÉ</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, borderRadius: 10, padding: '8px 6px', textAlign: 'center', background: queue.gpuNative ? '#ECFDF5' : '#F5F6F8', border: '1px solid ' + (queue.gpuNative ? '#A7F3D0' : '#E7EAF0') }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{queue.gpuNative}</div>
          <div style={{ fontSize: 10, color: '#6A7585' }}>⚡ GPU natif (ML Kit)</div>
        </div>
        <div style={{ flex: 1, borderRadius: 10, padding: '8px 6px', textAlign: 'center', background: '#F5F6F8', border: '1px solid #E7EAF0' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#9DAAB7' }}>{queue.cpuWeb}</div>
          <div style={{ fontSize: 10, color: '#6A7585' }}>🖥 CPU web (Tesseract)</div>
        </div>
      </div>

      {queue.batches.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9DAAB7', textAlign: 'center', padding: '6px 0' }}>Aucune tâche en cours.</div>
      ) : queue.batches.map((b) => {
        const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
        return (
          <div key={b.id} style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6A7585', marginBottom: 3 }}>
              <span>tâche …{b.id.slice(-6)}</span><span>{b.done}/{b.total} · {b.assigned} sur GPU</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: '#E7EAF0', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, background: 'linear-gradient(90deg,#8B5CF6,#22d3ee)', transition: 'width .4s' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
