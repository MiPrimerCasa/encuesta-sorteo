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

  const total = useMemo(
    () => filasDescargaVendedor(leads, marca.fechaDescarga).length,
    [leads, marca.fechaDescarga],
  );

  const descargar = async (formato: 'excel' | 'pdf') => {
    if (guardando) return;
    const ahora = new Date().toISOString();
    const ok =
      formato === 'excel'
        ? downloadLeadsVendedorExcel({
            leads,
            vendedorNombre,
            desdeIso: marca.fechaDescarga,
            fechaDescargaIso: ahora,
            ultimaFechaDescargaIso: marca.fechaDescarga,
          })
        : downloadLeadsVendedorPdf({
            leads,
            vendedorNombre,
            desdeIso: marca.fechaDescarga,
            fechaDescargaIso: ahora,
            ultimaFechaDescargaIso: marca.fechaDescarga,
          });
    if (!ok) {
      setAviso(
        marca.fechaDescarga
          ? 'No hay contactados nuevos desde la última descarga.'
          : 'No hay contactados de carga manual, redes ni QR para descargar.',
      );
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
            {ultima
              ? `Solo contactados nuevos · ${total} lead${total === 1 ? '' : 's'}`
              : `Primera descarga · todos los contactados · ${total} lead${total === 1 ? '' : 's'}`}
          </p>
          {ultima && (
            <p className="text-[12px] text-zinc-500">
              Fecha de descarga: {ultima}
              {anterior ? ` · Última fecha de descarga: ${anterior}` : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={total === 0 || guardando}
            onClick={() => void descargar('excel')}
            style={{ touchAction: 'manipulation' }}
            className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[13px] font-semibold text-zinc-800 active:bg-zinc-100 disabled:opacity-50"
          >
            Excel
          </button>
          <button
            type="button"
            disabled={total === 0 || guardando}
            onClick={() => void descargar('pdf')}
            style={{ touchAction: 'manipulation' }}
            className="h-9 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white active:bg-brand-800 disabled:opacity-50"
          >
            PDF
          </button>
        </div>
      </div>
      {aviso && <p className="mt-2 text-[12px] text-amber-800">{aviso}</p>}
    </div>
  );
}
