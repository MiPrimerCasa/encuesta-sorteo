import {
  etiquetaRolHistorial,
  formatHistorialFecha,
} from '../../domain/seguimiento-historial';
import type { SeguimientoHistorialEntry } from '../../types';

interface SeguimientoHistorialPanelProps {
  historial: SeguimientoHistorialEntry[];
  cargando?: boolean;
  error?: string | null;
}

export function SeguimientoHistorialPanel({
  historial,
  cargando = false,
  error = null,
}: SeguimientoHistorialPanelProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        Historial de estados
      </h3>
      <p className="mt-1 text-[12px] text-zinc-500">
        Cada guardado del seguimiento: quién, cuándo y estado resultante.
      </p>

      {cargando && (
        <p className="mt-4 text-[13px] text-zinc-400">Cargando historial…</p>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
      )}

      {!cargando && !error && historial.length === 0 && (
        <p className="mt-4 text-[13px] text-zinc-400">Sin cambios registrados todavía.</p>
      )}

      {!cargando && !error && historial.length > 0 && (
        <ol className="mt-4 max-h-52 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {historial.map((entry, index) => (
            <li
              key={entry.id}
              className={`rounded-lg border bg-white px-3 py-2.5 ${
                index === 0 ? 'border-brand-200 ring-1 ring-brand-100' : 'border-zinc-200'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-zinc-800">{entry.estadoEtiqueta}</p>
                {index === 0 && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                    Actual
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12px] text-zinc-500">
                {formatHistorialFecha(entry.creadoEn)}
                {' · '}
                {etiquetaRolHistorial(entry.operadorRol)}:{' '}
                <span className="font-medium text-zinc-700">{entry.operadorNombre}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
