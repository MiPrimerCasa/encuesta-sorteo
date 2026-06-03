import {
  etiquetaRolHistorial,
  formatHistorialFecha,
} from '../../domain/seguimiento-historial';
import type { SeguimientoHistorialEntry } from '../../types';

interface LeadHistorialInlineProps {
  historial: SeguimientoHistorialEntry[];
  /** Tarjeta oscura (no compró). */
  esNoCompro?: boolean;
  maxItems?: number;
}

export function LeadHistorialInline({
  historial,
  esNoCompro = false,
  maxItems = 4,
}: LeadHistorialInlineProps) {
  if (!historial.length) return null;

  const items = historial.slice(0, maxItems);
  const textoSec = esNoCompro ? 'text-zinc-400' : 'text-zinc-500';
  const textoPri = esNoCompro ? 'text-zinc-200' : 'text-zinc-800';

  return (
    <div
      className={`mt-3 border-t pt-3 ${esNoCompro ? 'border-zinc-600' : 'border-zinc-200/80'}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ol className="space-y-2">
        {items.map((entry, index) => (
          <li key={entry.id} className="leading-snug">
            <p className={`text-[12px] font-medium ${textoPri}`}>{entry.estadoEtiqueta}</p>
            <p className={`text-[11px] ${textoSec}`}>
              {formatHistorialFecha(entry.creadoEn)}
              {' · '}
              {etiquetaRolHistorial(entry.operadorRol)}: {entry.operadorNombre}
              {index === 0 && (
                <span className={esNoCompro ? ' text-zinc-300' : ' text-brand-700'}> · actual</span>
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
