import type { ReactNode } from 'react';
import { TerrenoFlameIcon } from './TerrenoFlameIcon';

export type StatusPillVariant =
  | 'in-progress'
  | 'reagendado'
  | 'pending'
  | 'success'
  | 'compro'
  | 'no-compro'
  | 'sin-interes'
  | 'nuevo'
  | 'contactado'
  | 'post-entrevista'
  | 'terreno'
  | 'caja-pendiente'
  | 'caja-ok'
  | 'caja-rechazo';

type Variant = StatusPillVariant;

const VARIANTS: Record<Variant, string> = {
  'in-progress': 'bg-brand-50 text-brand-700 border border-brand-100',
  'reagendado':  'bg-brand-50 text-brand-700 border border-brand-100',
  'pending':     'bg-zinc-100 text-zinc-600 border border-zinc-200',
  'success':     'bg-ok-subtle text-ok border border-ok-subtle',
  'compro':      'bg-zinc-900 text-white border border-zinc-900',
  'no-compro':   'bg-zinc-900 text-white border border-red-500',
  'sin-interes': 'bg-zinc-100 text-zinc-400 border border-zinc-200',
  'nuevo':       'bg-ok-subtle text-ok border border-ok-subtle',
  'contactado':  'bg-amber-50 text-amber-700 border border-amber-200',
  'post-entrevista': 'bg-orange-50 text-orange-700 border border-orange-200',
  'terreno':     'bg-red-50 text-red-700 border border-red-300 shadow-sm shadow-red-100/80',
  'caja-pendiente': 'bg-sky-50 text-sky-800 border border-sky-200',
  'caja-ok':        'bg-emerald-50 text-emerald-800 border border-emerald-200',
  'caja-rechazo':   'bg-rose-50 text-rose-800 border border-rose-200',
};

const DOT_COLORS: Record<Variant, string> = {
  'in-progress': 'bg-brand-600',
  'reagendado':  'bg-brand-600',
  'pending':     'bg-zinc-400',
  'success':     'bg-ok',
  'compro':      'bg-white',
  'no-compro':   'bg-red-500',
  'sin-interes': 'bg-zinc-400',
  'nuevo':       'bg-ok',
  'contactado':  'bg-amber-500',
  'post-entrevista': 'bg-orange-500',
  'terreno':     'bg-red-500',
  'caja-pendiente': 'bg-sky-500',
  'caja-ok':        'bg-emerald-500',
  'caja-rechazo':   'bg-rose-500',
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
      {dot && variant === 'terreno' && <TerrenoFlameIcon size={12} />}
      {dot && variant !== 'terreno' && (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
