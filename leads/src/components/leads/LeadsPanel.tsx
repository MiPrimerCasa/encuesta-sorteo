import { useEffect, useMemo, useState } from 'react';
import { fetchLinksRedes } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  leadCompro,
  leadReagendaEntrevista,
  leadSoloLecturaSupervisor,
  leadSoloLecturaPromotor,
  leadSoloLecturaUltimoModificador,
  sortLeadsContactadosPromotor,
  sortLeadsPorVentaReciente,
  tabIdListaLead,
  leadEnEntrevistaPendiente,
} from '../../domain/leads';
import { prioridadTabInicial } from '../../domain/prioridad-leads';

import { useHistorialLeads } from '../../hooks/useHistorialLeads';
import { useLeadsFilter } from '../../hooks/useLeadsFilter';
import type { Barrio, GuardarSeguimientoResult, Lead, NuevoLeadData, Producto, Promotor, RolUsuario, SeguimientoLead } from '../../types';
import { AlertasSinContactar } from './AlertasSinContactar';
import { LeadCard } from './LeadCard';
import { LeadModalForm } from './LeadModalForm';
import { ModificarTelefonoSheet } from './ModificarTelefonoSheet';
import { NuevoLeadSheet } from './NuevoLeadSheet';
import { LinksRedesSection } from './LinksRedesSection';
import { PromotorResumen } from './PromotorResumen';
import { SwipeableLeadCard } from './SwipeableLeadCard';


type ListaKey = 'entrevistaPendiente' | 'paraContactar' | 'seguimiento' | 'compraron';
type VarianteCard = 'activo' | 'seguimiento' | 'compro';

const TABS: Array<{
  id: string;
  tituloTab: string;
  tituloTabCorto: string;
  tituloLargo: string;
  key: ListaKey;
  variante: VarianteCard;
  vacio: string;
}> = [
  {
    id: 'entrevista',
    tituloTab: 'Prioridad',
    tituloTabCorto: 'Prioridad',
    tituloLargo: 'Prioridad — entrevistas y nuevos',
    key: 'entrevistaPendiente',
    variante: 'activo',
    vacio: 'Nada pendiente en esta bandeja',
  },
  {
    id: 'contacto',
    tituloTab: 'Contactado',
    tituloTabCorto: 'Contactado',
    tituloLargo: 'Contactado — para seguir',
    key: 'paraContactar',
    variante: 'activo',
    vacio: 'Sin leads contactados',
  },
  {
    id: 'seguimiento',
    tituloTab: 'En seguimiento',
    tituloTabCorto: 'Seguim.',
    tituloLargo: 'En seguimiento — entrevista reagendada',
    key: 'seguimiento',
    variante: 'seguimiento',
    vacio: 'Nadie con entrevista reagendada por ahora',
  },
  {
    id: 'compro',
    tituloTab: 'Cierres',
    tituloTabCorto: 'Cierres',
    tituloLargo: 'Cierres',
    key: 'compraron',
    variante: 'compro',
    vacio: 'Aún no hay ventas registradas',
  },
];

interface LeadsPanelProps {
  leads: Lead[];
  rolUsuario: RolUsuario;
  nombreUsuario?: string;
  promotores: Promotor[];
  productos: Producto[];
  barrios: Barrio[];
  onActualizarLead: (
    leadId: string,
    seguimiento: SeguimientoLead,
  ) => void | Promise<void | GuardarSeguimientoResult>;
  onCrearLead: (data: NuevoLeadData, promotorNombre?: string) => void | Promise<void>;
  onModificarTelefonoLead?: (leadId: string, telefono: string) => void | Promise<void>;
  direccionOficinas?: string;
  /** Desde calendario: abrir seguimiento de este lead al montar. */
  leadIdSeguimientoInicial?: string | null;
  onLeadSeguimientoConsumido?: () => void;
}

export function LeadsPanel({
  leads,
  direccionOficinas,
  rolUsuario,
  nombreUsuario,
  promotores,
  productos,
  barrios,
  onActualizarLead,
  onCrearLead,
  onModificarTelefonoLead,
  leadIdSeguimientoInicial,
  onLeadSeguimientoConsumido,
}: LeadsPanelProps) {
  const { usuario } = useAuth();
  const [codigoDesdeLinks, setCodigoDesdeLinks] = useState<string | undefined>();

  useEffect(() => {
    if (!usuario || rolUsuario !== 'promotor' || usuario.codigoCarga?.trim()) {
      setCodigoDesdeLinks(undefined);
      return;
    }
    let cancelado = false;
    fetchLinksRedes()
      .then((links) => {
        if (!cancelado && links.codigo?.trim()) {
          setCodigoDesdeLinks(links.codigo.trim());
        }
      })
      .catch(() => {
        if (!cancelado) setCodigoDesdeLinks(undefined);
      });
    return () => {
      cancelado = true;
    };
  }, [usuario, rolUsuario]);

  const codigoCargaFallback = useMemo(() => {
    if (!usuario || rolUsuario !== 'promotor') return undefined;
    if (usuario.codigoCarga?.trim()) return usuario.codigoCarga.trim();
    if (codigoDesdeLinks?.trim()) return codigoDesdeLinks.trim();
    const idOp = String(usuario.idOperador ?? usuario.id ?? '').trim();
    const propio = leads.find((l) => String(l.idVendedor ?? '') === idOp);
    return propio?.codigoPromotorCarga?.trim();
  }, [usuario, rolUsuario, leads, codigoDesdeLinks]);

  const {
    entrevistaPendiente,
    paraContactar,
    seguimiento,
    compraron,
    encuestaSinContactar,
  } = useLeadsFilter(leads);
  const listas: Record<ListaKey, Lead[]> = {
    entrevistaPendiente,
    paraContactar,
    seguimiento,
    compraron,
  };

  const [tabActivo, setTabActivo] = useState('entrevista');
  const [leadSeleccionado, setLeadSeleccionado] = useState<Lead | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [agendarAbierto, setAgendarAbierto] = useState(false);
  const [leadModificarTelefono, setLeadModificarTelefono] = useState<Lead | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState<'prioridad' | 'primeros' | 'recientes' | 'entrevistas'>('prioridad');

  const todosLosLeads = useMemo(
    () => [...entrevistaPendiente, ...paraContactar, ...seguimiento, ...compraron],
    [entrevistaPendiente, paraContactar, seguimiento, compraron],
  );

  const { historialPorLead, fetchHistorial, refrescarHistorial } = useHistorialLeads();

  const resultadosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, '');
    return todosLosLeads.filter(
      (l) =>
        l.nombre.toLowerCase().includes(q) ||
        (qDigits && l.telefono.replace(/\D/g, '').includes(qDigits)) ||
        (l.domicilio?.toLowerCase().includes(q) ?? false),
    );
  }, [busqueda, todosLosLeads]);

  const buscando = busqueda.trim().length > 0;

  function estadoLead(lead: Lead): 'nuevo' | 'contactado' | 'reagendado' | 'compro' {
    if (leadCompro(lead))             return 'compro';
    if (leadReagendaEntrevista(lead)) return 'reagendado';
    if (lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null) return 'contactado';
    return 'nuevo';
  }

  const abrirLead = (lead: Lead) => {
    if (rolUsuario === 'supervisor' && leadSoloLecturaSupervisor(lead)) return;
    if (
      esPromotor &&
      leadSoloLecturaPromotor(lead, historialPorLead[lead.id] ?? [])
    ) {
      return;
    }
    setLeadSeleccionado(lead);
    setModalAbierto(true);
  };

  useEffect(() => {
    if (!leadIdSeguimientoInicial) return;
    const lead = leads.find((l) => l.id === leadIdSeguimientoInicial);
    if (lead) {
      setTabActivo(tabIdListaLead(lead));
      setBusqueda('');
      if (rolUsuario === 'supervisor' && leadSoloLecturaSupervisor(lead)) {
        onLeadSeguimientoConsumido?.();
        return;
      }
      fetchHistorial(lead.id);
      setLeadSeleccionado(lead);
      setModalAbierto(true);
    }
    onLeadSeguimientoConsumido?.();
  }, [leadIdSeguimientoInicial, leads, onLeadSeguimientoConsumido, fetchHistorial]);

  const cerrarModal = () => {
    setModalAbierto(false);
    setLeadSeleccionado(null);
  };

  const tabData = TABS.find((t) => t.id === tabActivo) ?? TABS[0];
  const itemsActivos = listas[tabData.key];
  const itemsVisibles = useMemo(() => {
    if (tabActivo === 'compro') {
      return sortLeadsPorVentaReciente(itemsActivos, historialPorLead);
    }
    if (tabActivo === 'contacto' && rolUsuario === 'promotor') {
      return sortLeadsContactadosPromotor(itemsActivos, historialPorLead);
    }
    if (tabActivo === 'entrevista') {
      let result = [...itemsActivos];
      if (filtroPrioridad === 'entrevistas') {
        result = result.filter(leadEnEntrevistaPendiente);
      }
      if (filtroPrioridad === 'primeros') {
        result.sort((a, b) => {
          const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
          const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
          return fa.localeCompare(fb);
        });
      } else if (filtroPrioridad === 'recientes') {
        result.sort((a, b) => {
          const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
          const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
          return fb.localeCompare(fa);
        });
      } else {
        // 'prioridad' (default) o 'entrevistas'
        result.sort((a, b) => {
          const isAInt = leadEnEntrevistaPendiente(a);
          const isBInt = leadEnEntrevistaPendiente(b);
          if (isAInt && !isBInt) return -1;
          if (!isAInt && isBInt) return 1;
          const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
          const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
          return fa.localeCompare(fb);
        });
      }
      return result;
    }
    return itemsActivos;
  }, [tabActivo, itemsActivos, historialPorLead, rolUsuario, filtroPrioridad]);
  const esPromotor = rolUsuario === 'promotor';
  const esTabPrioridad = tabActivo === 'entrevista';

  const guardarSeguimientoLead = async (leadId: string, seg: SeguimientoLead) => {
    await onActualizarLead(leadId, seg);
    await refrescarHistorial(leadId);
  };

  const handleWhatsAppAutoContacto = async (lead: Lead) => {
    if (prioridadTabInicial(lead) === 2) {
      const seg: SeguimientoLead = {
        canal: 'mensaje',
        huboEntrevista: false,
      };
      await guardarSeguimientoLead(lead.id, seg);
    }
  };

  const abrirModificarTelefono = onModificarTelefonoLead
    ? (lead: Lead) => setLeadModificarTelefono(lead)
    : undefined;

  const renderTarjetaLead = (lead: Lead, variante: VarianteCard) =>
    esPromotor && variante !== 'compro' ? (
      <SwipeableLeadCard
        key={lead.id}
        lead={lead}
        onClick={abrirLead}
        variante={variante}
        promotores={promotores}
        productos={productos}
        barrios={barrios}
        nombreUsuario={nombreUsuario}
        ocultarPromotor
        rolUsuario={rolUsuario}
        onQuickSave={guardarSeguimientoLead}
        historial={historialPorLead[lead.id] ?? []}
        onModificarTelefono={abrirModificarTelefono}
        fetchHistorial={fetchHistorial}
        onWhatsAppAutoContacto={handleWhatsAppAutoContacto}
      />
    ) : (
      <LeadCard
        key={lead.id}
        lead={lead}
        onClick={abrirLead}
        variante={variante}
        promotores={promotores}
        productos={productos}
        barrios={barrios}
        nombreUsuario={nombreUsuario}
        ocultarPromotor={esPromotor}
        rolUsuario={rolUsuario}
        historial={historialPorLead[lead.id] ?? []}
        onModificarTelefono={abrirModificarTelefono}
        fetchHistorial={fetchHistorial}
        onWhatsAppAutoContacto={handleWhatsAppAutoContacto}
      />
    );



  return (
    <div className="mx-auto max-w-2xl px-3 py-4 pb-12 sm:px-6 sm:py-6">

      {/* Promotor: resumen personal + alertas */}
      {esPromotor && (
        <>
          <PromotorResumen leads={leads} />
          <AlertasSinContactar leads={encuestaSinContactar} onClickLead={abrirLead} />
        </>
      )}

      {/* Info banner */}
      <div className="mb-5 flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
        <svg
          width="15" height="15" viewBox="0 0 15 15" fill="none"
          className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true"
        >
          <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.5 6.5v4M7.5 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <p className="text-[13px] text-zinc-500">
          {esPromotor ? (
            <>
              En <span className="font-medium text-zinc-700">Prioridad</span>: entrevistas agendadas y
              encuestas sin contactar. En <span className="font-medium text-zinc-700">Contactado</span>, el
              último contacto aparece primero.{' '}
              <span className="font-medium text-zinc-700">Reagendar</span> y{' '}
              <span className="font-medium text-zinc-700">derivar terreno</span> van a En seguimiento.
            </>
          ) : (
            <>
              En <span className="font-medium text-zinc-700">Prioridad</span>: entrevistas agendadas y
              encuestas sin contactar. Los derivados a terreno y las reagendas van a{' '}
              <span className="font-medium text-zinc-700">En seguimiento</span>.
            </>
          )}
        </p>
      </div>

      {/* Buscador */}
      <div className="relative mb-5">
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o dirección…"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-10 text-[14px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {buscando && (
          <button
            type="button"
            onClick={() => setBusqueda('')}
            style={{ touchAction: 'manipulation' }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 active:text-zinc-700"
            aria-label="Limpiar búsqueda"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {buscando ? (
        /* ── Resultados de búsqueda ── */
        <>
          <div className="mb-4 flex items-baseline gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Resultados
            </h2>
            <span className="text-[13px] tabular-nums text-zinc-400">{resultadosBusqueda.length}</span>
          </div>
          {resultadosBusqueda.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-[13px] text-zinc-400">
              Sin resultados para "{busqueda.trim()}"
            </p>
          ) : (
            <div className="space-y-3">
              {resultadosBusqueda.map((lead) => {
                const variant = estadoLead(lead);
                const varianteCard =
                  variant === 'compro' ? 'compro' : variant === 'reagendado' ? 'seguimiento' : 'activo';
                return esPromotor && variant !== 'compro' ? (
                  <SwipeableLeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={abrirLead}
                    variante={varianteCard}
                    promotores={promotores}
                    productos={productos}
                    barrios={barrios}
                    nombreUsuario={nombreUsuario}
                    ocultarPromotor
                    rolUsuario={rolUsuario}
                    onQuickSave={guardarSeguimientoLead}
                    historial={historialPorLead[lead.id] ?? []}
                    onModificarTelefono={abrirModificarTelefono}
                    fetchHistorial={fetchHistorial}
                  />
                ) : (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={abrirLead}
                    variante={varianteCard}
                    promotores={promotores}
                    productos={productos}
                    barrios={barrios}
                    nombreUsuario={nombreUsuario}
                    ocultarPromotor={esPromotor}
                    rolUsuario={rolUsuario}
                    historial={historialPorLead[lead.id] ?? []}
                    onModificarTelefono={abrirModificarTelefono}
                    fetchHistorial={fetchHistorial}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ── Vista normal por pestañas ── */
        <>
          {/* Tab bar */}
          <nav
            className="mb-6 flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 gap-1"
            aria-label="Secciones de leads"
            role="tablist"
          >
            {TABS.map((tab) => {
              const activo = tabActivo === tab.id;
              const count = listas[tab.key].length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setTabActivo(tab.id)}
                  style={{ touchAction: 'manipulation' }}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center transition-all duration-[140ms] ease-out active:scale-[0.97] ${
                    activo ? 'bg-brand-600 shadow-sm' : 'hover:bg-zinc-100 active:bg-zinc-200'
                  }`}
                >
                  <span className={`text-[11px] font-semibold leading-tight sm:text-[12px] ${activo ? 'text-white' : 'text-zinc-600'}`}>
                    <span className="sm:hidden">{tab.tituloTabCorto}</span>
                    <span className="hidden sm:inline">{tab.tituloTab}</span>
                  </span>
                  <span className={`text-[11px] font-medium tabular-nums leading-none ${activo ? 'text-white/70' : 'text-zinc-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Botón Agendar */}
          <button
            type="button"
            onClick={() => setAgendarAbierto(true)}
            style={{ touchAction: 'manipulation' }}
            className="mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 text-[14px] font-semibold text-zinc-600 transition-all duration-[120ms] ease-out active:scale-[0.98] active:bg-zinc-200 hover:bg-zinc-200"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Cargar lead
          </button>

          {/* Título sección */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                {tabData.tituloLargo}
              </h2>
              <span className="text-[13px] tabular-nums text-zinc-400">{itemsVisibles.length}</span>
            </div>

            {esTabPrioridad && (
              <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setFiltroPrioridad('prioridad')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filtroPrioridad === 'prioridad'
                      ? 'bg-white text-zinc-800 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  Prioridad
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroPrioridad('primeros')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filtroPrioridad === 'primeros'
                      ? 'bg-white text-zinc-800 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  Los primeros
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroPrioridad('recientes')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filtroPrioridad === 'recientes'
                      ? 'bg-white text-zinc-800 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  Más recientes
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroPrioridad('entrevistas')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    filtroPrioridad === 'entrevistas'
                      ? 'bg-white text-zinc-800 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  Con entrevista
                </button>
              </div>
            )}
          </div>

          {/* Lista */}
          {itemsVisibles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-[13px] text-zinc-400">
              {tabData.vacio}
            </p>
          ) : (
            <div className="space-y-3">
              {itemsVisibles.map((lead) => renderTarjetaLead(lead, tabData.variante))}
            </div>
          )}
        </>
      )}

      <LinksRedesSection className="mt-8" />

      <LeadModalForm
        lead={leadSeleccionado}
        open={modalAbierto}
        rolUsuario={rolUsuario}
        productos={productos}
        barrios={barrios}
        soloLectura={
          leadSeleccionado != null &&
          (leadSoloLecturaUltimoModificador(leadSeleccionado, usuario?.idOperador ?? usuario?.id, rolUsuario) ||
            (esPromotor
              ? leadSoloLecturaPromotor(
                  leadSeleccionado,
                  historialPorLead[leadSeleccionado.id] ?? [],
                )
              : leadSoloLecturaSupervisor(leadSeleccionado)))
        }
        onClose={cerrarModal}
        onSave={async (leadId, seg) => {
          await guardarSeguimientoLead(leadId, seg);
          if (seg.resultadoEntrevista === 'compro') {
            setTabActivo('compro');
          } else if (seg.confirmoEntrevista === true) {
            setTabActivo('seguimiento');
          } else if (seg.resultadoEntrevista === 'reagenda') {
            setTabActivo('seguimiento');
          } else if (seg.resultadoEntrevista === 'sin_interes') {
            setTabActivo('contacto');
          }
        }}
      />

      <NuevoLeadSheet
        open={agendarAbierto}
        rolUsuario={rolUsuario}
        promotores={promotores}
        codigoCargaFallback={codigoCargaFallback}
        direccionOficinas={direccionOficinas}
        onClose={() => setAgendarAbierto(false)}
        onSave={onCrearLead}
      />

      {onModificarTelefonoLead && (
        <ModificarTelefonoSheet
          lead={leadModificarTelefono}
          open={leadModificarTelefono != null}
          onClose={() => setLeadModificarTelefono(null)}
          onSave={onModificarTelefonoLead}
        />
      )}
    </div>
  );
}
