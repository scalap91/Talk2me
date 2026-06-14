'use client';

/** Talk2Me — coque commune des pages Shop (header retour + titre). */
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function ShopPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0d] text-white max-w-md mx-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-white/8 bg-[#0a0a0d]/90 backdrop-blur-xl">
        <button onClick={() => router.back()} className="p-1 text-white/60 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-[16px] font-semibold">{title}</h1>
      </header>
      <div className="p-4">{children}</div>
    </div>
  );
}
