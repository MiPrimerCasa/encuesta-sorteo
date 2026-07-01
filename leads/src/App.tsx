import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
import { abrirChatWhatsApp, mensajeWhatsAppLead } from './domain/whatsapp';
import { LoginPage } from './components/auth/LoginPage';
import { NavBar } from './components/layout/NavBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import type {
  AdminDashboardData,
  Barrio,
  Lead,
  NuevoLeadData,
  NuevoLeadSaveOptions,
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
    maxMb: number;
    formatos: string[];
  } | null>(null);
  const dashboardPorPeriodoRef = useRef<Map<string, AdminDashboardData>>(new Map());
  const fetchDashboardSeqRef = useRef(0);

  const cargarDashboardAdmin = useCallback(async (p: string, opts?: { silencioso?: boolean }) => {
    const silencioso = Boolean(opts?.silencioso);
    const enCache = dashboardPorPeriodoRef.current.get(p);
    if (enCache) {
      setAdminDashboard(enCache);
    }
    if (!silencioso) {
      setCargando(true);
    }

    const seq = ++fetchDashboardSeqRef.current;
    try {
      const dash = await fetchAdminDashboard(p);
      if (seq !== fetchDashboardSeqRef.current) return;
      if (!dash.cacheHit) {
        dashboardPorPeriodoRef.current.clear();
      }
      dashboardPorPeriodoRef.current.set(p, dash);
      setAdminDashboard(dash);
    } catch (err) {
      if (seq !== fetchDashboardSeqRef.current) return;
      throw err;
    } finally {
      if (seq === fetchDashboardSeqRef.current && !silencioso) {
        setCargando(false);
      }
    }
  }, []);

  const cargarDatos = useCallback(async (p = periodo, opts?: { silencioso?: boolean }) => {
    if (!usuario) return;
    const silencioso = Boolean(opts?.silencioso);
    setError('');
    try {
      if (usuario.rol === 'superadmin') {
        await cargarDashboardAdmin(p, { silencioso });
        return;
      }

      if (!silencioso) {
        setCargando(true);
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

      if (usuario.panelGlobal) {
        await cargarDashboardAdmin(p, { silencioso: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      if (!silencioso && usuario.rol !== 'superadmin') {
        setCargando(false);
      }
    }
  }, [usuario, periodo, cargarDashboardAdmin]);

  const cambiarPeriodo = useCallback((nuevoPeriodo: string) => {
    setPeriodo(nuevoPeriodo);
    const enCache = dashboardPorPeriodoRef.current.has(nuevoPeriodo);
    void cargarDatos(nuevoPeriodo, { silencioso: enCache });
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

  const onCrearLead = useCallback(async (data: NuevoLeadData, options?: NuevoLeadSaveOptions) => {
    try {
      const newLead = await crearLead(data, { promotorNombre: options?.promotorNombre });
      let leadFinal = newLead;
      if (options?.contactar) {
        const result = await guardarSeguimiento(newLead.id, {
          canal: 'mensaje',
          huboEntrevista: false,
        });
        leadFinal = result.lead;
      }
      setLeads((prev) => [...prev, leadFinal]);
      if (options?.contactar) {
        const nombrePromotor =
          options.promotorNombre?.trim() ||
          data.promotorNombre?.trim() ||
          usuario?.nombre?.trim();
        abrirChatWhatsApp(
          data.telefono.trim(),
          mensajeWhatsAppLead(data.nombre.trim(), nombrePromotor, false),
        );
      }
      setError('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear el lead';
      setError(msg);
      throw err;
    }
  }, [usuario]);

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
      <SuperadminDashboard data={adminDashboard} periodo={periodo} onCambiarPeriodo={cambiarPeriodo} cargando={cargando} />
    ) : tienePanelGlobal && vistaActiva === 'admin' ? (
      adminDashboard ? (
        <SuperadminDashboard data={adminDashboard} periodo={periodo} onCambiarPeriodo={cambiarPeriodo} cargando={cargando} />
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
