import type { Referido, ReferidoProcesado, SeguimientoLead } from '../types';

function claveTelefono(raw: string) {
  return String(raw ?? '').replace(/\D/g, '') || String(raw ?? '').trim();
}

export function referidosPendientesDeCarga(
  referidos: Referido[],
  referidosGenerados: ReferidoProcesado[] | undefined,
  telefonoLeadPadre: string,
) {
  const vistos = new Set(
    (referidosGenerados ?? []).map((r) => claveTelefono(r.telefono)).filter(Boolean),
  );
  const telPadre = claveTelefono(telefonoLeadPadre);
  const pendientes: Referido[] = [];

  for (const ref of referidos) {
    const nombre = ref.nombre.trim();
    const tel = claveTelefono(ref.telefono);
    if (!nombre || tel.length < 6) continue;
    if (telPadre && tel === telPadre) continue;
    if (vistos.has(tel)) continue;
    vistos.add(tel);
    pendientes.push({ nombre, telefono: tel });
  }
  return pendientes;
}

export function mergeReferidosGenerados(
  prev: ReferidoProcesado[] = [],
  nuevos: ReferidoProcesado[] = [],
) {
  const map = new Map<string, ReferidoProcesado>();
  for (const r of prev) {
    const k = claveTelefono(r.telefono);
    if (k) map.set(k, r);
  }
  for (const r of nuevos) {
    const k = claveTelefono(r.telefono);
    if (k) map.set(k, r);
  }
  return [...map.values()];
}

export function mensajeReferidosCreados(resultados: ReferidoProcesado[]): string | null {
  const creados = resultados.filter((r) => r.estado === 'creado').length;
  const duplicados = resultados.filter((r) => r.estado === 'duplicado').length;
  const partes: string[] = [];
  if (creados) partes.push(`${creados} referido(s) cargado(s) como lead(s) nuevo(s)`);
  if (duplicados) partes.push(`${duplicados} ya estaban registrados`);
  return partes.length ? partes.join(' · ') : null;
}

export function debeProcesarReferidos(seguimiento: SeguimientoLead) {
  return (
    seguimiento.brindoReferidos === true && (seguimiento.referidos?.length ?? 0) > 0
  );
}
