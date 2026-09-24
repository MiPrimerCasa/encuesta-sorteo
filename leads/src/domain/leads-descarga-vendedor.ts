import type { FuenteLead, Lead } from '../types';
import { FUENTE_LABEL } from './fuenteLabels';
import { tabIdListaLead } from './leads';

/** Orden pedido: manuales, redes sociales, QR. */
export type GrupoDescargaVendedor = 'manual' | 'redes' | 'qr';

export const ORDEN_GRUPOS_DESCARGA: GrupoDescargaVendedor[] = ['manual', 'redes', 'qr'];

export const TITULO_GRUPO_DESCARGA: Record<GrupoDescargaVendedor, string> = {
  manual: 'Carga manual',
  redes: 'Redes sociales',
  qr: 'QR',
};

const FUENTES_REDES = new Set<FuenteLead>(['facebook', 'instagram', 'whatsapp', 'tiktok']);

function fuenteDesdeOrigenEncuesta(raw: string | undefined): FuenteLead | null {
  const v = String(raw ?? '').toLowerCase().trim();
  if (!v) return null;
  if (v === '1' || v.includes('qr')) return 'qr';
  if (v === '4' || v.includes('face') || v.includes('fb') || v === 'facebook') return 'facebook';
  if (v === '3' || v.includes('insta') || v.includes('ig') || v === 'instagram') return 'instagram';
  if (v === '5' || v.includes('whats') || v.includes('wapp') || v === 'whatsapp') return 'whatsapp';
  if (v.includes('tik') || v === 'tiktok') return 'tiktok';
  if (
    v.includes('manual') ||
    v === '2' ||
    v === 'app' ||
    v.includes('aplicacion') ||
    v.includes('aplicación')
  ) {
    return 'app';
  }
  return null;
}

export function fuenteLeadDescarga(lead: Lead): FuenteLead | null {
  const guardada = lead.seguimiento?.fuente ?? null;
  if (
    guardada === 'qr' ||
    guardada === 'app' ||
    guardada === 'facebook' ||
    guardada === 'instagram' ||
    guardada === 'whatsapp' ||
    guardada === 'tiktok'
  ) {
    return guardada;
  }
  return fuenteDesdeOrigenEncuesta(lead.origenEncuesta);
}

/** Manual, redes o QR. El resto (encuesta asignada, etc.) queda fuera. */
export function grupoDescargaVendedor(lead: Lead): GrupoDescargaVendedor | null {
  const fuente = fuenteLeadDescarga(lead);
  if (fuente === 'app') return 'manual';
  if (fuente === 'qr') return 'qr';
  if (fuente && FUENTES_REDES.has(fuente)) return 'redes';
  return null;
}

export function etiquetaCanalDescarga(lead: Lead): string {
  const fuente = fuenteLeadDescarga(lead);
  if (!fuente) return '—';
  return FUENTE_LABEL[fuente] ?? fuente;
}

export function fechaIngresoLead(lead: Lead): string {
  const raw = lead.fechaAlta?.trim() || lead.fechaObtencion?.trim() || '';
  if (!raw) return '';
  return raw.includes('T') ? raw : `${raw}T00:00:00`;
}

/** Momento del último contacto guardado (sirve de corte contra la última descarga). */
export function fechaContactoDescarga(lead: Lead): string {
  const creado = lead.seguimiento?.creadoEn?.trim();
  if (creado) return creado.includes('T') ? creado : creado.replace(' ', 'T');
  return fechaIngresoLead(lead);
}

export function instanteIso(raw: string | null | undefined): number {
  const v = String(raw ?? '').trim();
  if (!v) return 0;
  const t = Date.parse(v.includes('T') ? v : v.replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : t;
}

export function formatearFechaDescarga(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  const fecha = d.toLocaleDateString('es-AR');
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fecha} ${hora}`;
}

export interface FilaDescargaVendedor {
  grupo: GrupoDescargaVendedor;
  tituloGrupo: string;
  canal: string;
  fechaIso: string;
  fecha: string;
  hora: string;
  nombre: string;
  telefono: string;
  domicilio: string;
}

function partirFechaHora(iso: string) {
  if (!iso) return { fecha: '', hora: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: iso.slice(0, 10), hora: '' };
  return {
    fecha: d.toLocaleDateString('es-AR'),
    hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

function ordenGrupo(grupo: GrupoDescargaVendedor) {
  return ORDEN_GRUPOS_DESCARGA.indexOf(grupo);
}

/**
 * Cargas contactadas del vendedor: manuales, luego redes, luego QR.
 * Fuera quedan prioridad, seguimiento y cierres.
 * Si hay corte, solo entran contactos posteriores a la última descarga.
 * Dentro de cada grupo, por fecha de ingreso (más antiguas primero).
 */
export function filasDescargaVendedor(
  leads: Lead[],
  desdeIso?: string | null,
): FilaDescargaVendedor[] {
  const corte = instanteIso(desdeIso);
  const filas: FilaDescargaVendedor[] = [];
  for (const lead of leads) {
    if (tabIdListaLead(lead) !== 'contacto') continue;
    const grupo = grupoDescargaVendedor(lead);
    if (!grupo) continue;
    if (corte && instanteIso(fechaContactoDescarga(lead)) <= corte) continue;
    const fechaIso = fechaIngresoLead(lead);
    const { fecha, hora } = partirFechaHora(fechaIso);
    filas.push({
      grupo,
      tituloGrupo: TITULO_GRUPO_DESCARGA[grupo],
      canal: etiquetaCanalDescarga(lead),
      fechaIso,
      fecha,
      hora,
      nombre: lead.nombre?.trim() || '—',
      telefono: lead.telefono?.trim() || '',
      domicilio: lead.domicilio?.trim() || '',
    });
  }

  filas.sort((a, b) => {
    const g = ordenGrupo(a.grupo) - ordenGrupo(b.grupo);
    if (g !== 0) return g;
    const f = a.fechaIso.localeCompare(b.fechaIso);
    if (f !== 0) return f;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return filas;
}
