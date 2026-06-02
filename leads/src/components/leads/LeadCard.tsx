import {
  getProductoNombre,
  getPromotorNombre,
  leadCompro,
  leadDerivaSupervisorTerreno,
  leadEnEntrevistaPendiente,
  leadReagendaEntrevista,
} from '../../domain/leads';
import { etiquetaCortaNumeroDocumentoVenta, etiquetaPagoProducto } from '../../domain/venta';
import { etiquetaCampania } from '../../domain/campania';
import { FUENTE_LABEL } from '../../domain/fuenteLabels';
import type { Barrio, Lead, Producto, Promotor, RolUsuario } from '../../types';
import { EntrevistaAgendaBadge } from './EntrevistaAgendaBadge';
import { StatusPill } from '../ui/StatusPill';
import { WhatsAppLeadButton } from './WhatsAppLeadButton';

interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
  variante?: 'activo' | 'seguimiento' | 'compro' | 'no-compro';
  promotores?: Promotor[];
  productos?: Producto[];
  barrios?: Barrio[];
  nombreUsuario?: string;
  /** En vista promotor no mostramos la fila Promotor (siempre es el usuario logueado). */
  ocultarPromotor?: boolean;
  rolUsuario?: RolUsuario;
}

export function LeadCard({
  lead,
  onClick,
  variante = 'activo',
  promotores = [],
  productos = [],
  barrios = [],
  nombreUsuario,
  ocultarPromotor = false,
  rolUsuario = 'supervisor',
}: LeadCardProps) {
  const compro = leadCompro(lead);
  const reagenda = leadReagendaEntrevista(lead);
  const derivaTerreno = leadDerivaSupervisorTerreno(lead);
  const productoNombre = getProductoNombre(lead.seguimiento?.idProducto, productos);
  const detallePago = etiquetaPagoProducto(
    lead.seguimiento?.idProducto,
    lead.seguimiento?.estadoPago,
    barrios,
    lead.seguimiento?.idBarrio,
    rolUsuario,
  );
  const tieneSeguimiento = Boolean(
    lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null,
  );
  const esNoCompro   = variante === 'no-compro';
  const esArchivo    = variante === 'compro' || (compro && !esNoCompro);
  const esSeguimiento =
    !esNoCompro && (variante === 'seguimiento' || (variante !== 'compro' && reagenda && !esArchivo));
  const esContactado = !esArchivo && !esSeguimiento && !esNoCompro && tieneSeguimiento;
  const esNuevo      = !esArchivo && !esSeguimiento && !esNoCompro && !tieneSeguimiento;
  const mostrarAgendaEntrevista =
    !esArchivo &&
    !esNoCompro &&
    (leadEnEntrevistaPendiente(lead) || reagenda);
  const etiquetaSorteo = etiquetaCampania(lead.codigoCampania);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onClick(lead)}
        style={{ touchAction: 'manipulation' }}
        className={`w-full rounded-xl border p-4 pb-14 text-left transition-[background,border-color,transform] duration-[140ms] ease-out active:scale-[0.995] md:p-5 md:pb-14 ${
          esNoCompro
            ? 'border-red-500 bg-zinc-900 active:bg-zinc-800 active:border-red-400 [&:not(:active)]:hover:border-red-400 [&:not(:active)]:hover:shadow-sm'
            : esArchivo
            ? 'border-zinc-300 bg-zinc-200 active:bg-zinc-300 active:border-zinc-400 [&:not(:active)]:hover:border-zinc-400 [&:not(:active)]:hover:shadow-sm'
            : esSeguimiento
              ? 'border-brand-100 bg-brand-50 active:bg-brand-100 active:border-brand-300 [&:not(:active)]:hover:border-brand-200 [&:not(:active)]:hover:shadow-sm'
              : esContactado
                ? 'border-amber-200 bg-amber-50 active:bg-amber-100 active:border-amber-300 [&:not(:active)]:hover:border-amber-300 [&:not(:active)]:hover:shadow-sm'
                : esNuevo
                  ? 'border-[#99F6E4] bg-[#F0FDFA] active:bg-[#CCFBF1] active:border-[#5EEAD4] [&:not(:active)]:hover:border-[#5EEAD4] [&:not(:active)]:hover:shadow-sm'
                  : 'border-zinc-200 bg-white active:bg-brand-50 active:border-brand-200 [&:not(:active)]:hover:border-zinc-300 [&:not(:active)]:hover:shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`text-[15px] font-semibold leading-snug ${esNoCompro ? 'text-white' : 'text-zinc-900'}`}>
              {lead.nombre}
            </h3>
            {etiquetaSorteo && (
              <span
                className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  esNoCompro
                    ? 'border-violet-400/40 bg-violet-500/20 text-violet-100'
                    : 'border-violet-200 bg-violet-50 text-violet-700'
                }`}
              >
                {etiquetaSorteo}
              </span>
            )}
          </div>
          <div className="shrink-0">
            {esArchivo && <StatusPill variant="compro" dot>Cierre</StatusPill>}
            {esSeguimiento && !esArchivo && (
              <StatusPill variant="reagendado" dot>En seguimiento</StatusPill>
            )}
            {esContactado && derivaTerreno && (
              <StatusPill variant="pending" dot>Interés terreno</StatusPill>
            )}
            {esContactado && !derivaTerreno && (
              <StatusPill variant="contactado" dot>Contactado</StatusPill>
            )}
            {!esArchivo && !esSeguimiento && !tieneSeguimiento && !reagenda && (
              <StatusPill variant="nuevo" dot>No contactado</StatusPill>
            )}
          </div>
        </div>

        <dl className="mt-3 space-y-1">
          <div className="text-[13px]">
            <dt className={`inline ${esNoCompro ? 'text-zinc-400' : 'text-zinc-400'}`}>Tel: </dt>
            <dd className={`inline ${esNoCompro ? 'text-zinc-300' : 'text-zinc-600'}`}>
              {lead.telefono || (
                <span className="italic text-zinc-400">Sin teléfono en encuesta</span>
              )}
            </dd>
          </div>
          {!ocultarPromotor && (
            <div className="text-[13px]">
              <dt className="inline text-zinc-400">Promotor: </dt>
              <dd className={`inline ${esNoCompro ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {lead.promotorNombre ?? getPromotorNombre(lead.promotorId, promotores)}
                {lead.supervisorNombre && lead.supervisorNombre !== lead.promotorNombre && (
                  <span className={esNoCompro ? 'text-zinc-500' : 'text-zinc-400'}> · Sup. {lead.supervisorNombre}</span>
                )}
              </dd>
            </div>
          )}
          {lead.domicilio && (
            <div className="text-[13px]">
              <dt className="inline text-zinc-400">Dir: </dt>
              <dd className={`inline ${esNoCompro ? 'text-zinc-300' : 'text-zinc-600'}`}>{lead.domicilio}</dd>
            </div>
          )}
        </dl>

        {esArchivo && productoNombre && (
          <div className="mt-3 text-[13px]">
            <span className="text-zinc-400">Producto: </span>
            <span className="font-medium text-zinc-700">{productoNombre}</span>
            {detallePago && <span className="ml-1 text-zinc-400">· {detallePago}</span>}
            {lead.seguimiento?.numeroRecibo && (
              <span className="ml-1 text-zinc-400">
                · {etiquetaCortaNumeroDocumentoVenta(rolUsuario)}:{' '}
                {lead.seguimiento.numeroRecibo}
              </span>
            )}
          </div>
        )}

        {mostrarAgendaEntrevista && <EntrevistaAgendaBadge lead={lead} />}
      </button>

      {/* Badge fuente — bottom-left */}
      {lead.seguimiento?.fuente && (
        <span className="absolute bottom-4 left-4 inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
          {FUENTE_LABEL[lead.seguimiento.fuente]}
        </span>
      )}

      <div className="absolute bottom-3.5 right-4 md:bottom-4 md:right-5">
        <WhatsAppLeadButton
          telefono={lead.telefono}
          nombre={lead.nombre}
          nombreUsuario={nombreUsuario}
        />
      </div>
    </div>
  );
}
