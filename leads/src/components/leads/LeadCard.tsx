import {
  getProductoNombre,
  getPromotorNombre,
  leadCompro,
  leadEnEntrevistaPendiente,
  leadReagendaEntrevista,
} from '../../domain/leads';
import { etiquetaPagoProducto } from '../../domain/venta';
import type { Barrio, Lead, Producto, Promotor } from '../../types';
import { EntrevistaAgendaBadge } from './EntrevistaAgendaBadge';
import { WhatsAppLeadButton } from './WhatsAppLeadButton';

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
  const mostrarAgendaEntrevista =
    !esArchivo &&
    (leadEnEntrevistaPendiente(lead) ||
      (reagenda && Boolean(lead.seguimiento?.fechaReagenda)));

  const estiloTarjeta = esArchivo
    ? 'border-black/20 bg-neutral-50'
    : esSeguimiento
      ? 'border-brand/40 bg-brand-light'
      : 'border-neutral-200 bg-white';

  return (
    <div
      className={`flex w-full overflow-hidden rounded-2xl border-2 text-left shadow-sm ${estiloTarjeta}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(lead)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(lead);
          }
        }}
        className="min-w-0 flex-1 cursor-pointer p-4 pr-2 transition active:scale-[0.99] touch-manipulation hover:opacity-95"
      >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-neutral-900">{lead.nombre}</p>
          {lead.telefono ? (
            <p className="mt-0.5 text-sm text-neutral-500">{lead.telefono}</p>
          ) : (
            <p className="mt-0.5 text-sm italic text-neutral-400">Sin teléfono en encuesta</p>
          )}
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
      {mostrarAgendaEntrevista && (
        <EntrevistaAgendaBadge
          lead={lead}
          titulo={reagenda ? undefined : 'Entrevista pendiente'}
        />
      )}
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
      {reagenda && !lead.seguimiento?.fechaReagenda && !esArchivo && (
        <p className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs font-bold text-brand ring-1 ring-brand/20">
          Próxima entrevista
          <span className="mt-0.5 block font-normal normal-case text-neutral-500">
            Sin fecha cargada
          </span>
        </p>
      )}
      {!esArchivo && !reagenda && tieneSeguimiento && (
        <p className="mt-2 text-xs font-bold uppercase text-brand">Seguimiento iniciado</p>
      )}
      </div>

      <div className="flex shrink-0 flex-col items-center justify-center border-l border-neutral-200/80 bg-neutral-50/50 px-2 py-3">
        <WhatsAppLeadButton telefono={lead.telefono} nombre={lead.nombre} />
      </div>
    </div>
  );
}
