'use client';
/**
 * /apercu — PAGE PUBLIQUE de démonstration du nouveau design clair « L'Éclat du
 * Quotidien » (Pascal 2026-07-01 : « on voit rien de ton travail »). Aperçu du
 * Hub en cartes alignées claires, ouvrable sur mobile sans login. Autonome
 * (aucune dépendance auth/data) → montre le rendu réel dans le stack T2M.
 * Jetable / déplaçable une fois la vraie migration finie.
 */
import { useState } from 'react';

const G = {
  o: 'linear-gradient(135deg,#FFB347,#FF7F11)', v: 'linear-gradient(135deg,#7C5CFF,#5E80FE)',
  g: 'linear-gradient(135deg,#2ECC71,#22a35b)', b: 'linear-gradient(135deg,#5b8def,#3a5fd9)',
};
const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
type Post = { id: string; kind: string; name: string; ini: string; grad: string; time: string; ai?: boolean; cap?: string; l: number; c: number; photo?: string; products?: string[]; price?: string; emoji?: string; title?: string; mid?: string; artist?: string };
const KIND: Record<string, [string, string, string]> = {
  image: ['#eef1f5', '#6A7585', 'PHOTO'], boutique: ['rgba(255,127,17,.12)', '#FF7F11', 'BOUTIQUE'],
  plat: ['rgba(255,127,17,.12)', '#e0680f', 'PLAT MAISON'], music: ['#eae6ff', '#7C5CFF', 'MUSIQUE'], salle: ['#ece8ff', '#7C5CFF', 'SALLE 3D'],
};
const POSTS: Post[] = [
  { id: '1', kind: 'image', name: 'Miora R.', ini: 'M', grad: G.o, time: '12 min', cap: 'Coucher de soleil sur Tana 🌅', l: 42, c: 6, photo: 'linear-gradient(135deg,#ffb347,#ff7f11 60%,#7c3aed)' },
  { id: '2', kind: 'boutique', name: 'Chez Miora', ini: 'C', grad: G.o, time: '1 h', cap: 'Nouveaux paniers en raphia 🧺', l: 31, c: 9, products: ['🧺', '👜', '👒'], price: 'à partir de 18 000 Ar' },
  { id: '3', kind: 'music', name: 'Pascal', ini: 'P', grad: G.v, time: '2 h', cap: 'En boucle en ce moment 🎧', l: 18, c: 3, title: 'Hymn For The Weekend', artist: 'Coldplay', mid: 'YykjpeuMNEk' },
  { id: '4', kind: 'plat', name: 'Mama Ravaka', ini: 'M', grad: G.g, time: '3 h', cap: 'Romazava tout chaud 🍲', l: 57, c: 14, emoji: '🍲', title: 'Romazava maison', price: '9 000 Ar' },
  { id: '5', kind: 'salle', name: 'Naina', ini: 'N', grad: G.b, time: '5 h', cap: 'Entre dans ma pièce ✨', l: 23, c: 5 },
];

function Card({ p }: { p: Post }) {
  const k = KIND[p.kind];
  return (
    <article className="bg-white rounded-[18px] shadow-[0_4px_16px_rgba(47,52,58,0.06)] mb-4 overflow-hidden">
      <header className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
        <div className="w-10 h-10 rounded-full grid place-items-center text-white font-semibold text-[16px] shrink-0" style={{ background: p.grad }}>{p.ini}</div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-[14.5px] text-[#2F343A]">{p.name}{p.ai && <span className="text-[#7C5CFF] text-[11px] ml-1">✨ Léa</span>}</div><div className="text-[11.5px] text-[#9DAAB7]">{p.time}</div></div>
        <span className="text-[10px] font-bold px-2 py-[3px] rounded-[7px]" style={{ background: k[0], color: k[1] }}>{k[2]}</span>
      </header>
      {p.cap && <p className="px-3.5 pb-2.5 text-[14px] leading-[1.45] text-[#2F343A]">{p.cap}</p>}
      {p.kind === 'image' && <div className="h-[210px]" style={{ background: p.photo }} />}
      {p.kind === 'boutique' && (<>
        <div className="flex gap-2.5 px-3.5 pb-3">{p.products!.map((e, i) => <div key={i} className="flex-1 rounded-xl grid place-items-center text-[34px]" style={{ aspectRatio: '1', background: 'radial-gradient(circle at 50% 40%,#fff,#eef1f5)', boxShadow: '0 3px 8px rgba(0,0,0,.06)' }}>{e}</div>)}</div>
        <div className="px-3.5 pb-3 font-bold text-[15px] text-[#FF7F11]">{p.price}</div>
        <div className="mx-3.5 mb-3.5 text-center font-semibold text-[14px] py-2.5 rounded-xl" style={{ background: 'rgba(255,127,17,.1)', color: '#FF7F11' }}>Voir la boutique</div></>)}
      {p.kind === 'music' && (<div className="flex items-center gap-3 mx-3.5 mb-3 rounded-[14px] p-2.5" style={{ background: 'linear-gradient(135deg,#1c1e2e,#0d0e16)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={yt(p.mid!)} alt="" className="w-[60px] h-[60px] rounded-[10px] object-cover shrink-0" />
        <div className="flex-1 min-w-0 text-white"><div className="font-semibold text-[14px]">{p.title}</div><div className="text-[12px] text-white/60">{p.artist} · via YouTube</div></div>
        <div className="w-[38px] h-[38px] rounded-full grid place-items-center text-white shrink-0" style={{ background: '#FF7F11' }}>▶</div></div>)}
      {p.kind === 'plat' && (<>
        <div className="flex gap-3 px-3.5 pb-3"><div className="w-[84px] h-[84px] rounded-[14px] grid place-items-center text-[42px] shrink-0" style={{ background: 'radial-gradient(circle at 50% 40%,#FFF3E4,#FFE0B8)' }}>{p.emoji}</div><div className="flex-1 flex flex-col justify-center"><div className="font-bold text-[16px] text-[#2F343A]">{p.title}</div><div className="font-bold text-[#FF7F11] mt-1">{p.price}</div></div></div>
        <div className="mx-3.5 mb-3.5 text-center font-semibold text-[14px] py-2.5 rounded-xl text-white shadow-[0_6px_16px_rgba(255,127,17,0.3)]" style={{ background: '#FF7F11' }}>Commander</div></>)}
      {p.kind === 'salle' && (<div className="mx-3.5 mb-3 h-[150px] rounded-[14px] relative overflow-hidden grid place-items-center" style={{ background: 'radial-gradient(60% 60% at 50% 40%,#2a2340,#12101c)' }}><div className="w-14 h-14 rounded-full" style={{ background: 'radial-gradient(circle at 50% 35%,#b9a9ff,#5e80fe)', boxShadow: '0 0 30px rgba(124,92,255,.6)' }} /><div className="absolute bottom-2.5 inset-x-2.5 text-center text-white font-semibold text-[13px] py-2.5 rounded-[10px]" style={{ background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,.2)' }}>✨ Entrer dans la pièce</div></div>)}
      <div className="flex gap-[18px] px-4 py-2.5 text-[13px] font-medium text-[#6A7585]"><span className="text-[#FF7F11]">❤ {p.l}</span><span>💬 {p.c}</span><span>↗ Partager</span></div>
    </article>
  );
}

export default function Apercu() {
  const [tab, setTab] = useState('Tout');
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F5F6F8]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@400;500;600&display=swap');*{font-family:'Inter',system-ui,sans-serif}`}</style>
      <div className="sticky top-0 z-10 px-4 pt-4 pb-2" style={{ background: 'rgba(245,246,248,.92)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center"><div className="text-[22px] font-bold text-[#FF7F11]" style={{ fontFamily: "'Outfit',sans-serif" }}>T2M</div>
          <div className="ml-auto flex gap-2"><div className="w-9 h-9 rounded-full bg-white border border-[#E7EAF0] grid place-items-center">🔍</div><div className="w-9 h-9 rounded-full bg-white border border-[#E7EAF0] grid place-items-center relative">🔔<span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#FF7F11] border-2 border-white" /></div></div></div>
        <div className="flex gap-2 pt-3">
          {['Tout', 'Amis', 'Populaire'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={'font-semibold text-[14px] px-4 py-[7px] rounded-full border ' + (tab === t ? 'text-white border-transparent' : 'text-[#6A7585] bg-white border-[#E7EAF0]')} style={tab === t ? { background: '#FF7F11' } : undefined}>{t}</button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-3 pb-6">
        <div className="mb-3 rounded-xl px-3 py-2 text-[12px] text-[#6A7585]" style={{ background: 'rgba(124,92,255,.08)', border: '1px solid rgba(124,92,255,.25)' }}>✨ Aperçu du nouveau design clair « L'Éclat du Quotidien » — Hub en cartes alignées.</div>
        {POSTS.map((p) => <Card key={p.id} p={p} />)}
      </div>
      <div className="fixed left-0 right-0 bottom-0 h-16 flex items-center" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(14px)', borderTop: '1px solid #E7EAF0' }}>
        {['🌐', '💬'].map((i, x) => <div key={x} className="flex-1 grid place-items-center text-[21px]" style={{ color: x === 0 ? '#FF7F11' : '#9DAAB7' }}>{i}</div>)}
        <div className="w-[52px] h-[52px] mx-1.5 rounded-[18px] grid place-items-center text-white text-[26px] shrink-0" style={{ background: '#FF7F11', boxShadow: '0 8px 20px rgba(255,127,17,.42)', transform: 'translateY(-8px)' }}>＋</div>
        {['🗂', '👤'].map((i, x) => <div key={x} className="flex-1 grid place-items-center text-[21px] text-[#9DAAB7]">{i}</div>)}
      </div>
    </div>
  );
}
