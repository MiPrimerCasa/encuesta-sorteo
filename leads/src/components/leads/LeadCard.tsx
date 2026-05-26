import {
  formatFechaReagenda,
  getProductoNombre,
  getPromotorNombre,
  leadCompro,
  leadReagendaEntrevista,
} from '../../domain/leads';
import { etiquetaPagoProducto } from '../../domain/venta';
import type { Barrio, Lead, Producto, Promotor } from '../../types';

interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
  variante?: 'activo' | 'seguimiento' | 'compro';
  promotores?: Promotor[];
  productos?: Producto[];
  barrios?: Barrio[];
}

export function LeadCard({
  lead,
  onClick,
  variante = 'activo',
  promotores = [],
  productos = [],
  barrios = [],
}: LeadCardProps) {
  const compro = leadCompro(lead);
  const reagenda = leadReagendaEntrevista(lead);
  const productoNombre = getProductoNombre(lead.seguimiento?.idProducto, productos);
  const detallePago = etiquetaPagoProducto(
    lead.seguimiento?.idProducto,
    lead.seguimiento?.estadoPago,
    barrios,
    lead.seguimiento?.idBarrio,
  );
  const tieneSeguimiento = Boolean(
    lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null,
  );
  const esArchivo = variante === 'compro' || compro;
  const esSeguimiento =
    variante === 'seguimiento' || (variante !== 'compro' && reagenda && !esArchivo);

  return (
    <button
      type="button"
      onClick={() => onClick(lead)}
      className={`w-full rounded-2xl border-2 p-4 text-left shadow-sm transition active:scale-[0.98] touch-manipulation ${
        esArchivo
          ? 'border-black/20 bg-neutral-50 hover:border-black/40'
          : esSeguimiento
            ? 'border-brand/40 bg-brand-light hover:border-brand hover:shadow-md'
            : 'border-neutral-200 bg-white hover:border-brand hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-neutral-900">{lead.nombre}</p>
          <p className="mt-0.5 text-sm text-neutral-500">{lead.telefono}</p>
        </div>
        {esArchivo && (
          <span className="shrink-0 rounded-full bg-black px-2.5 py-1 text-xs font-bold uppercase text-white">
            Compró
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Promotor: {lead.promotorNombre ?? getPromotorNombre(lead.promotorId, promotores)}
        {lead.supervisorNombre &&
          lead.supervisorNombre !== lead.promotorNombre && (
            <span className="text-neutral-400"> · Sup. {lead.supervisorNombre}</span>
          )}
      </p>
      {lead.domicilio && (
        <p className="mt-1 text-xs text-neutral-500">{lead.domicilio}</p>
      )}
      {esArchivo && productoNombre && (
        <p className="mt-2 text-sm font-bold text-brand">
          Compró: {productoNombre}
          {detallePago && (
            <span className="font-semibold text-neutral-600"> · {detallePago}</span>
          )}
          {lead.seguimiento?.numeroRecibo && (
            <span className="mt-1 block text-xs font-medium text-neutral-500">
              Recibo: {lead.seguimiento.numeroRecibo}
            </span>
          )}
        </p>
      )}
      {(esSeguimiento || reagenda) && !esArchivo && (
        <p className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs font-bold text-brand ring-1 ring-brand/20">
          Próxima entrevista
          {lead.seguimiento?.fechaReagenda ? (
            <span className="mt-0.5 block text-sm font-bold normal-case text-neutral-900">
              {formatFechaReagenda(lead.seguimiento.fechaReagenda)}
            </span>
          ) : (
            <span className="mt-0.5 block font-normal normal-case text-neutral-500">
              Sin fecha cargada
            </span>
          )}
        </p>
      )}
      {!esArchivo && !reagenda && tieneSeguimiento && (
        <p className="mt-2 text-xs font-bold uppercase text-brand">Seguimiento iniciado</p>
      )}
    </button>
  );
}
