import { useEffect, useRef } from 'react';
import {
  ETIQUETA_CIERRE_SUPERVISOR,
  ETIQUETA_REFERIDO,
  ETIQUETA_SEGUIMIENTO_PIJ,
  getProductoNombre,
  getPromotorNombre,
  leadCompro,
  leadDerivaSupervisorTerreno,
  leadDerivacionTerrenoSupervisorActiva,
  leadEsInteresTerreno,
  leadEnEntrevistaPendiente,
  leadPostEntrevistaSinCompra,
  leadReagendaEntrevista,
  leadEsCargaManual,
  etiquetaSeguimientoAgendaOtroRol,
  leadSeguimientoPijPromotor,
  leadSoloLecturaPromotor,
  leadSoloLecturaSupervisor,
  esCerradoNegativoLead,
  leadCierreRegistradoSupervisor,
  leadTieneCitaPrevia,
} from '../../domain/leads';
import { prioridadTabInicial } from '../../domain/prioridad-leads';
import { etiquetaCortaNumeroDocumentoVenta, etiquetaPagoProducto } from '../../domain/venta';
import { etiquetaCampania } from '../../domain/campania';
import { FUENTE_LABEL } from '../../domain/fuenteLabels';
import type { Barrio, Lead, Producto, Promotor, RolUsuario, SeguimientoHistorialEntry } from '../../types';
import { EntrevistaAgendaBadge } from './EntrevistaAgendaBadge';
import { LeadHistorialInline } from './LeadHistorialInline';
import { StatusPill } from '../ui/StatusPill';
import { WhatsAppLeadButton } from './WhatsAppLeadButton';
import { cleanTelefonoSuffix } from '../../domain/whatsapp';
import { parseIsoLocal } from '../../domain/seguimiento-historial';

const formatearFechaHora = (fechaStr?: string) => {
  if (!fechaStr) return '';
  try {
    const d = parseIsoLocal(fechaStr);
    if (!d || isNaN(d.getTime())) return fechaStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return fechaStr;
  }
};

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
  historial?: SeguimientoHistorialEntry[];
  onModificarTelefono?: (lead: Lead) => void;
  fetchHistorial?: (leadId: string) => void;
  /** Se invoca al presionar WhatsApp para registrar contacto automático. */
  onWhatsAppAutoContacto?: (lead: Lead) => void;
  /** Abre el drawer para agregar referidos sin modificar el seguimiento actual. */
  onAgregarReferidos?: (lead: Lead) => void;
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
  historial = [],
  onModificarTelefono,
  fetchHistorial,
  onWhatsAppAutoContacto,
  onAgregarReferidos,
}: LeadCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fetchHistorial || !lead.id) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetchHistorial(lead.id);
          observer.disconnect();
        }
      },
      { rootMargin: '150px' }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [lead.id, fetchHistorial]);
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
  const esPostEntrevistaNegativo =
    !esArchivo && !esSeguimiento && !esNoCompro && leadPostEntrevistaSinCompra(lead);
  const esNoConfirmoNegativo =
    !esArchivo &&
    !esSeguimiento &&
    !esNoCompro &&
    lead.seguimiento?.confirmoEntrevista === false &&
    esCerradoNegativoLead(lead);
  const esContactado =
    !esArchivo &&
    !esSeguimiento &&
    !esNoCompro &&
    tieneSeguimiento &&
    !esPostEntrevistaNegativo &&
    !esNoConfirmoNegativo;
  const esNuevo =
    !esArchivo && !esSeguimiento && !esNoCompro && !tieneSeguimiento;
  const esInteresTerreno =
    !esArchivo &&
    !esNoCompro &&
    (leadEsInteresTerreno(lead) || prioridadTabInicial(lead) === 0);
  const terrenoCardClass = 'lead-card--terreno';
  const mostrarAgendaEntrevista =
    !esArchivo &&
    !esNoCompro &&
    (leadEnEntrevistaPendiente(lead) || reagenda);
  const etiquetaSorteo = etiquetaCampania(lead.codigoCampania);
  const seguimientoPij = leadSeguimientoPijPromotor(lead);
  const etiquetaAgendaOtroRol =
    rolUsuario != null ? etiquetaSeguimientoAgendaOtroRol(lead, rolUsuario) : null;
  const cierreSupervisor = leadSoloLecturaPromotor(lead, historial);
  const soloLecturaSupervisor =
    rolUsuario === 'supervisor' && leadSoloLecturaSupervisor(lead);
  const soloLecturaPromotor =
    rolUsuario === 'promotor' && cierreSupervisor;
  const soloLectura = soloLecturaSupervisor || soloLecturaPromotor;
  const mostrarModificarTelefono =
    Boolean(onModificarTelefono) &&
    leadEsCargaManual(lead) &&
    !soloLectura;
  const nombrePromotor =
    lead.promotorNombre ?? getPromotorNombre(lead.promotorId, promotores);

  const esLeadEncuestaPromotorBloqueado =
    rolUsuario === 'supervisor' &&
    leadTieneCitaPrevia(lead) &&
    lead.cargadoPorRol === 'promotor' &&
    !leadDerivacionTerrenoSupervisorActiva(lead) &&
    !compro &&
    !esCerradoNegativoLead(lead);

  const cardClassName = `w-full rounded-xl border p-4 text-left md:p-5 ${
    historial.length > 0 ? 'pb-16 md:pb-16' : 'pb-14 md:pb-14'
  } ${
    esLeadEncuestaPromotorBloqueado
      ? 'lead-card--promotor-bloqueado cursor-default'
      : esInteresTerreno
      ? `${soloLectura ? 'cursor-default' : 'transition-[background,border-color,transform] duration-[140ms] ease-out active:scale-[0.995]'} ${terrenoCardClass}`
      : soloLectura
      ? 'cursor-default border-indigo-200 bg-indigo-50/80'
      : `transition-[background,border-color,transform] duration-[140ms] ease-out active:scale-[0.995] ${
          esNoCompro
            ? 'border-red-500 bg-zinc-900 active:bg-zinc-800 active:border-red-400 [&:not(:active)]:hover:border-red-400 [&:not(:active)]:hover:shadow-sm'
            : esArchivo
            ? 'border-zinc-300 bg-zinc-200 active:bg-zinc-300 active:border-zinc-400 [&:not(:active)]:hover:border-zinc-400 [&:not(:active)]:hover:shadow-sm'
            : esSeguimiento
              ? 'border-brand-100 bg-brand-50 active:bg-brand-100 active:border-brand-300 [&:not(:active)]:hover:border-brand-200 [&:not(:active)]:hover:shadow-sm'
               : (esPostEntrevistaNegativo || esNoConfirmoNegativo)
                 ? 'border-orange-200 bg-orange-50 active:bg-orange-100 active:border-orange-300 [&:not(:active)]:hover:border-orange-300 [&:not(:active)]:hover:shadow-sm'
                 : esContactado
                  ? 'border-amber-200 bg-amber-50 active:bg-amber-100 active:border-amber-300 [&:not(:active)]:hover:border-amber-300 [&:not(:active)]:hover:shadow-sm'
                  : esNuevo
                  ? 'border-[#99F6E4] bg-[#F0FDFA] active:bg-[#CCFBF1] active:border-[#5EEAD4] [&:not(:active)]:hover:border-[#5EEAD4] [&:not(:active)]:hover:shadow-sm'
                  : 'border-zinc-200 bg-white active:bg-brand-50 active:border-brand-200 [&:not(:active)]:hover:border-zinc-300 [&:not(:active)]:hover:shadow-sm'
        }`
  }`;

  const cardInner = (
    <>
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
            {lead.esReferido && (
              <span
                className={`ml-1.5 mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  esNoCompro
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
                title={
                  lead.leadReferidoDeId
                    ? `Referido del lead #${lead.leadReferidoDeId}${
                        lead.nivelReferido && lead.nivelReferido > 1
                          ? ` (nivel ${lead.nivelReferido})`
                          : ''
                      }`
                    : ETIQUETA_REFERIDO
                }
              >
                {ETIQUETA_REFERIDO}
              </span>
            )}
            {esLeadEncuestaPromotorBloqueado && (
              <div className="mt-2 space-y-1">
                <span className="inline-flex items-center rounded-md border border-purple-300 bg-purple-100 px-2 py-1 text-[11px] font-semibold leading-snug text-purple-900">
                  Interés por Plan Inversión Joven
                </span>
                <p className="text-[12px] font-medium text-purple-800/90">
                  Promotor: {nombrePromotor} (Pendiente derivación)
                </p>
              </div>
            )}
            {seguimientoPij && (
              <div className="mt-2 space-y-1">
                <span className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-100 px-2 py-1 text-[11px] font-semibold leading-snug text-indigo-900">
                  {ETIQUETA_SEGUIMIENTO_PIJ}
                </span>
                {rolUsuario === 'supervisor' && (
                  <p className="text-[12px] font-medium text-indigo-800/90">
                    Promotor: {nombrePromotor}
                  </p>
                )}
              </div>
            )}
            {etiquetaAgendaOtroRol && (
              <div className="mt-2 space-y-1">
                <span className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-100 px-2 py-1 text-[11px] font-semibold leading-snug text-indigo-900">
                  {etiquetaAgendaOtroRol}
                </span>
                {rolUsuario === 'supervisor' && (
                  <p className="text-[12px] font-medium text-indigo-800/90">
                    Promotor: {nombrePromotor}
                  </p>
                )}
              </div>
            )}
            {leadCierreRegistradoSupervisor(lead, historial) && (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1 text-[11px] font-semibold leading-snug text-zinc-700">
                  {ETIQUETA_CIERRE_SUPERVISOR}
                </span>
              </div>
            )}
            {lead.bloqueadoSupervisor48h && (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-md border border-purple-300 bg-purple-100 px-2 py-1 text-[11px] font-semibold leading-snug text-purple-900">
                  Prioridad Promotor (48hs)
                </span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            {esArchivo && <StatusPill variant="compro" dot>Cierre</StatusPill>}
            {esSeguimiento && !esArchivo && (
              <StatusPill variant="reagendado" dot>En seguimiento</StatusPill>
            )}
             {(esPostEntrevistaNegativo || esNoConfirmoNegativo) && (
               <StatusPill variant="post-entrevista" dot>
                 {esNoConfirmoNegativo
                   ? lead.seguimiento?.resultadoEntrevista === 'sin_interes'
                     ? 'No confirmó — sin interés'
                     : 'No confirmó — no compró'
                   : lead.seguimiento?.resultadoEntrevista === 'sin_interes'
                   ? 'Sin interés'
                   : 'No compró'}
               </StatusPill>
             )}
            {esInteresTerreno && (
              <StatusPill variant="terreno" dot>Interés terreno</StatusPill>
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
              {cleanTelefonoSuffix(lead.telefono) || (
                <span className="italic text-zinc-400">Sin teléfono en encuesta</span>
              )}
            </dd>
            {mostrarModificarTelefono && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onModificarTelefono?.(lead);
                }}
                style={{ touchAction: 'manipulation' }}
                className={`ml-2 text-[12px] font-semibold underline-offset-2 hover:underline ${
                  esNoCompro ? 'text-brand-200' : 'text-brand-600'
                }`}
              >
                Modificar número
              </button>
            )}
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
          {(lead.fechaAlta || lead.fechaObtencion) && (
            <div className="text-[13px]">
              <dt className="inline text-zinc-400">Ingreso: </dt>
              <dd className={`inline ${esNoCompro ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {formatearFechaHora(lead.fechaAlta || lead.fechaObtencion)}
              </dd>
            </div>
          )}
        </dl>

        {(lead.conoceMpc !== null || lead.sabiaPlanInversionJoven !== null) && (
          <div className={`mt-2.5 rounded-lg border px-3 py-2 text-[12px] space-y-1 ${
            esNoCompro
              ? 'border-zinc-700 bg-zinc-800/50 text-zinc-300'
              : 'border-zinc-200 bg-zinc-50/50 text-zinc-600'
          }`}>
            {lead.conoceMpc !== null && (
              <p>
                <span className="font-semibold">¿Conocía Mi Primer Casa?:</span>{' '}
                {lead.conoceMpc ? 'Sí' : 'No'}
              </p>
            )}
            {lead.sabiaPlanInversionJoven !== null && (
              <p>
                <span className="font-semibold">¿Sabía del Plan Inversión Joven?:</span>{' '}
                {lead.sabiaPlanInversionJoven ? 'Sí' : 'No'}
              </p>
            )}
          </div>
        )}

        {esArchivo && productoNombre && (
          <div className="mt-3 text-[13px]">
            <span className="text-zinc-400">Producto: </span>
            <span className="font-medium text-zinc-700">{productoNombre}</span>
            {detallePago && <span className="ml-1 text-zinc-400">· {detallePago}</span>}
            {lead.seguimiento?.numeroRecibo && (
              <span className="ml-1 text-zinc-400">
                · {etiquetaCortaNumeroDocumentoVenta(lead.seguimiento?.idProducto)}:{' '}
                {lead.seguimiento.numeroRecibo}
              </span>
            )}
            {lead.seguimiento?.fechaCierre && (
              <span className="ml-1 text-zinc-400">
                · Cierre: {formatearFechaHora(lead.seguimiento.fechaCierre)}
              </span>
            )}
          </div>
        )}

        {esArchivo && (lead.seguimiento?.comprasAdicionales?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-zinc-300/60 pt-2">
            {lead.seguimiento!.comprasAdicionales!.map((compra) => {
              const prodAdic = getProductoNombre(compra.idProducto, productos);
              const pagoAdic = etiquetaPagoProducto(
                compra.idProducto,
                compra.estadoPago,
                barrios,
                compra.idBarrio,
                rolUsuario,
              );
              return (
                <div key={compra.id} className="text-[13px]">
                  <span className="mr-1 inline-flex rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                    Adic.
                  </span>
                  <span className="text-zinc-400">Producto: </span>
                  <span className="font-medium text-zinc-700">{prodAdic ?? compra.idProducto}</span>
                  {pagoAdic && <span className="ml-1 text-zinc-400">· {pagoAdic}</span>}
                  {compra.numeroRecibo && (
                    <span className="ml-1 text-zinc-400">
                      · {etiquetaCortaNumeroDocumentoVenta(compra.idProducto)}: {compra.numeroRecibo}
                    </span>
                  )}
                  {compra.fechaCierre && (
                    <span className="ml-1 text-zinc-400">
                      · Cierre: {formatearFechaHora(compra.fechaCierre)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mostrarAgendaEntrevista && (
          <EntrevistaAgendaBadge
            lead={lead}
            titulo={
              seguimientoPij ? 'Próximo contacto — Plan Inversión Joven' : undefined
            }
          />
        )}

        <LeadHistorialInline historial={historial} esNoCompro={esNoCompro} />
    </>
  );

  return (
    <div ref={containerRef} className="relative">
      {soloLectura ? (
        <div
          className={cardClassName}
          data-terreno={esInteresTerreno ? 'true' : undefined}
          aria-label={`${lead.nombre} — solo lectura`}
        >
          {cardInner}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onClick(lead)}
          data-terreno={esInteresTerreno ? 'true' : undefined}
          style={{ touchAction: 'manipulation' }}
          className={cardClassName}
        >
          {cardInner}
        </button>
      )}

      {/* Bottom-left: fuente badge + botón referidos */}
      <div className="absolute bottom-3.5 left-4 flex items-center gap-2">
        {lead.seguimiento?.fuente && (
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
            {FUENTE_LABEL[lead.seguimiento.fuente]}
          </span>
        )}
        {onAgregarReferidos && !soloLecturaSupervisor && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAgregarReferidos(lead);
            }}
            style={{ touchAction: 'manipulation' }}
            aria-label="Agregar referidos"
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              esNoCompro
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <span aria-hidden="true">＋</span> Referidos
          </button>
        )}
      </div>

      <div className="absolute bottom-3.5 right-4 md:bottom-4 md:right-5">
        <WhatsAppLeadButton
          telefono={lead.telefono}
          nombre={lead.nombre}
          nombreUsuario={nombreUsuario}
          tieneCitaPrevia={leadTieneCitaPrevia(lead)}
          onAutoContacto={onWhatsAppAutoContacto ? () => onWhatsAppAutoContacto(lead) : undefined}
          bloqueadoSupervisor48h={lead.bloqueadoSupervisor48h}
          disabled={soloLecturaSupervisor}
          disabledTooltip={
            lead.bloqueadoSupervisor48h
              ? 'Prioridad Promotor (48hs)'
              : 'Pendiente de derivación por el promotor'
          }
        />
      </div>
    </div>
  );
}
