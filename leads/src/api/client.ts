import type {
  AdminDashboardData,
  Barrio,
  GuardarSeguimientoResult,
  Lead,
  LinksRedes,
  NotificacionLinkRed,
  NuevoLeadData,
  Producto,
  Promotor,
  ReferidoProcesado,
  RolUsuario,
  SeguimientoHistorialEntry,
  SeguimientoLead,
  UsuarioSesion,
} from '../types';
import { mensajeReferidosCreados } from '../domain/referidos-carga';
import {
  DEMO_BARRIOS,
  DEMO_PRODUCTOS,
  DEMO_PROMOTORES,
  DEMO_USUARIO,
  DEMO_USUARIO_PROMOTOR,
  DEMO_USUARIO_SUPERADMIN,
  createDemoLead,
  getDemoAdminDashboard,
  getDemoLeads,
  getDemoHistorialSeguimiento,
  getDemoLinksRedes,
  getDemoPromotoresParaSupervisor,
  processDemoReferidos,
  updateDemoLead,
  updateDemoLeadTelefono,
} from './demoData';

let _isDemoActive = import.meta.env.VITE_DEMO === 'true';
export function enableDemoMode(rol: 'supervisor' | 'promotor' | 'superadmin' = 'supervisor') {
  _isDemoActive = true;
  _demoUsuario =
    rol === 'promotor'
      ? DEMO_USUARIO_PROMOTOR
      : rol === 'superadmin'
        ? DEMO_USUARIO_SUPERADMIN
        : DEMO_USUARIO;
}

const STORAGE_KEY = 'mpc-crm-session';
let _demoUsuario: UsuarioSesion = DEMO_USUARIO;

/** En monorepo (/leads/) Vite usa BASE_URL=/leads/ → /leads/api/... */
function apiUrl(path: string) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const route = path.startsWith('/') ? path : `/${path}`;
  return `${base}${route}`;
}

export function getSession(): { token: string; usuario: UsuarioSesion } | null {
  if (_isDemoActive) return { token: 'demo', usuario: _demoUsuario };
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { token: string; usuario: UsuarioSesion };
  } catch {
    return null;
  }
}

export function setSession(token: string, usuario: UsuarioSesion) {
  if (_isDemoActive) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, usuario }));
}

export function clearSession() {
  if (_isDemoActive) return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isDemoMode() {
  return _isDemoActive;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (session) {
    headers['x-usuario-id'] = session.usuario.id;
    headers['x-usuario-rol'] = session.usuario.rol;
    headers['x-usuario-nombre'] = session.usuario.nombre;
    if (session.usuario.loginId) {
      headers['x-usuario-login-id'] = session.usuario.loginId;
    }
    if (session.usuario.codigoCarga) {
      headers['x-usuario-codigo-carga'] = session.usuario.codigoCarga;
    }
    if (session.usuario.idVendedor) {
      headers['x-usuario-id-vendedor'] = session.usuario.idVendedor;
    }
  }

  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new Error(
      'No se pudo conectar con el servidor. En local: ejecutá npm run dev:api en otra terminal.',
    );
  }

  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? `Ruta no encontrada (${url}). Si estás en producción, verificá el deploy del CRM en /leads.`
            : `Respuesta inválida del servidor (${res.status}).`,
        );
      }
    }
  }

  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : res.status === 401
          ? 'Usuario o contraseña incorrectos.'
          : res.status === 503
            ? 'Servidor o base de datos no disponible.'
            : `Error en la solicitud (${res.status})`;
    const detail = typeof data.detail === 'string' ? data.detail : '';
    throw new Error(detail && !msg.includes(detail) ? `${msg}\n\nDetalle: ${detail}` : msg);
  }
  return data as T;
}

export async function login(usuario: string, password: string) {
  if (_isDemoActive) {
    if (usuario === '__demo_promotor__') {
      _demoUsuario = DEMO_USUARIO_PROMOTOR;
    } else if (usuario === '__demo_superadmin__') {
      _demoUsuario = DEMO_USUARIO_SUPERADMIN;
    } else {
      _demoUsuario = DEMO_USUARIO;
    }
    return { token: 'demo', usuario: _demoUsuario };
  }
  return apiFetch<{ token: string; usuario: UsuarioSesion }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, password }),
  });
}

export async function fetchLeads(): Promise<{
  leads: Lead[];
  direccionOficinasSupervisor?: string;
}> {
  if (_isDemoActive) {
    const all = getDemoLeads();
    const leads =
      _demoUsuario.rol === 'promotor'
        ? all.filter((l) => l.promotorId === _demoUsuario.id)
        : all;
    const demoDir = leads.find((l) => l.lugarEntrevista === 'sucursal' && l.domicilioEntrevista)
      ?.domicilioEntrevista;
    return { leads, direccionOficinasSupervisor: demoDir };
  }
  const data = await apiFetch<{
    leads: Lead[];
    meta?: { direccionOficinasSupervisor?: string | null };
  }>('/api/leads');
  return {
    leads: data.leads,
    direccionOficinasSupervisor: data.meta?.direccionOficinasSupervisor ?? undefined,
  };
}

export async function fetchNotificacionesLinksRedes(): Promise<{
  total: number;
  items: NotificacionLinkRed[];
}> {
  if (_isDemoActive) {
    return { total: 0, items: [] };
  }
  return apiFetch('/api/notificaciones/links-redes');
}

export async function marcarNotificacionLinkVista(
  notificacionId: string,
): Promise<{ ok: boolean; total: number }> {
  if (_isDemoActive) {
    return { ok: true, total: 0 };
  }
  return apiFetch(`/api/notificaciones/links-redes/${encodeURIComponent(notificacionId)}/vista`, {
    method: 'POST',
  });
}

export async function fetchLinksRedes(): Promise<LinksRedes> {
  if (_isDemoActive) {
    const session = getSession();
    if (!session?.usuario) {
      throw new Error('Sin sesión de usuario.');
    }
    return getDemoLinksRedes(session.usuario);
  }
  const data = await apiFetch<{ links: LinksRedes }>('/api/links-redes');
  return data.links;
}

export async function fetchPromotores() {
  if (_isDemoActive) {
    const session = getSession();
    if (session?.usuario.rol === 'supervisor') {
      return getDemoPromotoresParaSupervisor(session.usuario);
    }
    return DEMO_PROMOTORES;
  }
  const data = await apiFetch<{ promotores: Promotor[] }>('/api/promotores');
  return data.promotores;
}

export async function fetchBarrios() {
  if (_isDemoActive) return DEMO_BARRIOS;
  const data = await apiFetch<{ barrios: Barrio[] }>('/api/barrios');
  return data.barrios;
}

export async function fetchProductos(rol: RolUsuario) {
  const rolFiltro = rol === 'superadmin' ? 'supervisor' : rol;
  if (_isDemoActive) {
    return DEMO_PRODUCTOS.filter((p) => p.rolesPermitidos.includes(rolFiltro));
  }
  const data = await apiFetch<{ productos: Producto[] }>(`/api/productos?rol=${rolFiltro}`);
  return data.productos;
}

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  if (_isDemoActive) return getDemoAdminDashboard();
  return apiFetch<AdminDashboardData>('/api/admin/dashboard');
}

export async function fetchHistorialSeguimiento(
  leadId: string,
): Promise<SeguimientoHistorialEntry[]> {
  if (_isDemoActive) {
    return getDemoHistorialSeguimiento(leadId);
  }
  const data = await apiFetch<{ historial: SeguimientoHistorialEntry[] }>(
    `/api/leads/${leadId}/historial`,
  );
  return data.historial ?? [];
}

export async function guardarSeguimiento(
  leadId: string,
  seguimiento: SeguimientoLead,
): Promise<GuardarSeguimientoResult> {
  if (_isDemoActive) {
    const usuario = getSession()?.usuario;
    const leadPadre = getDemoLeads().find((l) => l.id === leadId);
    let seg = seguimiento;
    let referidosCreados: ReferidoProcesado[] = [];
    let nuevosLeads: Lead[] = [];

    if (leadPadre) {
      const proc = processDemoReferidos(leadPadre, seguimiento);
      referidosCreados = proc.resultados;
      nuevosLeads = proc.nuevosLeads;
      if (proc.referidosGenerados?.length) {
        seg = { ...seguimiento, referidosGenerados: proc.referidosGenerados };
      }
    }

    const lead = updateDemoLead(leadId, seg, usuario);
    const extra = mensajeReferidosCreados(referidosCreados);
    return {
      lead,
      referidosCreados,
      nuevosLeads,
      message: extra ? `Seguimiento actualizado. ${extra}.` : 'Seguimiento actualizado.',
    };
  }
  const data = await apiFetch<{
    lead: Lead;
    message: string;
    historial?: SeguimientoHistorialEntry[];
    entradaHistorial?: SeguimientoHistorialEntry | null;
    aviso?: string;
    referidosCreados?: ReferidoProcesado[];
    nuevosLeads?: Lead[];
  }>(`/api/leads/${leadId}/seguimiento`, {
    method: 'PATCH',
    body: JSON.stringify(seguimiento),
  });
  return {
    lead: data.lead,
    message: data.message,
    referidosCreados: data.referidosCreados,
    nuevosLeads: data.nuevosLeads,
  };
}

/** Alta manual vía dbo.encuestaCargaSorteo01 (producción) o demo local. */
export async function crearLead(nuevoLead: NuevoLeadData, opciones?: { promotorNombre?: string }) {
  if (_isDemoActive) return createDemoLead(nuevoLead);
  const headers: Record<string, string> = {};
  if (opciones?.promotorNombre) {
    headers['x-promotor-nombre'] = opciones.promotorNombre;
  }
  const data = await apiFetch<{ lead: Lead; message?: string }>('/api/leads', {
    method: 'POST',
    headers,
    body: JSON.stringify(nuevoLead),
  });
  return data.lead;
}

export async function modificarTelefonoLead(leadId: string, telefono: string): Promise<Lead> {
  if (_isDemoActive) return updateDemoLeadTelefono(leadId, telefono);
  const data = await apiFetch<{ lead: Lead; message?: string }>(
    `/api/leads/${encodeURIComponent(leadId)}/telefono`,
    {
      method: 'PATCH',
      body: JSON.stringify({ telefono }),
    },
  );
  return data.lead;
}
