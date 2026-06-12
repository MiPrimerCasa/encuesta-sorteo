import { normalizeLoginId } from './operadores-catalog.js';

export function superadminLoginIds() {
  return (process.env.SUPERADMIN_LOGIN_IDS || '')
    .split(',')
    .map((s) => normalizeLoginId(s))
    .filter(Boolean);
}

export function esSuperadminLogin(loginId) {
  const id = normalizeLoginId(loginId);
  if (!id) return false;
  return superadminLoginIds().includes(id);
}

export function aplicarRolSuperadmin(usuario, loginId) {
  if (!usuario) return usuario;
  if (esSuperadminLogin(loginId ?? usuario.loginId)) {
    return { ...usuario, rol: 'superadmin', rolOrigen: 'env_superadmin' };
  }
  return usuario;
}

export function esSuperadminUsuario(usuario) {
  return usuario?.rol === 'superadmin';
}

/**
 * IDs operador SQL de supervisores para lectura batch de seguimiento (panel superadmin).
 * Formato: `132:Norma M,145:Adela` o `132,145`
 */
export function adminSupervisorOperadorIds() {
  const raw = process.env.ADMIN_SUPERVISOR_IDS || '';
  const ids = new Set();
  for (const part of raw.split(',')) {
    const token = part.trim().split(':')[0]?.trim();
    const n = Number.parseInt(token ?? '', 10);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  return [...ids];
}

/**
 * Login IDs de supervisores que además pueden ver el "Panel global" (superadmin dashboard).
 * Formato: comma-separated login IDs, ej: `federico@gmail.com,norma@gmail.com`
 */
export function panelGlobalLoginIds() {
  return (process.env.PANEL_GLOBAL_LOGIN_IDS || '')
    .split(',')
    .map((s) => normalizeLoginId(s))
    .filter(Boolean);
}

export function esSupervisorPanelGlobal(loginId) {
  const id = normalizeLoginId(loginId);
  if (!id) return false;
  return panelGlobalLoginIds().includes(id);
}

