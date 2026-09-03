import {
  badgesFotosCierrePij,
  type BadgeFotoCierrePij,
} from '../../domain/imagenes-cierre-pij';
import type { FormaPago } from '../../types';

function ChipFoto({ badge }: { badge: BadgeFotoCierrePij }) {
  if (!badge.aplica) return null;
  const ok = badge.cargada;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-rose-300 bg-rose-50 text-rose-800'
      }`}
      title={ok ? `${badge.label}: cargada` : `${badge.label}: sin cargar`}
    >
      {badge.label}
    </span>
  );
}

/** ADH · ANEXO · DNI · COMPROBANTE — verde si hay foto, rojo si falta. */
export function BadgesFotosCierrePij({
  ventaKey = 'principal',
  formaPago,
  imagenes,
  className = '',
}: {
  ventaKey?: string;
  formaPago?: FormaPago | null;
  imagenes?: { ventaKey: string; tipo: string }[] | null;
  className?: string;
}) {
  const badges = badgesFotosCierrePij(ventaKey, formaPago, imagenes);
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {badges.map((b) => (
        <ChipFoto key={b.key} badge={b} />
      ))}
    </div>
  );
}
