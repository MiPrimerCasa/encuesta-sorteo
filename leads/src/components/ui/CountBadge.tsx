interface CountBadgeProps {
  count: number;
  className?: string;
}

export function CountBadge({ count, className = '' }: CountBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-500 ${className}`}
      aria-label={`${count}`}
    >
      {count}
    </span>
  );
}
