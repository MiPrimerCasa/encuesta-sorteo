import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  crearLead,
  modificarTelefonoLead,
  fetchAdminDashboard,
  fetchBarrios,
  fetchGrabacionesConfig,
  fetchLeads,
  fetchPromotores,
  fetchProductos,
  guardarSeguimiento,
} from './api/client';
import { LoginPage } from './components/auth/LoginPage';
import { NavBar } from './components/layout/NavBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import type {
  AdminDashboardData,
  Barrio,
  Lead,
  NuevoLeadData,
  Producto,
  Promotor,
  SeguimientoLead,
  VistaActiva,
} from './types';

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
const SuperadminDashboard = lazy(() =>
  import('./components/admin/SuperadminDashboard').then((m) => ({
    default: m.SuperadminDashboard,
  })),
);
const GrabacionDiariaPanel = lazy(() =>
  import('./components/grabaciones/GrabacionDiariaPanel').then((m) => ({
    default: m.GrabacionDiariaPanel,
  })),
);

function VistaCargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="px-4 py-12 text-center text-neutral-600">{texto}</p>;
}

function AppShell() {
  const { usuario, login, logout } = useAuth();
  const esSuperadmin = usuario?.rol === 'superadmin';
  const tienePanelGlobal = !esSuperadmin && Boolean(usuario?.panelGlobal);
  const [vistaActiva, setVistaActiva] = useState<VistaActiva>(esSuperadmin ? 'admin' : 'leads');
  const [leadIdSeguimiento, setLeadIdSeguimiento] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboardData | null>(null);
  const [periodo, setPeriodo] = useState<string>('mes');
  const [direccionOficinas, setDireccionOficinas] = useState<string | undefined>();
  const [promotores, setPromotores] = useState<Promotor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [grabacionesHabilitado, setGrabacionesHabilitado] = useState(false);
  const [grabacionesConfig, setGrabacionesConfig] = useState<{
    minDuracionSeg: number;
    maxMb: number;
    formatos: string[];
  } | null>(null);

  const cargarDatos = useCallback(async (p = periodo) => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      if (usuario.rol === 'superadmin') {
        const dash = await fetchAdminDashboard(p);
        setAdminDashboard(dash);
        return;
      }

      const esSupervisor = usuario.rol === 'supervisor';
      const [leadsRes, prod, barr, prom] = await Promise.all([
        fetchLeads(),
        fetchProductos(usuario.rol),
        fetchBarrios(),
        esSupervisor ? fetchPromotores() : Promise.resolve([] as Promotor[]),
      ]);
      setLeads(leadsRes.leads);
      setDireccionOficinas(leadsRes.direccionOficinasSupervisor);
      setPromotores(prom);
      setProductos(prod);
      setBarrios(barr);

      // Supervisor con acceso al panel global: cargar dashboard en paralelo
      if (usuario.panelGlobal) {
        fetchAdminDashboard(p)
          .then((dash) => setAdminDashboard(dash))
          .catch((err) =>
            console.warn('[panelGlobal] No se pudo cargar dashboard admin:', err),
          );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }, [usuario, periodo]);

  const cambiarPeriodo = useCallback((nuevoPeriodo: string) => {
    setPeriodo(nuevoPeriodo);
    void cargarDatos(nuevoPeriodo);
  }, [cargarDatos]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (!usuario || usuario.rol !== 'promotor') {
      setGrabacionesHabilitado(false);
      setGrabacionesConfig(null);
      return;
    }
    fetchGrabacionesConfig()
      .then((cfg) => {
        setGrabacionesHabilitado(cfg.moduloActivo && cfg.habilitado);
        if (cfg.moduloActivo && cfg.habilitado) {
          setGrabacionesConfig({
            minDuracionSeg: cfg.minDuracionSeg,
            maxMb: cfg.maxMb,
            formatos: cfg.formatos,
          });
        }
      })
      .catch(() => {
        setGrabacionesHabilitado(false);
      });
  }, [usuario]);

  const onActualizarLead = useCallback(
    async (leadId: string, seguimiento: SeguimientoLead) => {
      const result = await guardarSeguimiento(leadId, seguimiento);
      setLeads((prev) => {
        let next = prev.map((l) => (l.id === leadId ? result.lead : l));
        if (result.nuevosLeads?.length) {
          const ids = new Set(next.map((l) => l.id));
          for (const nl of result.nuevosLeads) {
            if (!ids.has(nl.id)) {
              next = [...next, nl];
              ids.add(nl.id);
            }
          }
        }
        return next;
      });
      if (result.message?.includes('referido')) {
        setAviso(result.message);
        setError('');
      }
      return result;
    },
    [],
  );

  const onLeadSeguimientoConsumido = useCallback(() => {
    setLeadIdSeguimiento(null);
  }, []);

  const onCrearLead = useCallback(async (data: NuevoLeadData, promotorNombre?: string) => {
    try {
      const newLead = await crearLead(data, { promotorNombre });
      setLeads((prev) => [...prev, newLead]);
      setError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear el lead';
      setError(msg);
      throw err;
    }
  }, []);

  const onModificarTelefonoLead = useCallback(async (leadId: string, telefono: string) => {
    const updated = await modificarTelefonoLead(leadId, telefono);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
    setError('');
  }, []);

  if (!usuario) {
    return <LoginPage onLogin={login} />;
  }

  const contenidoPrincipal =
    cargando && !adminDashboard && leads.length === 0 ? (
      <VistaCargando texto="Cargando datos…" />
    ) : esSuperadmin && adminDashboard ? (
      <SuperadminDashboard data={adminDashboard} periodo={periodo} onCambiarPeriodo={cambiarPeriodo} />
    ) : tienePanelGlobal && vistaActiva === 'admin' ? (
      adminDashboard ? (
        <SuperadminDashboard data={adminDashboard} periodo={periodo} onCambiarPeriodo={cambiarPeriodo} />
      ) : (
        <VistaCargando texto="Cargando panel global…" />
      )
    ) : vistaActiva === 'calendario' ? (
      <CalendarioView
        leads={leads}
        promotores={promotores}
        rolUsuario={usuario.rol}
        onActualizarLead={onActualizarLead}
        onVolver={() => setVistaActiva('leads')}
        onAbrirSeguimientoLead={(leadId) => {
          setLeadIdSeguimiento(leadId);
          setVistaActiva('leads');
        }}
      />
    ) : vistaActiva === 'promotores' && usuario.rol === 'supervisor' ? (
      <PromotoresPanel leads={leads} promotores={promotores} />
    ) : vistaActiva === 'metricas' && usuario.rol === 'promotor' ? (
      <PromotorMetricasPanel leads={leads} />
    ) : vistaActiva === 'grabacion' && usuario.rol === 'promotor' && grabacionesConfig ? (
      <GrabacionDiariaPanel
        leads={leads}
        minDuracionSeg={grabacionesConfig.minDuracionSeg}
        maxMb={grabacionesConfig.maxMb}
        formatos={grabacionesConfig.formatos}
      />
    ) : (
      <LeadsPanel
        leads={leads}
        direccionOficinas={direccionOficinas}
        rolUsuario={usuario.rol}
        nombreUsuario={usuario.nombre}
        promotores={promotores}
        productos={productos}
        barrios={barrios}
        onActualizarLead={onActualizarLead}
        onCrearLead={onCrearLead}
        onModificarTelefonoLead={onModificarTelefonoLead}
        leadIdSeguimientoInicial={leadIdSeguimiento}
        onLeadSeguimientoConsumido={onLeadSeguimientoConsumido}
      />
    );

  return (
    <div vaul-drawer-wrapper="" className="min-h-svh bg-zinc-50">
      <NavBar
        vistaActiva={vistaActiva}
        onCambiarVista={setVistaActiva}
        usuario={usuario}
        onLogout={logout}
        grabacionesHabilitado={grabacionesHabilitado}
      />
      <main>
        {aviso && (
          <p className="mx-auto max-w-5xl px-4 pt-4 text-sm font-medium text-emerald-800">
            {aviso}
          </p>
        )}
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
