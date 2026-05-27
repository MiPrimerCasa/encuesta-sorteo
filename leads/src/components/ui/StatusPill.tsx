import type { ReactNode } from 'react';

type Variant = 'in-progress' | 'reagendado' | 'pending' | 'success' | 'compro' | 'sin-interes' | 'nuevo';

const VARIANTS: Record<Variant, string> = {
  'in-progress': 'bg-brand-50 text-brand-700 border border-brand-100',
  'reagendado':  'bg-brand-50 text-brand-700 border border-brand-100',
  'pending':     'bg-zinc-100 text-zinc-600 border border-zinc-200',
  'success':     'bg-ok-subtle text-ok border border-ok-subtle',
  'compro':      'bg-zinc-900 text-white border border-zinc-900',
  'sin-interes': 'bg-zinc-100 text-zinc-400 border border-zinc-200',
  'nuevo':       'bg-ok-subtle text-ok border border-ok-subtle',
};

const DOT_COLORS: Record<Variant, string> = {
  'in-progress': 'bg-brand-600',
  'reagendado':  'bg-brand-600',
  'pending':     'bg-zinc-400',
  'success':     'bg-ok',
  'compro':      'bg-white',
  'sin-interes': 'bg-zinc-400',
  'nuevo':       'bg-ok',
};

interface StatusPillProps {
  children: ReactNode;
  variant?: Variant;
  dot?: boolean;
}

export function StatusPill({ children, variant = 'pending', dot = false }: StatusPillProps) {
  const variantClass = VARIANTS[variant] ?? VARIANTS.pending;
  const dotColor = DOT_COLORS[variant] ?? 'bg-zinc-400';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] leading-none whitespace-nowrap ${variantClass}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
