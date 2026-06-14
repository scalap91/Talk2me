'use client';

import { useEffect, useState } from 'react';

type Slide = {
  title: string;
  subtitle: string;
  cta: string;
};

const SLIDES: Slide[] = [
  {
    title: 'Tendances',
    subtitle: 'Les nouveautés de la saison',
    cta: 'Acheter maintenant',
  },
  {
    title: 'Nouveautés',
    subtitle: 'Les pièces qui font le buzz',
    cta: 'Acheter maintenant',
  },
  {
    title: 'Sélection',
    subtitle: 'Nos coups de cœur du moment',
    cta: 'Acheter maintenant',
  },
];

export default function SheinHero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mx-3 h-40 overflow-hidden rounded-2xl">
      {SLIDES.map((slide, i) => (
        <div
          key={i}
          className={`absolute inset-0 flex flex-col justify-center bg-gradient-to-br from-red-500 via-red-600 to-red-500 p-5 transition-opacity duration-700 ${
            i === active ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={i !== active}
        >
          <h2 className="text-2xl font-extrabold text-white">{slide.title}</h2>
          <p className="text-sm text-white/90">{slide.subtitle}</p>
          <button
            type="button"
            className="mt-2 w-fit rounded-full bg-white px-4 py-2 text-sm font-semibold text-red-600"
          >
            {slide.cta}
          </button>
        </div>
      ))}

      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Aller à la diapositive ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
