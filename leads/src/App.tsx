import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  crearLead,
  fetchBarrios,
  fetchLeads,
  fetchProductos,
  guardarSeguimiento,
} from './api/client';
import { LoginPage } from './components/auth/LoginPage';
import { NavBar } from './components/layout/NavBar';
import { buildPromotoresFromLeads } from './domain/leads';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Barrio, Lead, NuevoLeadData, Producto, Promotor, SeguimientoLead, VistaActiva } from './types';

const LeadsPanel = lazy(() =>
  import('./components/leads/LeadsPanel').then((m) => ({ default: m.LeadsPanel })),
);
const PromotoresPanel = lazy(() =>
  import('./components/promotores/PromotoresPanel').then((m) => ({ default: m.PromotoresPanel })),
);
const CalendarioView = lazy(() =>
  import('./components/calendario/CalendarioView').then((m) => ({ default: m.CalendarioView })),
);
const PromotorMetricasPanel = lazy(() =>
  import('./components/promotores/PromotorMetricasPanel').then((m) => ({
    default: m.PromotorMetricasPanel,
  })),
);

function VistaCargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="px-4 py-12 text-center text-neutral-600">{texto}</p>;
}

function AppShell() {
  const { usuario, login, logout } = useAuth();
  const [vistaActiva, setVistaActiva] = useState<VistaActiva>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [promotores, setPromotores] = useState<Promotor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargarDatos = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      const esSupervisor = usuario.rol === 'supervisor';
      const [l, prod, barr] = await Promise.all([
        fetchLeads(),
        fetchProductos(usuario.rol),
        fetchBarrios(),
      ]);
      setLeads(l);
      setPromotores(esSupervisor ? buildPromotoresFromLeads(l) : []);
      setProductos(prod);
      setBarrios(barr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const onActualizarLead = useCallback(
    async (leadId: string, seguimiento: SeguimientoLead) => {
      const updated = await guardarSeguimiento(leadId, seguimiento);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
    },
    [],
  );

  const onCrearLead = useCallback(async (data: NuevoLeadData) => {
    try {
      const newLead = await crearLead(data);
      setLeads((prev) => [...prev, newLead]);
      setError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear el lead';
      setError(msg);
      throw err;
    }
  }, []);

  if (!usuario) {
    return <LoginPage onLogin={login} />;
  }

  const contenidoPrincipal =
    cargando && leads.length === 0 ? (
      <VistaCargando texto="Cargando datos…" />
    ) : vistaActiva === 'calendario' ? (
      <CalendarioView
        leads={leads}
        promotores={promotores}
        onActualizarLead={onActualizarLead}
        onVolver={() => setVistaActiva('leads')}
      />
    ) : vistaActiva === 'promotores' && usuario.rol === 'supervisor' ? (
      <PromotoresPanel leads={leads} promotores={promotores} />
    ) : vistaActiva === 'metricas' && usuario.rol === 'promotor' ? (
      <PromotorMetricasPanel leads={leads} />
    ) : (
      <LeadsPanel
        leads={leads}
        rolUsuario={usuario.rol}
        nombreUsuario={usuario.nombre}
        promotores={promotores}
        productos={productos}
        barrios={barrios}
        onActualizarLead={onActualizarLead}
        onCrearLead={onCrearLead}
      />
    );

  return (
    <div vaul-drawer-wrapper="" className="min-h-svh bg-zinc-50">
      <NavBar
        vistaActiva={vistaActiva}
        onCambiarVista={setVistaActiva}
        usuario={usuario}
        onLogout={logout}
      />
      <main>
        {error && (
          <p className="mx-auto max-w-5xl whitespace-pre-wrap px-4 pt-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <Suspense fallback={<VistaCargando />}>{contenidoPrincipal}</Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
