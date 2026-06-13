import { buildAdminProductividad } from './admin-productividad.js';

const ID_PRODUCTO_PIJ = 'prod-pij';
const ID_PRODUCTO_TERRENO = 'prod-terreno';

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Semana móvil: hoy y los 6 días anteriores (7 días). */
export function rangoSemanaMovil(hoy = new Date()) {
  const hasta = endOfDay(hoy);
  const desde = startOfDay(hoy);
  desde.setDate(desde.getDate() - 6);
  return { desde, hasta, hoy: startOfDay(hoy) };
}

export function parseFecha(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function esMismoDia(a, b) {
  const da = parseFecha(a);
  const db = parseFecha(b);
  if (!da || !db) return false;
  return startOfDay(da).getTime() === startOfDay(db).getTime();
}

export function enRango(fecha, desde, hasta) {
  const d = parseFecha(fecha);
  if (!d) return false;
  const t = d.getTime();
  return t >= desde.getTime() && t <= hasta.getTime();
}

function bitTrue(val) {
  return val === true || val === 1 || val === '1';
}

export function filaIndicaEntrevista(row) {
  if (!row) return false;
  return bitTrue(row.hubo_entrevista ?? row.huboEntrevista);
}

export function filaIndicaCierre(row) {
  const res = String(row.resultado_entrevista ?? row.resultadoEntrevista ?? '').trim();
  return res === 'compro';
}

export function productoDesdeFila(row) {
  return String(row.id_producto ?? row.idProducto ?? '').trim() || null;
}

export function esVentaTerreno(row) {
  return filaIndicaCierre(row) && productoDesdeFila(row) === ID_PRODUCTO_TERRENO;
}

export function esVentaPij(row) {
  return filaIndicaCierre(row) && productoDesdeFila(row) === ID_PRODUCTO_PIJ;
}

function fechaHistorial(row) {
  return (
    row.creado_en ??
    row.creadoEn ??
    row.fecha_registro ??
    row.fechaRegistro ??
    row.registrado_en ??
    null
  );
}

function crearBucketPromotor(lead) {
  return {
    promotorId: lead.promotorId,
    promotorNombre: lead.promotorNombre ?? lead.promotorId,
    codigoCarga: lead.codigoPromotorCarga ?? undefined,
    leadsTotal: 0,
    leadsSemana: 0,
    entrevistasSemana: 0,
    entrevistasHoy: 0,
    cierresSemana: 0,
    cierresHoy: 0,
    ventasTerrenoSemana: 0,
    ventasTerrenoHoy: 0,
    ventasPijSemana: 0,
    ventasPijHoy: 0,
  };
}

function sumarBuckets(a, b) {
  return {
    leadsTotal: a.leadsTotal + b.leadsTotal,
    leadsSemana: a.leadsSemana + b.leadsSemana,
    entrevistasSemana: a.entrevistasSemana + b.entrevistasSemana,
    entrevistasHoy: a.entrevistasHoy + b.entrevistasHoy,
    cierresSemana: a.cierresSemana + b.cierresSemana,
    cierresHoy: a.cierresHoy + b.cierresHoy,
    ventasTerrenoSemana: a.ventasTerrenoSemana + b.ventasTerrenoSemana,
    ventasTerrenoHoy: a.ventasTerrenoHoy + b.ventasTerrenoHoy,
    ventasPijSemana: a.ventasPijSemana + b.ventasPijSemana,
    ventasPijHoy: a.ventasPijHoy + b.ventasPijHoy,
  };
}

function rankingDesdePromotores(promotores, campo, limite = 5) {
  return [...promotores]
    .filter((p) => (p[campo] ?? 0) > 0)
    .sort((a, b) => (b[campo] ?? 0) - (a[campo] ?? 0))
    .slice(0, limite)
    .map((p) => ({
      promotorId: p.promotorId,
      promotorNombre: p.promotorNombre,
      supervisorNombre: p.supervisorNombre,
      valor: p[campo] ?? 0,
    }));
}

export function buildAdminChartEvents(leadsConSupervisor, historialRows = []) {
  const eventos = [];
  const leadPorId = new Map();
  const entrevistasVistas = new Set();
  const cierresVistas = new Set();
  const terrenosVistas = new Set();
  const pijVistas = new Set();

  for (const item of leadsConSupervisor) {
    leadPorId.set(String(item.lead.id), item);
    const alta = parseFecha(item.lead.fechaAlta ?? item.lead.fechaObtencion);
    if (alta) {
      eventos.push({
        fecha: alta.toISOString(),
        tipo: 'lead',
        supervisorNombre: item.supervisorNombre,
      });
    }
  }

  for (const row of historialRows) {
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    const item = leadPorId.get(leadId);
    const fecha = parseFecha(fechaHistorial(row));
    if (!item || !fecha) continue;

    const supNombre = item.supervisorNombre;

    if (filaIndicaEntrevista(row)) {
      const key = `${leadId}|${fecha.toISOString().slice(0, 10)}`;
      if (!entrevistasVistas.has(key)) {
        entrevistasVistas.add(key);
        eventos.push({ fecha: fecha.toISOString(), tipo: 'entrevista', supervisorNombre: supNombre });
      }
    }
    if (filaIndicaCierre(row)) {
      const esCierreActual = item.lead.seguimiento?.resultadoEntrevista === 'compro';
      if (esCierreActual && !cierresVistas.has(leadId)) {
        cierresVistas.add(leadId);
        eventos.push({ fecha: fecha.toISOString(), tipo: 'cierre', supervisorNombre: supNombre });
      }
    }
    if (esVentaTerreno(row)) {
      const esTerrenoActual =
        item.lead.seguimiento?.resultadoEntrevista === 'compro' &&
        item.lead.seguimiento?.idProducto === 'prod-terreno';
      if (esTerrenoActual && !terrenosVistas.has(leadId)) {
        terrenosVistas.add(leadId);
        eventos.push({ fecha: fecha.toISOString(), tipo: 'terreno', supervisorNombre: supNombre });
      }
    }
    if (esVentaPij(row)) {
      const esPijActual =
        item.lead.seguimiento?.resultadoEntrevista === 'compro' &&
        item.lead.seguimiento?.idProducto === 'prod-pij';
      if (esPijActual && !pijVistas.has(leadId)) {
        pijVistas.add(leadId);
        eventos.push({ fecha: fecha.toISOString(), tipo: 'pij', supervisorNombre: supNombre });
      }
    }
  }

  return eventos;
}

function contarSiNoSin(leads, campo) {
  let si = 0;
  let no = 0;
  let sinResponder = 0;
  for (const lead of leads) {
    const val = lead[campo];
    if (val === true) si += 1;
    else if (val === false) no += 1;
    else sinResponder += 1;
  }
  return { si, no, sinResponder };
}

/** Totales de respuestas de encuesta sobre conocimiento de marca y PIJ. */
export function buildConocimientoEncuestaStats(leads) {
  return {
    total: leads.length,
    conoceMpc: contarSiNoSin(leads, 'conoceMpc'),
    sabiaPlanInversionJoven: contarSiNoSin(leads, 'sabiaPlanInversionJoven'),
  };
}

/**
 * @param {Array<{ lead: object, supervisorId: string, supervisorNombre: string }>} leadsConSupervisor
 * @param {Array<object>} historialRows
 */
export function buildAdminDashboard(leadsConSupervisor, historialRows = [], ahora = new Date()) {
  const { desde, hasta, hoy } = rangoSemanaMovil(ahora);

  const leadPorId = new Map();
  for (const item of leadsConSupervisor) {
    leadPorId.set(String(item.lead.id), item);
  }

  const supervisoresMap = new Map();

  for (const item of leadsConSupervisor) {
    const { lead, supervisorId, supervisorNombre } = item;
    if (!supervisoresMap.has(supervisorId)) {
      supervisoresMap.set(supervisorId, {
        supervisorId,
        supervisorNombre,
        promotoresMap: new Map(),
      });
    }
    const sup = supervisoresMap.get(supervisorId);
    if (!sup.promotoresMap.has(lead.promotorId)) {
      sup.promotoresMap.set(lead.promotorId, crearBucketPromotor(lead));
    }
    const bucket = sup.promotoresMap.get(lead.promotorId);
    bucket.leadsTotal += 1;

    const alta = parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
    if (alta && enRango(alta, desde, hasta)) {
      bucket.leadsSemana += 1;
    }

    // Calcular cierres y ventas directo del estado actual (ultimo seguimiento)
    const esCierre = lead.seguimiento?.resultadoEntrevista === 'compro';
    if (esCierre) {
      const fechaCierre = parseFecha(lead.seguimiento?.creadoEn ?? lead.seguimiento?.fechaCierre ?? lead.seguimiento?.creado_en);
      if (fechaCierre) {
        const cierreEnSemana = enRango(fechaCierre, desde, hasta);
        const cierreEsHoy = esMismoDia(fechaCierre, hoy);

        if (cierreEnSemana) {
          bucket.cierresSemana += 1;
          if (lead.seguimiento?.idProducto === ID_PRODUCTO_TERRENO) {
            bucket.ventasTerrenoSemana += 1;
          } else if (lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ) {
            bucket.ventasPijSemana += 1;
          }
        }

        if (cierreEsHoy) {
          bucket.cierresHoy += 1;
          if (lead.seguimiento?.idProducto === ID_PRODUCTO_TERRENO) {
            bucket.ventasTerrenoHoy += 1;
          } else if (lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ) {
            bucket.ventasPijHoy += 1;
          }
        }
      }
    }
  }

  const entrevistasPorLeadSemana = new Set();
  const entrevistasPorLeadHoy = new Set();

  for (const row of historialRows) {
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    const item = leadPorId.get(leadId);
    if (!item) continue;

    const fecha = parseFecha(fechaHistorial(row));
    if (!fecha) continue;

    const { lead, supervisorId } = item;
    const sup = supervisoresMap.get(supervisorId);
    if (!sup) continue;

    if (!sup.promotoresMap.has(lead.promotorId)) {
      sup.promotoresMap.set(lead.promotorId, crearBucketPromotor(lead));
    }
    const bucket = sup.promotoresMap.get(lead.promotorId);

    const enSemana = enRango(fecha, desde, hasta);
    const esHoy = esMismoDia(fecha, hoy);

    if (filaIndicaEntrevista(row)) {
      if (enSemana && !entrevistasPorLeadSemana.has(`${leadId}|${fecha.toISOString().slice(0, 10)}`)) {
        entrevistasPorLeadSemana.add(`${leadId}|${fecha.toISOString().slice(0, 10)}`);
        bucket.entrevistasSemana += 1;
      }
      if (esHoy && !entrevistasPorLeadHoy.has(leadId)) {
        entrevistasPorLeadHoy.add(leadId);
        bucket.entrevistasHoy += 1;
      }
    }
  }

  const supervisores = [...supervisoresMap.values()].map((sup) => {
    const promotores = [...sup.promotoresMap.values()].sort((a, b) =>
      a.promotorNombre.localeCompare(b.promotorNombre, 'es'),
    );
    const totales = promotores.reduce(
      (acc, p) => sumarBuckets(acc, p),
      {
        leadsTotal: 0,
        leadsSemana: 0,
        entrevistasSemana: 0,
        entrevistasHoy: 0,
        cierresSemana: 0,
        cierresHoy: 0,
        ventasTerrenoSemana: 0,
        ventasTerrenoHoy: 0,
        ventasPijSemana: 0,
        ventasPijHoy: 0,
      },
    );
    return {
      supervisorId: sup.supervisorId,
      supervisorNombre: sup.supervisorNombre,
      promotores,
      totales,
    };
  });

  supervisores.sort((a, b) => a.supervisorNombre.localeCompare(b.supervisorNombre, 'es'));

  const todosPromotores = supervisores.flatMap((s) =>
    s.promotores.map((p) => ({ ...p, supervisorNombre: s.supervisorNombre })),
  );

  const resumenHoy = todosPromotores.reduce(
    (acc, p) =>
      sumarBuckets(acc, {
        leadsTotal: 0,
        leadsSemana: 0,
        entrevistasSemana: 0,
        entrevistasHoy: p.entrevistasHoy,
        cierresSemana: 0,
        cierresHoy: p.cierresHoy,
        ventasTerrenoSemana: 0,
        ventasTerrenoHoy: p.ventasTerrenoHoy,
        ventasPijSemana: 0,
        ventasPijHoy: p.ventasPijHoy,
      }),
    {
      leadsTotal: 0,
      leadsSemana: 0,
      entrevistasSemana: 0,
      entrevistasHoy: 0,
      cierresSemana: 0,
      cierresHoy: 0,
      ventasTerrenoSemana: 0,
      ventasTerrenoHoy: 0,
      ventasPijSemana: 0,
      ventasPijHoy: 0,
    },
  );

  const pijCierresMap = new Map();
  const leadsSinTratar = [];

  for (const item of leadsConSupervisor) {
    const { lead, supervisorNombre } = item;
    const esCierre = lead.seguimiento?.resultadoEntrevista === 'compro';
    const esPij = lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ;
    if (esCierre && esPij) {
      const operadorNombre = (lead.seguimiento?.operadorNombre || lead.promotorNombre || 'Sin asignar').trim();
      if (!pijCierresMap.has(operadorNombre)) {
        pijCierresMap.set(operadorNombre, []);
      }
      pijCierresMap.get(operadorNombre).push({
        leadId: String(lead.id),
        leadNombre: lead.nombre,
        leadTelefono: lead.telefono || '—',
        numeroAnexo: lead.seguimiento?.numeroRecibo || '—',
        fechaCierre: lead.seguimiento?.fechaCierre || lead.seguimiento?.creadoEn || lead.seguimiento?.creado_en || '',
        estadoPago: lead.seguimiento?.estadoPago || null,
      });
    }

    // Coleccionar leads sin contactar o tratar (Inactivos)
    const sinTratar = lead.seguimiento?.canal == null && lead.seguimiento?.huboEntrevista == null;
    if (sinTratar && !esCierre) {
      leadsSinTratar.push({
        id: String(lead.id),
        nombre: lead.nombre,
        telefono: lead.telefono || '—',
        origen: lead.origenEncuesta || '—',
        fechaAlta: lead.fechaAlta || lead.fechaObtencion || '',
        promotorNombre: lead.promotorNombre || 'Sin promotor',
        supervisorNombre: supervisorNombre || 'Sin supervisor',
      });
    }
  }

  // Ordenar leads sin tratar por fecha (más antiguos primero)
  leadsSinTratar.sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta));

  const pijCierresPorPersona = [...pijCierresMap.entries()].map(([operadorNombre, cierres]) => {
    cierres.sort((a, b) => {
      const dateA = a.fechaCierre ? new Date(a.fechaCierre).getTime() : 0;
      const dateB = b.fechaCierre ? new Date(b.fechaCierre).getTime() : 0;
      return dateB - dateA;
    });
    return {
      operadorNombre,
      cantidad: cierres.length,
      cierres,
    };
  }).sort((a, b) => b.cantidad - a.cantidad || a.operadorNombre.localeCompare(b.operadorNombre, 'es'));

  return {
    generadoEn: ahora.toISOString(),
    semanaDesde: desde.toISOString(),
    semanaHasta: hasta.toISOString(),
    hoy: hoy.toISOString(),
    supervisores,
    resumenHoy: {
      entrevistas: resumenHoy.entrevistasHoy,
      cierres: resumenHoy.cierresHoy,
      ventasTerreno: resumenHoy.ventasTerrenoHoy,
      ventasPij: resumenHoy.ventasPijHoy,
    },
    rankings: {
      entrevistasSemana: rankingDesdePromotores(todosPromotores, 'entrevistasSemana'),
      cierresSemana: rankingDesdePromotores(todosPromotores, 'cierresSemana'),
      leadsSemana: rankingDesdePromotores(todosPromotores, 'leadsSemana'),
      ventasTerrenoSemana: rankingDesdePromotores(todosPromotores, 'ventasTerrenoSemana'),
      ventasPijSemana: rankingDesdePromotores(todosPromotores, 'ventasPijSemana'),
    },
    eventos: buildAdminChartEvents(leadsConSupervisor, historialRows),
    conocimientoLeads: buildConocimientoEncuestaStats(
      leadsConSupervisor.map((item) => item.lead),
    ),
    productividad: buildAdminProductividad(
      leadsConSupervisor.map((item) => item.lead),
      historialRows,
      ahora,
    ),
    pijCierresPorPersona,
    leadsSinTratar,
  };
}
