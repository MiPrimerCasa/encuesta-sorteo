import { useEffect, useMemo, useState } from 'react';
import {
  obtenerDescargaCargas,
  registrarDescargaCargas,
  type MarcaDescargaCargas,
} from '../../api/client';
import {
  filasDescargaVendedor,
  formatearFechaDescarga,
} from '../../domain/leads-descarga-vendedor';
import type { Lead } from '../../types';
import {
  downloadLeadsVendedorExcel,
  downloadLeadsVendedorPdf,
} from '../../utils/export-leads-vendedor';

interface DescargarCargasVendedorProps {
  leads: Lead[];
  vendedorNombre: string;
  /** Supervisor: el título habla del equipo, no de una sola persona. */
  incluirPromotor?: boolean;
}

const VACIA: MarcaDescargaCargas = { fechaDescarga: null, ultimaFechaDescarga: null };

function DescargaIcono() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M9 3v8M9 11l-3-3M9 11l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function DescargarCargasVendedor({
  leads,
  vendedorNombre,
  incluirPromotor = false,
}: DescargarCargasVendedorProps) {
  const [aviso, setAviso] = useState('');
  const [marca, setMarca] = useState<MarcaDescargaCargas>(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [formato, setFormato] = useState<'excel' | 'pdf'>('excel');

  useEffect(() => {
    let activo = true;
    obtenerDescargaCargas()
      .then((data) => {
        if (activo) setMarca(data);
      })
      .catch(() => {
        if (activo) setMarca(VACIA);
      });
    return () => {
      activo = false;
    };
  }, []);

  const totalNuevos = useMemo(
    () => filasDescargaVendedor(leads, marca.fechaDescarga).length,
    [leads, marca.fechaDescarga],
  );
  const totalTodos = useMemo(() => filasDescargaVendedor(leads).length, [leads]);

  const descargar = async (alcance: 'nuevos' | 'todos') => {
    if (guardando) return;
    const ahora = new Date().toISOString();
    const desdeIso = alcance === 'todos' ? null : marca.fechaDescarga;
    const opciones = {
      leads,
      vendedorNombre,
      desdeIso,
      alcance,
      fechaDescargaIso: ahora,
      ultimaFechaDescargaIso: alcance === 'todos' ? null : marca.fechaDescarga,
    };
    const ok =
      formato === 'excel'
        ? downloadLeadsVendedorExcel(opciones)
        : downloadLeadsVendedorPdf(opciones);
    if (!ok) {
      setAviso(
        alcance === 'todos'
          ? 'No hay contactados de carga manual, redes ni QR para descargar.'
          : marca.fechaDescarga
            ? 'No hay contactados nuevos desde la última descarga.'
            : 'No hay contactados de carga manual, redes ni QR para descargar.',
      );
      return;
    }
    if (alcance === 'todos') {
      setAviso('');
      return;
    }
    setGuardando(true);
    setAviso('');
    try {
      const siguiente = await registrarDescargaCargas();
      setMarca(siguiente);
    } catch (err) {
      setAviso(
        err instanceof Error
          ? err.message
          : 'La planilla se descargó, pero no se pudo guardar la fecha. La próxima puede repetir estos leads.',
      );
    } finally {
      setGuardando(false);
    }
  };

  const ultima = formatearFechaDescarga(marca.fechaDescarga);
  const anterior = formatearFechaDescarga(marca.ultimaFechaDescarga);

  const nuevosListos = totalNuevos > 0 && !guardando;
  const todosListos = totalTodos > 0 && !guardando;

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900">
            {incluirPromotor ? 'Cargas del equipo' : 'Mis cargas'}
          </p>
          {ultima ? (
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              Última descarga {ultima}
              {anterior ? ` · Anterior ${anterior}` : ''}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-zinc-500">Todavía no descargaste</p>
          )}
        </div>
        <div className="flex shrink-0 rounded-full bg-zinc-100 p-0.5" role="group" aria-label="Formato">
          {(['excel', 'pdf'] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setFormato(opcion)}
              className={`h-7 rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide ${
                formato === opcion ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!nuevosListos}
          onClick={() => void descargar('nuevos')}
          style={{ touchAction: 'manipulation' }}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left ${
            nuevosListos
              ? 'bg-brand-600 text-white active:bg-brand-800'
              : 'cursor-not-allowed border border-dashed border-zinc-200 bg-zinc-50 text-zinc-400'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold leading-tight">
              Descargar nuevos contactados
            </span>
            <span className={`mt-0.5 block text-[12px] leading-tight ${nuevosListos ? 'text-white/80' : 'text-zinc-400'}`}>
              {totalNuevos} desde la última descarga
            </span>
          </span>
          <DescargaIcono />
        </button>
        <button
          type="button"
          disabled={!todosListos}
          onClick={() => void descargar('todos')}
          style={{ touchAction: 'manipulation' }}
          className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${
            todosListos
              ? 'border-brand-200 bg-brand-50 text-brand-800 active:bg-brand-100'
              : 'cursor-not-allowed border-dashed border-zinc-200 bg-zinc-50 text-zinc-400'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold leading-tight">Descargar todos</span>
            <span className={`mt-0.5 block text-[12px] leading-tight ${todosListos ? 'text-brand-700/80' : 'text-zinc-400'}`}>
              {totalTodos} contactados, lista completa
            </span>
          </span>
          <DescargaIcono />
        </button>
      </div>
      {aviso && <p className="mt-2 text-[12px] text-amber-800">{aviso}</p>}
    </div>
  );
}
