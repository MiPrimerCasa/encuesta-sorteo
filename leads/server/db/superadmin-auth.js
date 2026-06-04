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
