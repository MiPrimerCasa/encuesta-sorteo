import { useState } from 'react';
import { isDemoMode } from '../../api/client';
import { useLeadsFilter } from '../../hooks/useLeadsFilter';
import type { Barrio, Lead, NuevoLeadData, Producto, Promotor, RolUsuario, SeguimientoLead } from '../../types';
import { LeadCard } from './LeadCard';
import { LeadModalForm } from './LeadModalForm';
import { NuevoLeadSheet } from './NuevoLeadSheet';

type ListaKey = 'entrevistaPendiente' | 'paraContactar' | 'seguimiento' | 'compraron';
type VarianteCard = 'activo' | 'seguimiento' | 'compro';

const TABS: Array<{
  id: string;
  tituloTab: string;
  tituloLargo: string;
  key: ListaKey;
  variante: VarianteCard;
  vacio: string;
}> = [
  {
    id: 'entrevista',
    tituloTab: 'Nuevo lead',
    tituloLargo: 'Nuevo lead — entrevista pendiente',
    key: 'entrevistaPendiente',
    variante: 'activo',
    vacio: 'Sin nuevos leads pendientes',
  },
  {
    id: 'contacto',
    tituloTab: 'Contactado',
    tituloLargo: 'Contactado — para seguir',
    key: 'paraContactar',
    variante: 'activo',
    vacio: 'Sin leads contactados',
  },
  {
    id: 'seguimiento',
    tituloTab: 'En seguimiento',
    tituloLargo: 'En seguimiento — entrevista reagendada',
    key: 'seguimiento',
    variante: 'seguimiento',
    vacio: 'Nadie con entrevista reagendada por ahora',
  },
  {
    id: 'compro',
    tituloTab: 'Compró',
    tituloLargo: 'Compró — cerrados',
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
  onActualizarLead: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
  onCrearLead: (data: NuevoLeadData) => void | Promise<void>;
}

export function LeadsPanel({
  leads,
  rolUsuario,
  nombreUsuario,
  promotores,
  productos,
  barrios,
  onActualizarLead,
  onCrearLead,
}: LeadsPanelProps) {
  const { entrevistaPendiente, paraContactar, seguimiento, compraron } = useLeadsFilter(leads);
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

  const abrirLead = (lead: Lead) => {
    setLeadSeleccionado(lead);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setLeadSeleccionado(null);
  };

  const tabData = TABS.find((t) => t.id === tabActivo) ?? TABS[0];
  const itemsActivos = listas[tabData.key];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-12 sm:px-6">

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
          <span className="font-medium text-zinc-700">Reagendar</span> mueve el lead a{' '}
          <span className="font-medium text-zinc-700">En seguimiento</span>.{' '}
          <span className="font-medium text-zinc-700">Compró</span> lo archiva abajo.
        </p>
      </div>

      {/* Tab bar — siempre en fila, 4 botones iguales */}
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
                activo
                  ? 'bg-brand-600 shadow-sm'
                  : 'hover:bg-zinc-100 active:bg-zinc-200'
              }`}
            >
              <span
                className={`text-[12px] font-semibold leading-tight ${
                  activo ? 'text-white' : 'text-zinc-600'
                }`}
              >
                {tab.tituloTab}
              </span>
              <span
                className={`text-[11px] font-medium tabular-nums leading-none ${
                  activo ? 'text-white/70' : 'text-zinc-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {isDemoMode && (
        <button
          type="button"
          onClick={() => setAgendarAbierto(true)}
          style={{ touchAction: 'manipulation' }}
          className="mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 text-[14px] font-semibold text-zinc-600 transition-all duration-[120ms] ease-out active:scale-[0.98] active:bg-zinc-200 hover:bg-zinc-200"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Agendar cliente (demo)
        </button>
      )}

      {/* Título de la sección activa */}
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          {tabData.tituloLargo}
        </h2>
        <span className="text-[13px] tabular-nums text-zinc-400">{itemsActivos.length}</span>
      </div>

      {/* Lista de leads de la sección activa */}
      {itemsActivos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-[13px] text-zinc-400">
          {tabData.vacio}
        </p>
      ) : (
        <div className="space-y-3">
          {itemsActivos.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={abrirLead}
              variante={tabData.variante}
              promotores={promotores}
              productos={productos}
              barrios={barrios}
              nombreUsuario={nombreUsuario}
            />
          ))}
        </div>
      )}

      <LeadModalForm
        lead={leadSeleccionado}
        open={modalAbierto}
        rolUsuario={rolUsuario}
        productos={productos}
        barrios={barrios}
        onClose={cerrarModal}
        onSave={async (leadId, seg) => { await onActualizarLead(leadId, seg); }}
      />

      <NuevoLeadSheet
        open={agendarAbierto}
        rolUsuario={rolUsuario}
        promotores={promotores}
        onClose={() => setAgendarAbierto(false)}
        onSave={onCrearLead}
      />
    </div>
  );
}
