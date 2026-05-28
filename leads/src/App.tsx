import { useCallback, useEffect, useState } from 'react';
import {
  crearLead,
  fetchBarrios,
  fetchLeads,
  fetchProductos,
  fetchPromotores,
  guardarSeguimiento,
} from './api/client';
import { LoginPage } from './components/auth/LoginPage';
import { NavBar } from './components/layout/NavBar';
import { LeadsPanel } from './components/leads/LeadsPanel';
import { PromotoresPanel } from './components/promotores/PromotoresPanel';
import { CalendarioView } from './components/calendario/CalendarioView';
import { PromotorMetricasPanel } from './components/promotores/PromotorMetricasPanel';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Barrio, Lead, NuevoLeadData, Producto, Promotor, SeguimientoLead, VistaActiva } from './types';

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
      const [l, p, prod, barr] = await Promise.all([
        fetchLeads(),
        esSupervisor ? fetchPromotores() : Promise.resolve([]),
        fetchProductos(usuario.rol),
        fetchBarrios(),
      ]);
      setLeads(l);
      setPromotores(p);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el lead');
      throw err;
    }
  }, []);

  if (!usuario) {
    return <LoginPage onLogin={login} />;
  }

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
        {cargando && leads.length === 0 ? (
          <p className="px-4 py-12 text-center text-neutral-600">Cargando datos…</p>
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
        )}
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
