/**
 * /infos/[doc] — Pages institutionnelles (Phase 1.3) : à-propos, contact, FAQ.
 * Même rendu que /legal. Server component, public.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInfoDoc, INFO_DOCS, LEGAL_UPDATED } from '@/lib/legal/content';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return INFO_DOCS.map((d) => ({ doc: d.slug }));
}

function inline(text: string, k: number) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${k}-${i}`} className="text-white font-semibold">{p.slice(2, -2)}</strong>
      : <span key={`${k}-${i}`}>{p}</span>
  );
}

function render(body: string) {
  const lines = body.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(<ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 my-2 text-white/70 text-[14px]">{list.map((li, i) => <li key={i}>{inline(li, out.length * 100 + i)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const l = raw.trim();
    if (l.startsWith('### ')) { flush(); out.push(<h3 key={idx} className="text-[15px] font-semibold text-white mt-5 mb-1.5">{inline(l.slice(4), idx)}</h3>); }
    else if (l.startsWith('## ')) { flush(); out.push(<h2 key={idx} className="text-[16.5px] font-bold text-white mt-6 mb-2">{inline(l.slice(3), idx)}</h2>); }
    else if (l.startsWith('- ') || l.startsWith('* ')) { list.push(l.slice(2)); }
    else if (l === '') { flush(); }
    else { flush(); out.push(<p key={idx} className="text-white/70 text-[14px] leading-relaxed my-2">{inline(l, idx)}</p>); }
  });
  flush();
  return out;
}

export default async function InfoDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = getInfoDoc(doc);
  if (!d) notFound();
  return (
    <main className="min-h-[100svh] bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-10 bg-[#0e0e12]/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Link href="/legal" aria-label="Retour" className="w-9 h-9 -ml-1 rounded-full grid place-items-center text-white/80 hover:bg-white/10">‹</Link>
        <h1 className="text-[16px] font-bold truncate">{d.title}</h1>
      </header>
      <article className="max-w-2xl mx-auto px-4 py-5 pb-20">
        {render(d.body)}
        <p className="text-white/30 text-[11px] mt-8 border-t border-white/10 pt-4">
          Talk2Me · GeniusWeb · pascal.repir@gmail.com — mis à jour le {LEGAL_UPDATED}.
        </p>
      </article>
    </main>
  );
}
