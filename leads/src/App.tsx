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
import { getSession } from './api/client';
import { leerPeriodoDesdeUrl, actualizarAppQuery, resolverVistaInicial } from './domain/admin-url';
import { referidosPendientesDeCarga } from './domain/referidos-carga';
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
const ComisionesContablePanel = lazy(() =>
  import('./components/admin/ComisionesContablePanel').then((m) => ({
    default: m.ComisionesContablePanel,
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
  const [vistaActiva, setVistaActiva] = useState<VistaActiva>(() =>
    resolverVistaInicial(getSession()?.usuario ?? null),
  );
  const [leadIdSeguimiento, setLeadIdSeguimiento] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboardData | null>(null);
  const [periodo, setPeriodo] = useState<string>(() => leerPeriodoDesdeUrl() ?? 'mes');
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
    actualizarAppQuery({ periodo: nuevoPeriodo, esSuperadmin });
    const enCache = dashboardPorPeriodoRef.current.has(nuevoPeriodo);
    void cargarDatos(nuevoPeriodo, { silencioso: enCache });
  }, [cargarDatos, esSuperadmin]);

  const cambiarVista = useCallback((vista: VistaActiva) => {
    setVistaActiva(vista);
    actualizarAppQuery({ vista, esSuperadmin });
  }, [esSuperadmin]);

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
      if (
        result.message?.includes('referido') ||
        result.message?.includes('sistema integral') ||
        result.pijIntegral?.estado === 'error' ||
        result.pijIntegral?.estado === 'fotos_ok'
      ) {
        setAviso(result.message ?? '');
        setError('');
      }
      return result;
    },
    [],
  );

  const onLeadActualizado = useCallback((lead: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
  }, []);

  const onLeadSeguimientoConsumido = useCallback(() => {
    setLeadIdSeguimiento(null);
  }, []);

  const onCrearLead = useCallback(async (data: NuevoLeadData, options?: NuevoLeadSaveOptions) => {
    try {
      const newLead = await crearLead(data, { promotorNombre: options?.promotorNombre });
      let leadFinal = newLead;
      let nuevosLeads: Lead[] = [];
      // Misma regla que en seguimiento: nombre + teléfono ≥ 6 dígitos.
      const referidos = referidosPendientesDeCarga(
        options?.referidos ?? [],
        undefined,
        data.telefono,
      );
      const haySeguimientoPostAlta = Boolean(options?.contactar) || referidos.length > 0;

      if (haySeguimientoPostAlta) {
        const result = await guardarSeguimiento(newLead.id, {
          fuente: 'app',
          ...(options?.contactar
            ? { canal: 'mensaje' as const, huboEntrevista: false }
            : {}),
          ...(referidos.length > 0 ? { brindoReferidos: true, referidos } : {}),
        });
        leadFinal = result.lead;
        nuevosLeads = result.nuevosLeads ?? [];
        if (
          result.message?.includes('referido') ||
          (result.referidosCreados?.length ?? 0) > 0
        ) {
          setAviso(result.message ?? 'Referidos procesados.');
        }
      }

      // Igual que onActualizarLead: el lead padre + referidos nuevos entran al panel sin F5.
      setLeads((prev) => {
        const ids = new Set(prev.map((l) => l.id));
        let next = ids.has(leadFinal.id)
          ? prev.map((l) => (l.id === leadFinal.id ? leadFinal : l))
          : [...prev, leadFinal];
        if (!ids.has(leadFinal.id)) ids.add(leadFinal.id);
        for (const nl of nuevosLeads) {
          if (!ids.has(nl.id)) {
            next = [...next, nl];
            ids.add(nl.id);
          }
        }
        return next;
      });

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
    cargando && !adminDashboard && leads.length === 0 && vistaActiva !== 'comisiones' ? (
      <VistaCargando texto="Cargando datos…" />
    ) : vistaActiva === 'comisiones' && usuario.comisionesContable ? (
      <ComisionesContablePanel />
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
        onVolver={() => cambiarVista('leads')}
        onAbrirSeguimientoLead={(leadId) => {
          setLeadIdSeguimiento(leadId);
          cambiarVista('leads');
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
        onLeadActualizado={onLeadActualizado}
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
        onCambiarVista={cambiarVista}
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
