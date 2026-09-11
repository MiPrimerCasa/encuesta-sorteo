/**
 * Conteo oficial de PIJ para liquidación contable desde el CRM (leads/seguimiento),
 * no desde Excel de Caja.
 */
import { enRango, parseFecha, rangoPorPeriodo } from '../domain/admin-metrics.js';

const ID_PIJ = 'prod-pij';

function esPij(idProducto) {
  return String(idProducto || '') === ID_PIJ;
}

function nombreVendedor(lead) {
  return (
    String(lead?.promotorNombre || '').trim() ||
    (lead?.idVendedor != null ? `Vendedor ${lead.idVendedor}` : 'Sin vendedor')
  );
}

function fechaIsoCorta(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extrae planes PIJ (principal + adicionales) con fechaCierre en el mes YYYY-MM.
 * @param {object[]} leads
 * @param {string} yyyyMm
 */
export function buildPijLiquidacionDesdeLeads(leads, yyyyMm) {
  const list = Array.isArray(leads) ? leads : [];
  if (!yyyyMm || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyyMm)) {
    return {
      cantidad: 0,
      porVendedor: [],
      items: [],
      fuente: 'crm',
    };
  }

  const { desde, hasta } = rangoPorPeriodo(yyyyMm);
  /** @type {Map<string, { vendedor: string, cantidad: number, clientes: Array<{ nombre: string, recibo: string, fecha: string }> }>} */
  const porVend = new Map();
  /** @type {Array<{ nombreCliente: string, vendedor: string, recibo: string, fecha: string, fechaIso: string|null, leadId: string }>} */
  const items = [];

  function pushPlan(lead, plan) {
    const fecha = parseFecha(plan.fechaCierre ?? plan.creadoEn ?? plan.creado_en);
    if (!fecha || !enRango(fecha, desde, hasta)) return;
    if (!esPij(plan.idProducto)) return;

    const vendedor = nombreVendedor(lead);
    const nombreCliente = String(lead.nombre || '').trim();
    const recibo = String(plan.numeroRecibo || '').trim();
    const fechaIso = fechaIsoCorta(fecha);
    const fechaLabel = fechaIso;

    items.push({
      nombreCliente,
      vendedor,
      recibo,
      fecha: fechaLabel,
      fechaIso,
      leadId: String(lead.id || ''),
    });

    let g = porVend.get(vendedor);
    if (!g) {
      g = { vendedor, cantidad: 0, clientes: [] };
      porVend.set(vendedor, g);
    }
    g.cantidad += 1;
    g.clientes.push({ nombre: nombreCliente, recibo, fecha: fechaLabel });
  }

  for (const lead of list) {
    const seg = lead?.seguimiento;
    if (!seg || seg.resultadoEntrevista !== 'compro') continue;

    // Plan principal
    pushPlan(lead, {
      idProducto: seg.idProducto,
      fechaCierre: seg.fechaCierre,
      creadoEn: seg.creadoEn ?? seg.creado_en,
      numeroRecibo: seg.numeroRecibo,
    });

    for (const c of seg.comprasAdicionales ?? []) {
      pushPlan(lead, c);
    }
  }

  const porVendedor = [...porVend.values()].sort((a, b) => {
    if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad;
    return a.vendedor.localeCompare(b.vendedor, 'es');
  });

  return {
    cantidad: items.length,
    porVendedor,
    items,
    fuente: 'crm',
  };
}
