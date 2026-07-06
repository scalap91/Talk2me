'use client';

/**
 * Talk2Me — Import du répertoire (Pascal 2026-06-25).
 * Lit les contacts du tél (natif T2MContacts.read), demande au serveur qui est DÉJÀ
 * sur Talk2Me vs à inviter. Membres → Appeler. Non-membres → Inviter (partage natif
 * d'un simple lien pour rejoindre l'app — gratuit). PAS de parrainage, PAS de filleul.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ArrowLeft, Phone, Loader2, RefreshCw, Search, MessageSquare } from '@/lib/icons';

interface Member { id: string; username: string; display_name: string | null; avatar_url: string | null; name: string | null }
interface Invite { name: string | null; phone: string }
type NativeContacts = { read?: () => string };

export default function ContactsPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'perm' | 'done' | 'stale'>('idle');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myUser, setMyUser] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.user?.username) setMyUser(d.user.username); }).catch(() => {});
  }, []);

  const importContacts = useCallback(async () => {
    const inApp = /Talk2MeApp\//.test(navigator.userAgent || '');
    setPhase('loading');
    // Le pont natif peut se lier un court instant APRÈS le chargement (reload Capacitor).
    // On l'attend jusqu'à ~4s avant de conclure qu'il est absent.
    const get = () => (window as unknown as { T2MContacts?: NativeContacts }).T2MContacts;
    let native = get();
    for (let i = 0; i < 20 && !native?.read && inApp; i++) {
      await new Promise((r) => setTimeout(r, 200));
      native = get();
    }
    if (!native?.read) {
      setMembers([]); setInvites([]);
      // Hors APK (navigateur) = liste vide silencieuse. Dans l'APK sans pont = app à mettre à jour.
      setPhase(inApp ? 'stale' : 'done');
      return;
    }
    const raw = native.read();
    if (raw === 'PERM') { setPhase('perm'); return; }
    let contacts: Array<{ n?: string; p?: string }> = [];
    try { contacts = JSON.parse(raw || '[]'); } catch { contacts = []; }
    if (!contacts.length) { setPhase('done'); setMembers([]); setInvites([]); return; }
    try {
      const d = await fetch('/api/contacts/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts }),
      }).then((r) => r.json());
      if (d?.ok) { setMembers(d.on_t2m || []); setInvites(d.to_invite || []); }
    } catch { /* */ }
    setPhase('done');
  }, []);

  useEffect(() => { importContacts(); /* auto au montage */ }, [importContacts]);

  // Le natif prévient quand la permission CONTACTS vient d'être accordée → on relit direct.
  useEffect(() => {
    const onReady = () => importContacts();
    window.addEventListener('ttm:contacts:ready', onReady);
    return () => window.removeEventListener('ttm:contacts:ready', onReady);
  }, [importContacts]);

  async function call(member: Member) {
    try {
      const j = await fetch('/api/calls/new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callee_id: member.id, kind: 'audio' }),
      }).then((r) => r.json());
      if (j?.ok && j.call_id && j.callee) {
        window.dispatchEvent(new CustomEvent('ttm:call:start', { detail: { call_id: j.call_id, kind: 'audio', callee: j.callee } }));
      }
    } catch { /* */ }
  }

  // Invitation par SMS UNIQUEMENT. Dans l'APK : pont natif qui ouvre l'appli SMS PAR DÉFAUT
  // (WhatsApp ne peut PAS l'intercepter). Hors APK : lien sms: classique du navigateur.
  function invite(c: Invite) {
    if (!c.phone) return;
    const link = `${window.location.origin}/r/${myUser || ''}`;
    const msg = `Rejoins-moi sur Talk2Me 📱 — discute, appelle, vends/achète. Inscris-toi avec ton numéro : ${link}`;
    const native = (window as unknown as { T2MSms?: { sendSmsTo?: (n: string, b: string) => void } }).T2MSms;
    if (native?.sendSmsTo) { native.sendSmsTo(c.phone, msg); return; }
    const sep = /android/i.test(navigator.userAgent) ? '?' : '&';
    window.location.href = `sms:${c.phone}${sep}body=${encodeURIComponent(msg)}`;
  }

  const ql = q.trim().toLowerCase();
  const fMembers = ql ? members.filter((m) => `${m.name || ''} ${m.display_name || ''} ${m.username || ''}`.toLowerCase().includes(ql)) : members;
  const fInvites = ql ? invites.filter((c) => `${c.name || ''} ${c.phone || ''}`.toLowerCase().includes(ql)) : invites;

  return (
    <div className="flex flex-col h-[100svh] t2m-narrow bg-[#0e0e12] overflow-hidden">
      <header className="flex items-center h-14 px-3 border-b border-white/8 shrink-0">
        <button onClick={() => smartBack(router, '/friends')} aria-label="Retour" className="p-1.5 -ml-1.5 text-white/70 hover:text-white"><ArrowLeft size={22} /></button>
        <h1 className="ml-2 text-[16px] font-semibold text-white/95">Mes contacts</h1>
        <button onClick={importContacts} aria-label="Rafraîchir" className="ml-auto p-1.5 text-white/60 hover:text-white"><RefreshCw size={18} /></button>
      </header>

      {/* Barre de recherche du répertoire */}
      <div className="px-3 py-2 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-3.5 h-10 border border-white/10">
          <Search className="w-4 h-4 text-white/45" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un contact"
            className="flex-1 bg-transparent outline-none text-[14px] text-white placeholder-white/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {phase === 'loading' && <div className="flex justify-center py-16 text-white/50"><Loader2 className="w-6 h-6 animate-spin" /></div>}

        {phase === 'stale' && (
          <div className="px-6 py-16 text-center space-y-4">
            <p className="text-white/70 text-[14px]">Mets l&apos;application à jour pour activer l&apos;accès au répertoire.</p>
            <a href="https://dev.talk2me.fr/talk2me.apk" className="inline-block h-11 px-6 leading-[44px] rounded-full bg-white text-black text-[14px] font-semibold">Mettre à jour</a>
          </div>
        )}

        {phase === 'perm' && (
          <div className="px-6 py-16 text-center space-y-4">
            <p className="text-white/70 text-[14px]">Autorise l&apos;accès à tes contacts pour voir qui est déjà sur Talk2Me et inviter les autres.</p>
            <button onClick={importContacts} className="h-11 px-6 rounded-full bg-white text-black text-[14px] font-semibold">J&apos;ai autorisé → réessayer</button>
          </div>
        )}

        {phase === 'done' && (
          <>
            <SectionTitle>Sur Talk2Me · {fMembers.length}</SectionTitle>
            {fMembers.length === 0 && <Empty>{ql ? 'Aucun résultat.' : 'Aucun contact sur Talk2Me pour l’instant.'}</Empty>}
            {fMembers.map((m) => (
              <Row key={m.id} avatar={m.avatar_url} title={m.name || m.display_name || m.username} sub={`@${m.username}`}>
                <button onClick={() => call(m)} aria-label="Appeler" className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 grid place-items-center active:scale-95"><Phone size={18} /></button>
              </Row>
            ))}

            <SectionTitle>À inviter · {fInvites.length}</SectionTitle>
            {fInvites.length === 0 && <Empty>{ql ? 'Aucun résultat.' : 'Tous tes contacts sont déjà là 🎉'}</Empty>}
            {fInvites.map((c) => (
              <Row key={c.phone} avatar={null} title={c.name || c.phone} sub={c.name ? c.phone : 'À inviter'}>
                <button onClick={() => invite(c)} aria-label="Inviter par SMS" className="h-9 px-4 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[13px] inline-flex items-center gap-1.5 active:scale-95">
                  <MessageSquare size={15} /> Inviter
                </button>
              </Row>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-5 pb-2 text-[12px] uppercase tracking-wider text-white/40">{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 text-center text-white/40 text-[13px]">{children}</div>;
}
function Row({ avatar, title, sub, children }: { avatar: string | null; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center text-white/70 text-[15px] font-bold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (title[0] || '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white text-[14.5px] font-medium truncate">{title}</div>
        <div className="text-white/45 text-[12.5px] truncate">{sub}</div>
      </div>
      {children}
    </div>
  );
}
