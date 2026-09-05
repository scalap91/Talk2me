import type { GeniusInputProps } from '../generated/types';

/** GeniusInput — champ texte contrôlé. Rendu <input> natif (autocomplete, clavier adapté). */
export function GeniusInput({ value = '', placeholder, type = 'text', disabled = false, invalid = false, onChange }: GeniusInputProps) {
  return (
    <input
      className="gu-input"
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      data-invalid={invalid}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
