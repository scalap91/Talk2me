'use client';
/**
 * /compute/me — « Mon mobile est-il un bon ouvrier ? » (Pascal 2026-07-04).
 * Détecte les capacités de l'appareil, les envoie au serveur, et affiche le verdict :
 * type de mobile + bon/moyen/faible candidat pour le compute mesh.
 */
import { useState, useEffect } from 'react';
import { getDeviceProfile, type DeviceProfile } from '@/lib/compute/device-profile';

interface Verdict { tier: 'good' | 'medium' | 'weak'; score: number; reasons: string[]; is_worker: boolean }

const TIER = {
  good: { label: 'BON candidat 💪', color: '#1B8A56', bg: '#E7F7EE' },
  medium: { label: 'candidat MOYEN', color: '#B26A00', bg: '#FFF4E5' },
  weak: { label: 'candidat FAIBLE', color: '#6A7585', bg: '#F0F2F5' },
};

export default function ComputeMe() {
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p = await getDeviceProfile();
        setProfile(p);
        const r = await fetch('/api/compute/worker', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        const d = await r.json();
        if (r.ok && d.ok) setVerdict(d); else setErr(d.error || 'Erreur serveur');
      } catch { setErr('Détection impossible sur cet appareil.'); }
    })();
  }, []);

  const t = verdict ? TIER[verdict.tier] : null;

  return (
    <div style={{ minHeight: '100dvh', background: '#0b0b0f', color: '#fff', padding: 20, fontFamily: "'Inter',sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>🧠 Mon mobile · ouvrier de calcul</h1>
      <p style={{ fontSize: 13, color: '#8b93a7', marginTop: 4 }}>Compute mesh T2M — détection des capacités de ton appareil.</p>

      {err && <div style={{ marginTop: 16, padding: 12, background: '#3a1620', color: '#ffb3b3', borderRadius: 12 }}>{err}</div>}

      {!verdict && !err && <div style={{ marginTop: 30, textAlign: 'center', color: '#8b93a7' }}>Détection en cours…</div>}

      {t && (
        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: t.bg, color: t.color, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{t.label}</div>
          <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85 }}>Score : {verdict!.score}/100 · {verdict!.is_worker ? 'utilisable comme ouvrier' : 'pas retenu pour le calcul'}</div>
        </div>
      )}

      {verdict && (
        <div style={{ marginTop: 14, padding: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8b93a7', marginBottom: 8 }}>POURQUOI</div>
          {verdict.reasons.map((r, i) => <div key={i} style={{ fontSize: 14, padding: '3px 0' }}>• {r}</div>)}
        </div>
      )}

      {profile && (
        <div style={{ marginTop: 14, padding: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, fontSize: 13.5, lineHeight: 1.7 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8b93a7', marginBottom: 8 }}>TON APPAREIL</div>
          <div>Plateforme : <b>{profile.platform}</b> {profile.native ? '(app native ✅)' : '(web)'}</div>
          <div>WebGPU : <b style={{ color: profile.webgpu ? '#4ade80' : '#f87171' }}>{profile.webgpu ? 'oui' : 'non'}</b></div>
          <div>GPU : <b>{profile.gpu || '—'}</b></div>
          <div>Cœurs CPU : <b>{profile.cores || '—'}</b></div>
          <div>RAM : <b>{profile.memory_gb ? profile.memory_gb + ' Go' : '—'}</b></div>
          <div>En charge : <b>{profile.charging == null ? '—' : profile.charging ? 'oui 🔌' : 'non'}</b></div>
        </div>
      )}
    </div>
  );
}
