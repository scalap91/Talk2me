'use client';

/**
 * Talk2Me — CM assisté (groupe Facebook). L'IA prépare le post ; tu copies + colles dans
 * le groupe (l'API groupe est fermée par Meta → pas d'auto-post, zéro risque de ban).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Copy, Check, ExternalLink, Download } from 'lucide-react';

interface Post { annonce_id: string; title: string; text: string; comment: string; image_abs: string | null; created_at: number }

export default function AdminCM() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [copied, setCopied] = useState('');
  const [copiedC, setCopiedC] = useState('');
  const [groupUrl, setGroupUrl] = useState('');

  const load = () => fetch('/api/admin/cm', { cache: 'no-store' }).then((r) => {
    if (r.status === 403) { setForbidden(true); return null; }
    return r.json();
  }).then((d) => { if (d?.posts) setPosts(d.posts); }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); try { setGroupUrl(localStorage.getItem('t2m_fb_group_url') || ''); } catch { /* */ } }, []);

  const copy = async (p: Post) => {
    try { await navigator.clipboard.writeText(p.text); setCopied(p.annonce_id); setTimeout(() => setCopied(''), 1500); } catch { /* */ }
  };
  const copyComment = async (p: Post) => {
    try { await navigator.clipboard.writeText(p.comment); setCopiedC(p.annonce_id); setTimeout(() => setCopiedC(''), 1500); } catch { /* */ }
  };
  const done = async (id: string) => {
    const d = await fetch('/api/admin/cm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ annonce_id: id }) }).then((r) => r.json());
    if (d?.posts) setPosts(d.posts);
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#0e0e14] text-white/60"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (forbidden) return <div className="fixed inset-0 grid place-items-center bg-[#0e0e14] text-white/60 text-sm">Réservé aux super-admins.</div>;

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white px-4 py-6 max-w-xl mx-auto">
      <button onClick={() => router.back()} className="text-white/50 text-sm mb-3">← Retour</button>
      <h1 className="text-xl font-bold mb-1">CM assisté — groupe Facebook</h1>
      <p className="text-[13px] text-white/55 mb-4">Pour chaque annonce : <b>① copie le post</b> + l'image → publie dans le groupe → <b>② colle le lien en 1er commentaire</b>. Le lien va en commentaire (pas dans le post) pour que Facebook montre ton post à plus de monde. (Pas d'auto-post groupe = on évite le ban Meta.)</p>

      <div className="flex gap-2 mb-5">
        <input value={groupUrl} onChange={(e) => { setGroupUrl(e.target.value); try { localStorage.setItem('t2m_fb_group_url', e.target.value); } catch { /* */ } }}
          placeholder="Colle l'URL de ton groupe FB" className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-amber-400/50" />
        {groupUrl && <a href={groupUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-[#1877F2] text-white text-[13px] font-semibold inline-flex items-center gap-1.5"><ExternalLink className="w-4 h-4" /> Groupe</a>}
      </div>

      {posts.length === 0 ? (
        <p className="text-white/40 py-10 text-center">Aucune annonce à publier pour l'instant. Dès qu'une annonce est publiée, son post apparaît ici.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <div key={p.annonce_id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              {p.image_abs && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_abs} alt="" className="w-full h-44 object-cover rounded-xl mb-3 border border-white/10" />
              )}
              <div className="text-[11px] text-white/45 mb-1">① Le POST (corps) :</div>
              <pre className="whitespace-pre-wrap text-[13px] text-white/90 font-sans bg-black/30 rounded-xl p-3 border border-white/10">{p.text}</pre>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => copy(p)} className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-[13px]">
                  {copied === p.annonce_id ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le post</>}
                </button>
                {p.image_abs && (
                  <a href={p.image_abs} target="_blank" rel="noreferrer" download className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/10 text-white text-[13px]"><Download className="w-4 h-4" /> Image</a>
                )}
              </div>
              <div className="text-[11px] text-white/45 mt-3 mb-1">② Le 1er COMMENTAIRE (le lien — à coller en commentaire APRÈS avoir publié) :</div>
              <pre className="whitespace-pre-wrap text-[12px] text-sky-200/90 font-sans bg-black/30 rounded-xl p-3 border border-white/10">{p.comment}</pre>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => copyComment(p)} className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-200 font-semibold text-[13px]">
                  {copiedC === p.annonce_id ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le commentaire</>}
                </button>
                <button onClick={() => done(p.annonce_id)} className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 text-[13px]"><Check className="w-4 h-4" /> Publié</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
