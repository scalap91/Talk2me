'use client';

type CategoryCircle = {
  name: string;
  image: string | null;
};

export default function CategoryCircles(props: {
  categories: CategoryCircle[];
  onPick: (name: string) => void;
}) {
  const { categories, onPick } = props;

  if (!categories.length) return null;

  return (
    <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto px-3 pb-1">
      {categories.map((cat) => {
        const initial = cat.name.trim().charAt(0).toUpperCase() || '?';
        return (
          <button
            key={cat.name}
            type="button"
            onClick={() => onPick(cat.name)}
            className="flex w-[18%] min-w-[64px] flex-col items-center gap-1.5"
          >
            <span className="h-16 w-16 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200">
              {cat.image ? (
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-red-100 text-base font-bold text-red-500">
                  {initial}
                </span>
              )}
            </span>
            <span className="line-clamp-1 text-center text-[11px] text-neutral-600">
              {cat.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
