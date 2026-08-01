import type {
  AdminDashboardData,
  Barrio,
  GrabacionesConfigResponse,
  GrabacionesCumplimientoResponse,
  GrabacionesMiasResponse,
  GrabacionPromotor,
  GuardarSeguimientoResult,
  ImagenCierrePij,
  InformeCierresResponse,
  InformeCierrePeriodosResponse,
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
  VerificarTelefonoCargaResult,
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
  reassignDemoLead,
  getDemoOperadores,
  verificarTelefonoDemoCarga,
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
    if (session.usuario.codigoPromotor) {
      headers['x-usuario-codigo-promotor'] = session.usuario.codigoPromotor;
    }
    if (session.usuario.codigoSupervisor) {
      headers['x-usuario-codigo-supervisor'] = session.usuario.codigoSupervisor;
    }
    if (session.usuario.idVendedor) {
      headers['x-usuario-id-vendedor'] = session.usuario.idVendedor;
    }
    if (session.usuario.idSupervisor) {
      headers['x-usuario-id-supervisor'] = session.usuario.idSupervisor;
    }
    if (session.usuario.idOperador) {
      headers['x-usuario-id-operador'] = session.usuario.idOperador;
    }
    if (session.usuario.sucursal) {
      headers['x-usuario-sucursal'] = session.usuario.sucursal;
    }
    if (session.usuario.panelGlobal) {
      headers['x-usuario-panel-global'] = 'true';
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
        : typeof data.error === 'string'
          ? data.error
          : res.status === 401
          ? 'Usuario o contraseña incorrectos.'
          : res.status === 503
            ? 'Servidor o base de datos no disponible.'
            : `Error en la solicitud (${res.status})`;
    const detail = typeof data.detail === 'string' ? data.detail : '';
    const techDetail = typeof data.technicalDetail === 'string' ? data.technicalDetail : '';
    let errorMsg = msg;
    if (detail && !errorMsg.includes(detail)) {
      errorMsg += `\n\nDetalle: ${detail}`;
    }
    if (techDetail && !errorMsg.includes(techDetail)) {
      errorMsg += `\n\nTécnico: ${techDetail}`;
    }
    throw new Error(errorMsg);
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

export async function fetchRecibosOcupados(): Promise<import('../domain/pij-recibo').IndiceVentasOcupados> {
  if (_isDemoActive) {
    return {
      adhesiones: {
        A23: {
          cliente: 'Federico Ceballos Bertero',
          vendedor: 'Catherine Contreras',
          leadId: '233',
          esAdicional: false,
          reciboCompleto: 'A23/300 ANEXO 171',
        },
      },
      anexos: {
        ANEXO171: {
          cliente: 'Federico Ceballos Bertero',
          vendedor: 'Catherine Contreras',
          leadId: '233',
          esAdicional: false,
          reciboCompleto: 'A23/300 ANEXO 171',
        },
      },
      recibosTerreno: {},
    };
  }
  const data = await apiFetch<{
    adhesiones: import('../domain/pij-recibo').IndiceVentasOcupados['adhesiones'];
    anexos: import('../domain/pij-recibo').IndiceVentasOcupados['anexos'];
    recibosTerreno?: import('../domain/pij-recibo').IndiceVentasOcupados['recibosTerreno'];
    recibos?: import('../domain/pij-recibo').IndiceVentasOcupados['adhesiones'];
  }>('/api/leads/recibos-ocupados');
  return {
    adhesiones: data.adhesiones ?? data.recibos ?? {},
    anexos: data.anexos ?? {},
    recibosTerreno: data.recibosTerreno ?? {},
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

export async function fetchAdminDashboard(periodo?: string): Promise<AdminDashboardData> {
  if (_isDemoActive) return getDemoAdminDashboard(periodo);
  const url = periodo
    ? `/api/admin/dashboard?periodo=${encodeURIComponent(periodo)}`
    : '/api/admin/dashboard';
  return apiFetch<AdminDashboardData>(url);
}

export async function fetchInformeCierres(params?: {
  idOperador?: number;
  idEjercicioDetalle?: number;
  idVendedor?: number;
}): Promise<InformeCierresResponse> {
  if (_isDemoActive) {
    const vacio = {
      filas: 0,
      precioLote: 0,
      montoPactadoAdhesion: 0,
      senaRecuperada: 0,
      cantidadRecibosPeriodo: 0,
      montoCobradoEfectivo: 0,
      montoCobradoMep: 0,
      totalCobradoPeriodo: 0,
      saldoAdhesion: 0,
      adhesionCelebrada: 0,
      adhesionCancelada: 0,
      senaEnPeriodo: 0,
    };
    const seccionVacia = { totales: vacio, porVendedor: [], filas: [] };
    return {
      generadoEn: new Date().toISOString(),
      source: 'demo',
      params: {
        idOperador: params?.idOperador ?? 1,
        idEjercicioDetalle: params?.idEjercicioDetalle ?? 86,
        idVendedor: params?.idVendedor ?? 0,
      },
      totales: vacio,
      porVendedor: [],
      filas: [],
      pij: seccionVacia,
      terreno: seccionVacia,
      excel: {
        fuente: 'Demo',
        cantidad: 0,
        totalRecaudado: 0,
        montoUnitario: 33000,
        error: null,
      },
      resumenPanel: {
        adhesionesExcelCantidad: 0,
        adhesionesExcelTotal: 0,
        adhesionesExcelMontoUnitario: 33000,
        adhesionesExcelFuente: 'Demo',
        lotesCantidad: 0,
        lotesMontoTotal: 0,
      },
    };
  }
  const qs = new URLSearchParams();
  if (params?.idOperador != null) qs.set('idOperador', String(params.idOperador));
  if (params?.idEjercicioDetalle != null) {
    qs.set('idEjercicioDetalle', String(params.idEjercicioDetalle));
  }
  if (params?.idVendedor != null) qs.set('idVendedor', String(params.idVendedor));
  const q = qs.toString();
  return apiFetch(`/api/admin/informe-cierres${q ? `?${q}` : ''}`);
}

export async function fetchInformeCierresPeriodos(): Promise<InformeCierrePeriodosResponse> {
  if (_isDemoActive) {
    return {
      generadoEn: new Date().toISOString(),
      source: 'demo',
      periodos: [
        {
          idEjercicioDetalle: 91,
          idEjercicio: 8,
          codigo: 'Julio 2026',
          descripcion: 'Julio 2026',
          fechaDesde: '2026-07-01T00:00:00.000Z',
          fechaHasta: '2026-07-31T00:00:00.000Z',
          activo: true,
        },
        {
          idEjercicioDetalle: 86,
          idEjercicio: 8,
          codigo: 'Febrero 2026',
          descripcion: 'Febrero 2026',
          fechaDesde: '2026-02-01T00:00:00.000Z',
          fechaHasta: '2026-02-28T00:00:00.000Z',
          activo: true,
        },
      ],
    };
  }
  return apiFetch<InformeCierrePeriodosResponse>('/api/admin/informe-cierres/periodos');
}

export async function fetchAdminLeads(): Promise<Lead[]> {
  if (_isDemoActive) {
    return getDemoLeads();
  }
  const data = await apiFetch<{ leads: Lead[] }>('/api/admin/leads?referidos=1');
  return data.leads ?? [];
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
    pijIntegral?: GuardarSeguimientoResult['pijIntegral'];
  }>(`/api/leads/${leadId}/seguimiento`, {
    method: 'PATCH',
    body: JSON.stringify(seguimiento),
  });
  return {
    lead: data.lead,
    message: data.message,
    referidosCreados: data.referidosCreados,
    nuevosLeads: data.nuevosLeads,
    pijIntegral: data.pijIntegral ?? null,
  };
}

/** Reenvía bloqueo/fotos PIJ al sistema integral (SOAP). */
export async function reintentarPijIntegral(leadId: string): Promise<GuardarSeguimientoResult> {
  if (_isDemoActive) {
    throw new Error('Envío al sistema integral no disponible en modo demo.');
  }
  const data = await apiFetch<{
    lead: Lead;
    message: string;
    pijIntegral?: GuardarSeguimientoResult['pijIntegral'];
  }>(`/api/leads/${leadId}/pij-integral/reintentar`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    lead: data.lead,
    message: data.message,
    pijIntegral: data.pijIntegral ?? null,
  };
}

/** Alta manual vía dbo.encuestaCargaSorteo01 (producción) o demo local. */
export async function verificarTelefonoCarga(telefono: string): Promise<VerificarTelefonoCargaResult> {
  if (_isDemoActive) return verificarTelefonoDemoCarga(telefono);
  const q = encodeURIComponent(telefono.trim());
  return apiFetch<VerificarTelefonoCargaResult>(`/api/leads/verificar-telefono?telefono=${q}`);
}

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

export interface OperadorCatalogo {
  nombre: string;
  codigo: string;
  rol: 'promotor' | 'supervisor';
}

export async function fetchAdminOperadores(): Promise<OperadorCatalogo[]> {
  if (_isDemoActive) {
    return getDemoOperadores();
  }
  const data = await apiFetch<{ operadores: OperadorCatalogo[] }>('/api/admin/operadores');
  return data.operadores ?? [];
}

export async function reasignarLead(leadId: string, nuevoUsuarioCarga: string): Promise<Lead> {
  if (_isDemoActive) {
    return reassignDemoLead(leadId, nuevoUsuarioCarga);
  }
  const data = await apiFetch<{ lead: Lead; message?: string }>(
    `/api/admin/leads/${encodeURIComponent(leadId)}/reasignar`,
    {
      method: 'POST',
      body: JSON.stringify({ usuarioCarga: nuevoUsuarioCarga }),
    },
  );
  return data.lead;
}

export async function duplicarLead(leadId: string, codigoVendedorDestino: string): Promise<Lead> {
  if (_isDemoActive) {
    throw new Error('La duplicación de leads no está disponible en modo demo.');
  }
  const data = await apiFetch<{ lead: Lead; message?: string }>(
    `/api/admin/leads/${encodeURIComponent(leadId)}/duplicate`,
    {
      method: 'POST',
      body: JSON.stringify({ codigoVendedorDestino }),
    },
  );
  return data.lead;
}

export async function resetearLeadSeguimiento(leadId: string): Promise<Lead> {
  if (_isDemoActive) {
    throw new Error('El reseteo de leads no está disponible en modo demo.');
  }
  const data = await apiFetch<{ lead: Lead; message?: string }>(
    `/api/admin/leads/${encodeURIComponent(leadId)}/reset`,
    {
      method: 'POST',
    },
  );
  return data.lead;
}

export interface ModificarDatosLeadPayload {
  nombre: string;
  telefono: string;
  domicilio?: string;
  conoceMpc?: boolean | null;
  sabiaPlanInversionJoven?: boolean | null;
  quiereEntrevista?: boolean;
  horarioEntrevista?: string;
  lugarEntrevista?: 'sucursal' | 'domicilio';
  domicilioEntrevista?: string;
}

export async function modificarDatosLead(
  leadId: string,
  datos: ModificarDatosLeadPayload,
): Promise<Lead> {
  if (_isDemoActive) {
    throw new Error('La modificación de leads no está disponible en modo demo.');
  }
  const data = await apiFetch<{ lead: Lead; message?: string }>(
    `/api/admin/leads/${encodeURIComponent(leadId)}/datos`,
    {
      method: 'PATCH',
      body: JSON.stringify(datos),
    },
  );
  return data.lead;
}

import type { SyncPreviewResponse, SyncCommitResponse, SyncPreviewItem, FaltantesPijResponse } from '../types';

export interface SyncPreviewOptions {
  /** gids de pestañas de Google Sheets (ej. solo Junio: ['288750825']). */
  sheetGids?: string[];
  /** Corregir en CRM ventas con fecha julio usando la pestaña Junio de Caja. */
  corregirJulioConJunio?: boolean;
}

export async function previewSyncCajaPij(options: SyncPreviewOptions = {}): Promise<SyncPreviewResponse> {
  if (_isDemoActive) {
    return { cambiosPropuestos: [] };
  }
  return apiFetch<SyncPreviewResponse>('/api/admin/sync-caja-pij/preview', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function commitSyncCajaPij(
  cambiosAprobados: SyncPreviewItem[],
  tipo: 'fecha' | 'recibo' = 'fecha',
): Promise<SyncCommitResponse> {
  if (_isDemoActive) {
    return { actualizados: 0, tipo };
  }
  return apiFetch<SyncCommitResponse>('/api/admin/sync-caja-pij/commit', {
    method: 'POST',
    body: JSON.stringify({ cambiosAprobados, tipo }),
  });
}

export type FaltantesPijOptions = {
  /** Por defecto julio. */
  mes?: 'junio' | 'julio';
  sheetGids?: string[];
  /** CSV exportado del Excel de Caja (alternativa a Sheets). */
  csvText?: string;
};

export async function previewFaltantesPij(
  options: FaltantesPijOptions = {},
): Promise<FaltantesPijResponse> {
  if (_isDemoActive) {
    return {
      fuente: 'Demo',
      mesConsultado: options.mes ?? 'julio',
      resumen: {
        adhesionesExcel: 0,
        matched: 0,
        ambiguos: 0,
        faltantes: 0,
        vendedoresConFaltantes: 0,
        adhesionesIntegral: 0,
        integralEnCrm: 0,
        integralEnExcel: 0,
        integralSinCrm: 0,
        integralSinExcel: 0,
        excelSinIntegral: 0,
      },
      faltantes: [],
      ambiguos: [],
      porVendedor: [],
      porVendedorIntegral: [],
      integral: {
        periodo: null,
        source: 'demo',
        items: [],
        sinCrm: [],
        sinExcel: [],
        excelSinIntegral: [],
      },
    };
  }
  return apiFetch<FaltantesPijResponse>('/api/admin/reconciliar-pij/faltantes', {
    method: 'POST',
    body: JSON.stringify({
      mes: options.mes ?? 'julio',
      sheetGids: options.sheetGids,
      csvText: options.csvText,
    }),
  });
}

/** Evita cabeceras HTTP rotas (saltos de línea / no-Latin1). */
function headerSafe(value: string | number | null | undefined): string {
  const s = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 200);
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) return encodeURIComponent(s).slice(0, 400);
  }
  return s;
}

function authHeadersForSession(contentTypeJson = true): Record<string, string> {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (contentTypeJson) headers['Content-Type'] = 'application/json';
  if (!session) return headers;
  headers['x-usuario-id'] = String(session.usuario.id ?? '');
  headers['x-usuario-rol'] = String(session.usuario.rol ?? '');
  headers['x-usuario-nombre'] = headerSafe(session.usuario.nombre);
  if (session.usuario.loginId) headers['x-usuario-login-id'] = headerSafe(session.usuario.loginId);
  if (session.usuario.codigoCarga) headers['x-usuario-codigo-carga'] = headerSafe(session.usuario.codigoCarga);
  if (session.usuario.codigoPromotor) {
    headers['x-usuario-codigo-promotor'] = headerSafe(session.usuario.codigoPromotor);
  }
  if (session.usuario.codigoSupervisor) {
    headers['x-usuario-codigo-supervisor'] = headerSafe(session.usuario.codigoSupervisor);
  }
  if (session.usuario.idVendedor) headers['x-usuario-id-vendedor'] = String(session.usuario.idVendedor);
  if (session.usuario.idSupervisor) headers['x-usuario-id-supervisor'] = String(session.usuario.idSupervisor);
  if (session.usuario.idOperador) headers['x-usuario-id-operador'] = String(session.usuario.idOperador);
  if (session.usuario.sucursal) headers['x-usuario-sucursal'] = headerSafe(session.usuario.sucursal);
  if (session.usuario.panelGlobal) headers['x-usuario-panel-global'] = 'true';
  return headers;
}

export async function fetchGrabacionesConfig(): Promise<GrabacionesConfigResponse> {
  if (_isDemoActive) {
    return {
      moduloActivo: true,
      habilitado: _demoUsuario.rol === 'promotor',
      puedeAuditar: _demoUsuario.rol !== 'promotor',
      cuotaDiaria: 4,
      cuotaFranja: 2,
      maxAudiosMes: 20,
      minDuracionSeg: 0,
      formatos: ['.m4a', '.mp3', '.wav', '.ogg'],
      maxMb: 25,
      resumenHoy: {
        manana: 1,
        tarde: 0,
        total: 1,
        metaManana: 2,
        metaTarde: 2,
        metaTotal: 4,
        semaforoManana: 'amarillo',
        semaforoTarde: 'rojo',
        semaforoTotal: 'amarillo',
        cumple: false,
      },
      resumenTopeMes: {
        mesKey: new Date().toISOString().slice(0, 7),
        usados: 3,
        maximo: 20,
        restantes: 17,
      },
    };
  }
  return apiFetch<GrabacionesConfigResponse>('/api/grabaciones/config');
}

export async function fetchMisGrabaciones(fecha?: string): Promise<GrabacionesMiasResponse> {
  if (_isDemoActive) {
    const diaKey = fecha ?? new Date().toISOString().slice(0, 10);
    return {
      diaKey,
      resumen: {
        manana: 2,
        tarde: 1,
        total: 3,
        metaManana: 2,
        metaTarde: 2,
        metaTotal: 4,
        semaforoManana: 'verde',
        semaforoTarde: 'amarillo',
        semaforoTotal: 'amarillo',
        cumple: false,
      },
      resumenTopeMes: {
        mesKey: diaKey.slice(0, 7),
        usados: 5,
        maximo: 20,
        restantes: 15,
      },
      grabaciones: [
        {
          id: 1,
          promotorId: 'prom-1',
          promotorNombre: 'Martín González',
          leadId: '1001',
          leadNombre: 'Juan Pérez',
          tipo: 'entrevista',
          franja: 'manana',
          fechaGrabacion: `${diaKey}T09:15:00.000Z`,
          diaKey,
          duracionSeg: 142,
          mimeType: 'audio/mp4',
          tamanoBytes: 2_400_000,
          estado: 'activo',
          rechazadoPor: null,
          rechazadoEn: null,
          motivoRechazo: null,
          creadoEn: `${diaKey} 09:20:00`,
        },
        {
          id: 2,
          promotorId: 'prom-1',
          promotorNombre: 'Martín González',
          leadId: null,
          leadNombre: null,
          tipo: 'promocion',
          franja: 'manana',
          fechaGrabacion: `${diaKey}T10:30:00.000Z`,
          diaKey,
          duracionSeg: 95,
          mimeType: 'audio/mp4',
          tamanoBytes: 1_800_000,
          estado: 'activo',
          rechazadoPor: null,
          rechazadoEn: null,
          motivoRechazo: null,
          creadoEn: `${diaKey} 10:32:00`,
        },
        {
          id: 3,
          promotorId: 'prom-1',
          promotorNombre: 'Martín González',
          leadId: '1002',
          leadNombre: 'María López',
          tipo: 'entrevista',
          franja: 'tarde',
          fechaGrabacion: `${diaKey}T14:05:00.000Z`,
          diaKey,
          duracionSeg: 210,
          mimeType: 'audio/mp4',
          tamanoBytes: 3_100_000,
          estado: 'activo',
          rechazadoPor: null,
          rechazadoEn: null,
          motivoRechazo: null,
          creadoEn: `${diaKey} 14:08:00`,
        },
      ],
    };
  }
  const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
  return apiFetch<GrabacionesMiasResponse>(`/api/grabaciones/mias${q}`);
}

export async function uploadGrabacion(
  file: File,
  payload: { tipo: 'promocion' | 'entrevista'; leadId?: string; leadNombre?: string },
  onProgress?: (pct: number) => void,
): Promise<{
  grabacion: GrabacionPromotor;
  resumen: GrabacionesMiasResponse['resumen'];
  resumenTopeMes: GrabacionesMiasResponse['resumenTopeMes'];
}> {
  if (_isDemoActive) {
    throw new Error('Subida de grabaciones no disponible en modo demo.');
  }

  const form = new FormData();
  form.append('audio', file);
  form.append('tipo', payload.tipo);
  if (payload.leadId) form.append('leadId', payload.leadId);
  if (payload.leadNombre) form.append('leadNombre', payload.leadNombre);

  const url = apiUrl('/api/grabaciones/upload');
  const headers = authHeadersForSession(false);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        reject(new Error('Respuesta inválida del servidor'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(
          data as {
            grabacion: GrabacionPromotor;
            resumen: GrabacionesMiasResponse['resumen'];
            resumenTopeMes: GrabacionesMiasResponse['resumenTopeMes'];
          },
        );
        return;
      }
      const msg =
        typeof data.error === 'string'
          ? data.error
          : typeof data.message === 'string'
            ? data.message
            : `Error al subir (${xhr.status})`;
      reject(new Error(msg));
    };

    xhr.onerror = () => reject(new Error('No se pudo subir. Reintentá cuando tengas señal.'));
    xhr.send(form);
  });
}

export async function fetchGrabacionesCumplimiento(
  fecha?: string,
  promotorIds?: string[],
): Promise<GrabacionesCumplimientoResponse> {
  if (_isDemoActive) {
    const diaKey = fecha ?? new Date().toISOString().slice(0, 10);
    const filas = [
      {
        promotorId: 'prom-1',
        promotorNombre: 'Martín González',
        manana: 2,
        tarde: 1,
        total: 3,
        metaManana: 2,
        metaTarde: 2,
        metaTotal: 4,
        semaforoManana: 'verde' as const,
        semaforoTarde: 'amarillo' as const,
        semaforoTotal: 'amarillo' as const,
        cumple: false,
        grabaciones: [
          {
            id: 1,
            promotorId: 'prom-1',
            promotorNombre: 'Martín González',
            leadId: '1001',
            leadNombre: 'Juan Pérez',
            tipo: 'entrevista' as const,
            franja: 'manana' as const,
            fechaGrabacion: `${diaKey}T09:15:00.000Z`,
            diaKey,
            duracionSeg: 142,
            mimeType: 'audio/mp4',
            tamanoBytes: 2_400_000,
            estado: 'activo' as const,
            rechazadoPor: null,
            rechazadoEn: null,
            motivoRechazo: null,
            creadoEn: `${diaKey} 09:20:00`,
          },
        ],
      },
      {
        promotorId: 'prom-2',
        promotorNombre: 'Ana Rodríguez',
        manana: 1,
        tarde: 0,
        total: 1,
        metaManana: 2,
        metaTarde: 2,
        metaTotal: 4,
        semaforoManana: 'amarillo' as const,
        semaforoTarde: 'rojo' as const,
        semaforoTotal: 'rojo' as const,
        cumple: false,
        grabaciones: [],
      },
      {
        promotorId: 'prom-3',
        promotorNombre: 'Carlos López',
        manana: 2,
        tarde: 2,
        total: 4,
        metaManana: 2,
        metaTarde: 2,
        metaTotal: 4,
        semaforoManana: 'verde' as const,
        semaforoTarde: 'verde' as const,
        semaforoTotal: 'verde' as const,
        cumple: true,
        grabaciones: [],
      },
    ];
    const filtradas =
      promotorIds?.length
        ? filas.filter((f) => promotorIds.includes(f.promotorId))
        : filas;
    return {
      diaKey,
      promotoresConfig: DEMO_PROMOTORES.map((p) => ({ id: p.id, nombre: p.nombre })),
      filas: filtradas,
    };
  }
  const params = new URLSearchParams();
  if (fecha) params.set('fecha', fecha);
  if (promotorIds?.length) params.set('promotorIds', promotorIds.join(','));
  const q = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<GrabacionesCumplimientoResponse>(`/api/grabaciones/admin/cumplimiento${q}`);
}

export async function fetchGrabacionAudioBlob(id: number): Promise<string> {
  if (_isDemoActive) throw new Error('Audio no disponible en demo.');
  const res = await fetch(apiUrl(`/api/grabaciones/${id}/audio`), {
    headers: authHeadersForSession(false),
  });
  if (!res.ok) {
    let detalle = '';
    try {
      const body = (await res.json()) as { error?: string };
      detalle = body?.error?.trim() ?? '';
    } catch {
      /* respuesta no JSON */
    }
    if (res.status === 404 && detalle) {
      throw new Error(detalle);
    }
    throw new Error(detalle || 'No se pudo cargar el audio');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function aprobarGrabacion(id: number): Promise<GrabacionPromotor> {
  if (_isDemoActive) throw new Error('Aprobación no disponible en demo.');
  const data = await apiFetch<{ grabacion: GrabacionPromotor }>(
    `/api/grabaciones/${id}/aprobar`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return data.grabacion;
}

export async function rechazarGrabacion(id: number, motivo: string): Promise<GrabacionPromotor> {
  if (_isDemoActive) throw new Error('Rechazo no disponible en demo.');
  const data = await apiFetch<{ grabacion: GrabacionPromotor }>(
    `/api/grabaciones/${id}/rechazar`,
    {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    },
  );
  return data.grabacion;
}

export async function uploadImagenCierrePij(
  file: File,
  payload: {
    leadId: string;
    ventaKey: string;
    tipo: 'img1' | 'img2' | 'img5' | 'img6' | 'img7';
  },
  onProgress?: (pct: number) => void,
): Promise<{ imagen: ImagenCierrePij }> {
  if (_isDemoActive) {
    throw new Error('Subida de imágenes no disponible en modo demo.');
  }

  const form = new FormData();
  // Campos antes del archivo (multer / depuración); el servidor mueve a carpeta del lead.
  form.append('leadId', payload.leadId);
  form.append('ventaKey', payload.ventaKey);
  form.append('tipo', payload.tipo);
  form.append('imagen', file);

  const url = apiUrl('/api/cierres-pij/imagenes');
  const headers = authHeadersForSession(false);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    try {
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    } catch {
      reject(new Error('No se pudo armar la petición (revisá la sesión e intentá de nuevo).'));
      return;
    }

    xhr.upload.onprogress = (ev) => {
      if (!onProgress) return;
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      } else if (ev.loaded > 0) {
        onProgress(50);
      }
    };

    xhr.onload = () => {
      onProgress?.(100);
      const raw = String(xhr.responseText ?? '');
      let data: Record<string, unknown> = {};
      try {
        data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        const esHtml = /^\s*</.test(raw) || /text\/html/i.test(xhr.getResponseHeader('content-type') ?? '');
        reject(
          new Error(
            esHtml
              ? `El servidor no respondió JSON (${xhr.status}). Probá recargar la página (Ctrl+F5). Si sigue, el deploy de /leads puede estar desactualizado.`
              : `Respuesta inválida del servidor (${xhr.status}).`,
          ),
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const imagen = data.imagen as ImagenCierrePij | undefined;
        if (!imagen?.id || !imagen?.storagePath) {
          reject(new Error('El servidor no devolvió los datos de la imagen.'));
          return;
        }
        resolve({ imagen });
        return;
      }
      const msg =
        typeof data.error === 'string'
          ? data.error
          : typeof data.message === 'string'
            ? data.message
            : `Error al subir (${xhr.status})`;
      reject(new Error(msg));
    };

    xhr.onerror = () => reject(new Error('No se pudo subir. Reintentá cuando tengas señal.'));
    xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Probá una foto más liviana.'));
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

export async function fetchImagenCierrePijBlob(
  imageId: string,
  storagePath: string,
  mimeType?: string,
): Promise<string> {
  if (_isDemoActive) throw new Error('Imagen no disponible en demo.');
  const q = new URLSearchParams({
    path: storagePath,
    ...(mimeType ? { mime: mimeType } : {}),
  });
  const res = await fetch(apiUrl(`/api/cierres-pij/imagenes/${encodeURIComponent(imageId)}?${q}`), {
    headers: authHeadersForSession(false),
  });
  if (!res.ok) {
    let detalle = '';
    try {
      const body = (await res.json()) as { error?: string };
      detalle = body?.error?.trim() ?? '';
    } catch {
      /* respuesta no JSON */
    }
    throw new Error(detalle || 'No se pudo cargar la imagen');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

