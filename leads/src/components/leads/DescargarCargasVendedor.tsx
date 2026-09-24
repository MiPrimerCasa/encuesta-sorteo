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

  return (
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-zinc-800">
            {incluirPromotor ? 'Cargas del equipo' : 'Mis cargas'}
          </p>
          <p className="text-[12px] text-zinc-500">
            Nuevos: {totalNuevos} · Todos: {totalTodos}
          </p>
          {ultima && (
            <p className="text-[12px] text-zinc-500">
              Fecha de descarga: {ultima}
              {anterior ? ` · Última fecha de descarga: ${anterior}` : ''}
            </p>
          )}
        </div>
        <div className="flex rounded-lg border border-zinc-200 p-0.5">
          <button
            type="button"
            onClick={() => setFormato('excel')}
            className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${
              formato === 'excel' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
            }`}
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => setFormato('pdf')}
            className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${
              formato === 'pdf' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
            }`}
          >
            PDF
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={totalNuevos === 0 || guardando}
          onClick={() => void descargar('nuevos')}
          style={{ touchAction: 'manipulation' }}
          className="h-10 flex-1 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white active:bg-brand-800 disabled:opacity-50"
        >
          Descargar nuevos contactados
        </button>
        <button
          type="button"
          disabled={totalTodos === 0 || guardando}
          onClick={() => void descargar('todos')}
          style={{ touchAction: 'manipulation' }}
          className="h-10 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[13px] font-semibold text-zinc-800 active:bg-zinc-100 disabled:opacity-50"
        >
          Descargar todos
        </button>
      </div>
      {aviso && <p className="mt-2 text-[12px] text-amber-800">{aviso}</p>}
    </div>
  );
}
