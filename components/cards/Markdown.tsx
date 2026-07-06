'use client';
/**
 * Markdown — rendu « notebook » d'un contenu markdown (Pascal 2026-07-04).
 * Transforme le markdown de Léa (## titres, **gras**, listes, tableaux, ![images]) en un
 * document propre style Notion/notebook. Thème-aware (clair/sombre). Utilisé pour le
 * contenu des modules de formation (lecteur + écran de validation).
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children, light = false }: { children: string; light?: boolean }) {
  const b = light ? 'border-neutral-200' : 'border-white/15';
  const strong = light ? 'text-neutral-900 font-semibold' : 'text-white font-semibold';
  const head = light ? 'text-neutral-900' : 'text-white';
  return (
    <div className={`text-[14px] leading-relaxed ${light ? 'text-neutral-800' : 'text-white/85'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className={`text-[19px] font-bold mt-4 mb-2 ${head}`} {...p} />,
          h2: (p) => <h2 className={`text-[16px] font-bold mt-4 mb-1.5 ${head}`} {...p} />,
          h3: (p) => <h3 className={`text-[14.5px] font-semibold mt-3 mb-1 ${light ? 'text-neutral-800' : 'text-white/90'}`} {...p} />,
          p: (p) => <p className="my-1.5" {...p} />,
          strong: (p) => <strong className={strong} {...p} />,
          em: (p) => <em {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...p} />,
          li: (p) => <li className="my-0.5" {...p} />,
          blockquote: (p) => <blockquote className={`border-l-4 pl-3 py-1 my-2 rounded-r ${light ? 'border-violet-300 bg-violet-50' : 'border-violet-400 bg-white/5'}`} {...p} />,
          code: (p) => <code className={`px-1 py-0.5 rounded text-[12.5px] ${light ? 'bg-neutral-100 text-neutral-800' : 'bg-white/10 text-white'}`} {...p} />,
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          img: (p) => <img className={`my-3 rounded-lg max-w-full border ${b}`} loading="lazy" {...p} />,
          table: (p) => <div className="overflow-x-auto my-2"><table className="w-full text-[13px] border-collapse" {...p} /></div>,
          th: (p) => <th className={`border ${b} px-2 py-1 text-left font-semibold ${light ? 'bg-neutral-100' : 'bg-white/5'}`} {...p} />,
          td: (p) => <td className={`border ${b} px-2 py-1`} {...p} />,
          hr: () => <hr className={`my-3 ${b}`} />,
          a: (p) => <a className="text-violet-500 underline" target="_blank" rel="noreferrer" {...p} />,
        }}
      >{children}</ReactMarkdown>
    </div>
  );
}
