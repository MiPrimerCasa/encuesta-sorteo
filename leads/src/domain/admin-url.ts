import { esPeriodoAnio, esPeriodoDia, esPeriodoMesCalendario } from './admin-periodo';
import type { UsuarioSesion, VistaActiva } from '../types';

export const ADMIN_TABS = [
  'metricas',
  'buscador',
  'sin_tratar',
  'reasignacion',
  'informe',
  'informe_cierres',
  'grabaciones',
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

const VISTAS: VistaActiva[] = [
  'leads',
  'promotores',
  'metricas',
  'calendario',
  'admin',
  'grabacion',
  'comisiones',
];

const TAB_DEFAULT: AdminTab = 'metricas';
const PERIODO_DEFAULT = 'mes';

export function esAdminTab(val: string | null | undefined): val is AdminTab {
  return Boolean(val && (ADMIN_TABS as readonly string[]).includes(val));
}

export function esVistaActiva(val: string | null | undefined): val is VistaActiva {
  return Boolean(val && VISTAS.includes(val as VistaActiva));
}

export function esPeriodoAdminUrl(val: string | null | undefined): val is string {
  if (!val) return false;
  return (
    val === 'hoy'
    || val === 'semana'
    || val === 'mes'
    || val === 'anio'
    || esPeriodoAnio(val)
    || esPeriodoMesCalendario(val)
    || esPeriodoDia(val)
  );
}

export function vistaPermitida(usuario: UsuarioSesion, vista: VistaActiva): boolean {
  if (usuario.rol === 'superadmin') return vista === 'admin';
  if (vista === 'admin') return Boolean(usuario.panelGlobal);
  if (vista === 'comisiones') return Boolean(usuario.comisionesContable);
  if (vista === 'promotores') return usuario.rol === 'supervisor';
  if (vista === 'metricas' || vista === 'grabacion') return usuario.rol === 'promotor';
  return vista === 'leads' || vista === 'calendario';
}

/** Vista inicial según URL y sesión (panel global, tab, período). */
export function resolverVistaInicial(usuario: UsuarioSesion | null): VistaActiva {
  if (!usuario) return 'leads';
  if (usuario.rol === 'superadmin') return 'admin';

  const params = new URLSearchParams(window.location.search);
  const vistaUrl = params.get('vista');
  if (esVistaActiva(vistaUrl) && vistaPermitida(usuario, vistaUrl)) {
    return vistaUrl;
  }

  if ((params.has('tab') || params.has('periodo')) && usuario.panelGlobal) {
    return 'admin';
  }

  return 'leads';
}

export function leerTabDesdeUrl(): AdminTab {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return esAdminTab(tab) ? tab : TAB_DEFAULT;
}

export function leerPeriodoDesdeUrl(): string | null {
  const periodo = new URLSearchParams(window.location.search).get('periodo');
  return esPeriodoAdminUrl(periodo) ? periodo : null;
}

export interface AppQueryUpdate {
  vista?: VistaActiva;
  tab?: AdminTab;
  periodo?: string;
  esSuperadmin?: boolean;
}

/** Actualiza ?vista=, ?tab= y/o ?periodo= sin recargar la página. */
export function actualizarAppQuery(partial: AppQueryUpdate) {
  const url = new URL(window.location.href);
  const esSuperadmin = Boolean(partial.esSuperadmin);

  if (partial.vista !== undefined) {
    if (esSuperadmin || partial.vista === 'leads') {
      url.searchParams.delete('vista');
    } else {
      url.searchParams.set('vista', partial.vista);
    }
    if (partial.vista !== 'admin') {
      url.searchParams.delete('tab');
      url.searchParams.delete('periodo');
    }
  }

  if (partial.tab !== undefined) {
    if (partial.tab === TAB_DEFAULT) url.searchParams.delete('tab');
    else url.searchParams.set('tab', partial.tab);
  }

  if (partial.periodo !== undefined) {
    if (!partial.periodo || partial.periodo === PERIODO_DEFAULT) {
      url.searchParams.delete('periodo');
    } else {
      url.searchParams.set('periodo', partial.periodo);
    }
  }

  if (
    !esSuperadmin
    && (partial.tab !== undefined || partial.periodo !== undefined)
    && partial.vista === undefined
    && url.searchParams.get('vista') !== 'admin'
  ) {
    url.searchParams.set('vista', 'admin');
  }

  const search = url.searchParams.toString();
  const destino = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  window.history.replaceState(null, '', destino);
}

/** @deprecated Usar actualizarAppQuery */
export const actualizarAdminQuery = actualizarAppQuery;
