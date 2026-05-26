import { useState, type ReactNode } from 'react';
import { useLeadsFilter } from '../../hooks/useLeadsFilter';
import type { Barrio, Lead, Producto, Promotor, RolUsuario, SeguimientoLead } from '../../types';
import { CountBadge } from '../ui/CountBadge';
import { LeadCard } from './LeadCard';
import { LeadModalForm } from './LeadModalForm';

type ListaKey = 'entrevistaPendiente' | 'paraContactar' | 'seguimiento' | 'compraron';

const COLUMNAS_ACTIVAS: Array<{
  id: string;
  tituloTab: string;
  tituloLargo: string;
  key: ListaKey;
}> = [
  {
    id: 'entrevista',
    tituloTab: 'Entrevista',
    tituloLargo: 'Entrevista pendiente',
    key: 'entrevistaPendiente',
  },
  {
    id: 'contacto',
    tituloTab: 'Contactar',
    tituloLargo: 'Para contactar',
    key: 'paraContactar',
  },
];

const SECCION_SEGUIMIENTO = {
  id: 'seguimiento',
  tituloTab: 'Seguimiento',
  tituloLargo: 'Seguimiento — entrevista reagendada',
  key: 'seguimiento' as const,
};

const SECCION_COMPRO = {
  id: 'compro',
  tituloTab: 'Compraron',
  tituloLargo: 'Compraron — cerrados',
  key: 'compraron' as const,
};

function estiloTabActivo(tabId: string, activo: boolean) {
  if (!activo) return 'bg-white text-neutral-800 ring-1 ring-neutral-200';
  if (tabId === 'compro') return 'bg-black text-white ring-2 ring-black';
  if (tabId === 'seguimiento') return 'bg-brand-dark text-white ring-2 ring-brand-dark';
  return 'bg-brand text-white ring-2 ring-brand';
}

const TABS_MOBILE: Array<{
  id: string;
  tituloTab: string;
  key: ListaKey;
}> = [...COLUMNAS_ACTIVAS, SECCION_SEGUIMIENTO, SECCION_COMPRO];

function ListaLeads({
  items,
  onAbrir,
  variante,
  vacio,
  promotores,
  productos,
  barrios,
}: {
  items: Lead[];
  onAbrir: (lead: Lead) => void;
  variante: 'activo' | 'seguimiento' | 'compro';
  vacio: string;
  promotores: Promotor[];
  productos: Producto[];
  barrios: Barrio[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-brand/25 py-8 text-center text-sm text-neutral-400">
        {vacio}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onClick={onAbrir}
          variante={variante}
          promotores={promotores}
          productos={productos}
          barrios={barrios}
        />
      ))}
    </div>
  );
}

function SeccionColapsable({
  tabActivo,
  tabId,
  abierto,
  onToggle,
  titulo,
  subtituloMobile,
  contador,
  headerClass,
  children,
}: {
  tabActivo: string;
  tabId: string;
  abierto: boolean;
  onToggle: () => void;
  titulo: string;
  subtituloMobile: string;
  contador: number;
  headerClass: string;
  children: ReactNode;
}) {
  const visibleMobile = tabActivo === tabId;

  return (
    <section
      className={`mt-6 overflow-hidden rounded-2xl border-2 border-brand/15 bg-white shadow-sm ${
        visibleMobile ? '' : 'hidden lg:block'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`${visibleMobile ? 'hidden' : 'flex'} w-full min-h-12 items-center justify-between gap-2 px-4 py-3 text-left touch-manipulation lg:flex lg:cursor-default lg:pointer-events-none ${headerClass}`}
        aria-expanded={abierto}
      >
        <div>
          <h2 className="text-base font-bold uppercase text-white">{titulo}</h2>
          <p className="text-xs text-white/80 lg:hidden">{subtituloMobile}</p>
        </div>
        <CountBadge count={contador} size="md" />
        <span className="text-white lg:hidden" aria-hidden>
          {abierto ? '▲' : '▼'}
        </span>
      </button>
      {(abierto || visibleMobile) && <div className="space-y-3 bg-neutral-50 p-4">{children}</div>}
    </section>
  );
}

interface LeadsPanelProps {
  leads: Lead[];
  rolUsuario: RolUsuario;
  promotores: Promotor[];
  productos: Producto[];
  barrios: Barrio[];
  onActualizarLead: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
}

export function LeadsPanel({
  leads,
  rolUsuario,
  promotores,
  productos,
  barrios,
  onActualizarLead,
}: LeadsPanelProps) {
  const { entrevistaPendiente, paraContactar, seguimiento, compraron } = useLeadsFilter(leads);
  const listas: Record<ListaKey, Lead[]> = {
    entrevistaPendiente,
    paraContactar,
    seguimiento,
    compraron,
  };

  const [tabActivo, setTabActivo] = useState('entrevista');
  const [seguimientoAbierto, setSeguimientoAbierto] = useState(true);
  const [comproAbierto, setComproAbierto] = useState(true);
  const [leadSeleccionado, setLeadSeleccionado] = useState<Lead | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const abrirLead = (lead: Lead) => {
    setLeadSeleccionado(lead);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setLeadSeleccionado(null);
  };

  const guardar = async (leadId: string, seguimientoData: SeguimientoLead) => {
    await onActualizarLead(leadId, seguimientoData);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 pb-8">
      <p className="mb-4 text-sm font-medium text-neutral-600">
        <strong>Reagendar</strong> mueve el lead a <strong>Seguimiento</strong>.{' '}
        <strong>Compró</strong> lo archiva abajo. El panel superior queda solo para trabajo del día.
      </p>

      <nav
        className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border-2 border-brand/15 bg-neutral-50 p-2 lg:hidden"
        aria-label="Secciones de leads"
      >
        {TABS_MOBILE.map((tab) => {
          const activo = tabActivo === tab.id;
          const count = listas[tab.key].length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTabActivo(tab.id)}
              className={`flex min-h-[3.25rem] w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold uppercase shadow-sm transition touch-manipulation ${estiloTabActivo(tab.id, activo)}`}
            >
              <span className="leading-tight">{tab.tituloTab}</span>
              <CountBadge
                count={count}
                size="sm"
                className={activo ? 'ring-2 ring-white' : 'ring-2 ring-brand/15'}
              />
            </button>
          );
        })}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        {COLUMNAS_ACTIVAS.map((col) => {
          const items = listas[col.key];
          const esMobileOculta = tabActivo !== col.id;

          return (
            <div
              key={col.id}
              className={`space-y-3 ${esMobileOculta ? 'hidden lg:block' : ''}`}
            >
              <h2 className="mb-1 hidden items-center gap-3 border-l-4 border-brand pl-3 text-base font-bold uppercase text-neutral-900 lg:flex">
                {col.tituloLargo}
                <CountBadge count={items.length} size="lg" />
              </h2>
              <ListaLeads
                items={items}
                onAbrir={abrirLead}
                variante="activo"
                vacio="Sin leads pendientes"
                promotores={promotores}
                productos={productos}
                barrios={barrios}
              />
            </div>
          );
        })}
      </div>

      <SeccionColapsable
        tabActivo={tabActivo}
        tabId="seguimiento"
        abierto={seguimientoAbierto}
        onToggle={() => setSeguimientoAbierto((v) => !v)}
        titulo={SECCION_SEGUIMIENTO.tituloLargo}
        subtituloMobile={`Tocá para ${seguimientoAbierto ? 'ocultar' : 'ver'}`}
        contador={seguimiento.length}
        headerClass="bg-brand-dark"
      >
        <ListaLeads
          items={seguimiento}
          onAbrir={abrirLead}
          variante="seguimiento"
          vacio="Nadie con entrevista reagendada por ahora"
          promotores={promotores}
          productos={productos}
          barrios={barrios}
        />
      </SeccionColapsable>

      <SeccionColapsable
        tabActivo={tabActivo}
        tabId="compro"
        abierto={comproAbierto}
        onToggle={() => setComproAbierto((v) => !v)}
        titulo={SECCION_COMPRO.tituloLargo}
        subtituloMobile={`Tocá para ${comproAbierto ? 'ocultar' : 'ver'}`}
        contador={compraron.length}
        headerClass="bg-black"
      >
        <ListaLeads
          items={compraron}
          onAbrir={abrirLead}
          variante="compro"
          vacio="Aún no hay ventas registradas"
          promotores={promotores}
          productos={productos}
          barrios={barrios}
        />
      </SeccionColapsable>

      <LeadModalForm
        lead={leadSeleccionado}
        open={modalAbierto}
        rolUsuario={rolUsuario}
        productos={productos}
        barrios={barrios}
        onClose={cerrarModal}
        onSave={guardar}
      />
    </div>
  );
}
