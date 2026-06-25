'use client';

/**
 * Talk2Me — Import du répertoire (Pascal 2026-06-25, parrainage B2).
 * Lit les contacts du tél (natif T2MContacts.read), demande au serveur qui est DÉJÀ
 * sur Talk2Me vs à INVITER. Membres → Appeler. Non-membres → Inviter (partage du lien
 * de parrainage via le propre WhatsApp/SMS de l'user — gratuit, B3).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, UserPlus, Loader2, RefreshCw, Share2 } from 'lucide-react';

interface Member { id: string; username: string; display_name: string | null; avatar_url: string | null; name: string | null }
interface Invite { name: string | null; phone: string }
type NativeContacts = { read?: () => string };

export default function ContactsPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'perm' | 'noapp' | 'done'>('idle');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myUser, setMyUser] = useState<string>('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.user?.username) setMyUser(d.user.username); }).catch(() => {});
  }, []);

  const importContacts = useCallback(async () => {
    const native = (window as unknown as { T2MContacts?: NativeContacts }).T2MContacts;
    if (!native?.read) { setPhase('noapp'); return; }
    setPhase('loading');
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

  function invite(c: Invite) {
    const link = `${window.location.origin}/r/${myUser}`;
    const msg = `Rejoins-moi sur Talk2Me 📱 — discute, appelle, vends/achète. Inscris-toi avec ton numéro : ${link}`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) nav.share({ text: msg }).catch(() => {});
    else { navigator.clipboard?.writeText(msg).catch(() => {}); alert('Lien d\'invitation copié — colle-le dans WhatsApp/SMS.'); }
  }

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md lg:max-w-lg mx-auto bg-[#0e0e12] overflow-hidden">
      <header className="flex items-center h-14 px-3 border-b border-white/8 shrink-0">
        <button onClick={() => router.back()} aria-label="Retour" className="p-1.5 -ml-1.5 text-white/70 hover:text-white"><ArrowLeft size={22} /></button>
        <h1 className="ml-2 text-[16px] font-semibold text-white/95">Mes contacts</h1>
        <button onClick={importContacts} aria-label="Rafraîchir" className="ml-auto p-1.5 text-white/60 hover:text-white"><RefreshCw size={18} /></button>
      </header>

      <div className="flex-1 overflow-y-auto pb-6">
        {phase === 'loading' && <div className="flex justify-center py-16 text-white/50"><Loader2 className="w-6 h-6 animate-spin" /></div>}

        {phase === 'noapp' && (
          <div className="px-6 py-16 text-center text-white/60 text-[14px]">
            L&apos;import du répertoire est disponible <b className="text-white/90">dans l&apos;application Talk2Me</b> (Android).
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
            <SectionTitle>Sur Talk2Me · {members.length}</SectionTitle>
            {members.length === 0 && <Empty>Aucun contact sur Talk2Me pour l&apos;instant.</Empty>}
            {members.map((m) => (
              <Row key={m.id} avatar={m.avatar_url} title={m.name || m.display_name || m.username} sub={`@${m.username}`}>
                <button onClick={() => call(m)} aria-label="Appeler" className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 grid place-items-center active:scale-95"><Phone size={18} /></button>
              </Row>
            ))}

            <SectionTitle>À inviter · {invites.length}</SectionTitle>
            {invites.length === 0 && <Empty>Tous tes contacts sont déjà là 🎉</Empty>}
            {invites.map((c) => (
              <Row key={c.phone} avatar={null} title={c.name || c.phone} sub={c.name ? c.phone : 'À inviter'}>
                <button onClick={() => invite(c)} className="h-9 px-3 rounded-full bg-white/[0.06] border border-white/12 text-white/85 text-[13px] inline-flex items-center gap-1.5 active:scale-95">
                  <Share2 size={15} /> Inviter
                </button>
              </Row>
            ))}
            <p className="text-center text-[11px] text-white/35 px-8 pt-4">Inviter envoie ton lien de parrainage via TON WhatsApp/SMS. Ton filleul te sera rattaché à son inscription.</p>
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
