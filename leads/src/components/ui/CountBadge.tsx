/** Badge circular blanco con número rojo (estilo Mi Primer Casa) */
type BadgeSize = 'sm' | 'md' | 'lg';

interface CountBadgeProps {
  count: number;
  className?: string;
  size?: BadgeSize;
}

export function CountBadge({ count, className = '', size = 'md' }: CountBadgeProps) {
  const sizes: Record<BadgeSize, string> = {
    sm: 'h-7 min-w-7 text-base',
    md: 'h-8 min-w-8 text-lg',
    lg: 'h-9 min-w-9 text-xl',
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white font-bold leading-none text-brand shadow-md ring-2 ring-brand/15 ${sizes[size]} ${className}`}
      aria-label={`${count}`}
    >
      {count}
    </span>
  );
}
