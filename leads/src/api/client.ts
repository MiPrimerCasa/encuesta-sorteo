import type {
  Barrio,
  Lead,
  Producto,
  Promotor,
  RolUsuario,
  SeguimientoLead,
  UsuarioSesion,
} from '../types';

const STORAGE_KEY = 'mpc-crm-session';

export function getSession(): { token: string; usuario: UsuarioSesion } | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { token: string; usuario: UsuarioSesion };
  } catch {
    return null;
  }
}

export function setSession(token: string, usuario: UsuarioSesion) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, usuario }));
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
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
  }

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.message === 'string' ? data.message : 'Error en la solicitud';
    const detail = typeof data.detail === 'string' ? data.detail : '';
    throw new Error(detail && !msg.includes(detail) ? `${msg}\n\nDetalle: ${detail}` : msg);
  }
  return data as T;
}

export async function login(usuario: string, password: string) {
  return apiFetch<{ token: string; usuario: UsuarioSesion }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, password }),
  });
}

export async function fetchLeads() {
  const data = await apiFetch<{ leads: Lead[] }>('/api/leads');
  return data.leads;
}

export async function fetchPromotores() {
  const data = await apiFetch<{ promotores: Promotor[] }>('/api/promotores');
  return data.promotores;
}

export async function fetchBarrios() {
  const data = await apiFetch<{ barrios: Barrio[] }>('/api/barrios');
  return data.barrios;
}

export async function fetchProductos(rol: RolUsuario) {
  const data = await apiFetch<{ productos: Producto[] }>(`/api/productos?rol=${rol}`);
  return data.productos;
}

export async function guardarSeguimiento(leadId: string, seguimiento: SeguimientoLead) {
  const data = await apiFetch<{ lead: Lead; message: string }>(`/api/leads/${leadId}/seguimiento`, {
    method: 'PATCH',
    body: JSON.stringify(seguimiento),
  });
  return data.lead;
}
