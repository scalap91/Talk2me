// Talk2Me #386 — Splash screen pendant le mount initial (Pascal 2026-06-05)
// Affiché par Next.js durant les Suspense boundaries du root layout.
// Logo T2M centré sur fond noir, pulse subtil.

export default function Loading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a14]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-512.png"
        alt="Talk2Me"
        className="w-32 h-32 object-contain rounded-3xl animate-pulse"
      />
    </div>
  );
}
