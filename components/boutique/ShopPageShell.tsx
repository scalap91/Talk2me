'use client';

/** Talk2Me — coque commune des pages Shop (header retour + titre). */
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ChevronLeft } from '@/lib/icons';
import ShopNav from '@/components/shop/ShopNav';

export default function ShopPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] flex flex-col">
      <ShopNav />
      <div className="flex-1 max-w-md w-full mx-auto pb-24 md:pb-6">
        <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/90 backdrop-blur-xl">
          <button onClick={() => smartBack(router, '/shop')} className="p-1 text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-[16px] font-semibold">{title}</h1>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
