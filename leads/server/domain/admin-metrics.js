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

export function rangoPorPeriodo(periodo, hoy = new Date()) {
  if (periodo === 'hoy') {
    return {
      desde: startOfDay(hoy),
      hasta: endOfDay(hoy),
      hoy: startOfDay(hoy),
    };
  }
  if (periodo === 'semana') {
    const hasta = endOfDay(hoy);
    const desde = startOfDay(hoy);
    desde.setDate(desde.getDate() - 6);
    return { desde, hasta, hoy: startOfDay(hoy) };
  }
  if (periodo && /^\d{4}-\d{2}-\d{2}$/.test(periodo)) {
    const parts = periodo.split('-');
    const parsedDate = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      12, 0, 0
    );
    return {
      desde: startOfDay(parsedDate),
      hasta: endOfDay(parsedDate),
      hoy: startOfDay(parsedDate),
    };
  }
  // Default 'mes'
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0, 0);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
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
    ventasTerrenoSenaSemana: 0,
    ventasTerrenoSenaHoy: 0,
    ventasPijSemana: 0,
    ventasPijHoy: 0,
    tratadosHoy: 0,
    tratadosSemana: 0,
    tratadosMes: 0,
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
    ventasTerrenoSenaSemana: (a.ventasTerrenoSenaSemana ?? 0) + (b.ventasTerrenoSenaSemana ?? 0),
    ventasTerrenoSenaHoy: (a.ventasTerrenoSenaHoy ?? 0) + (b.ventasTerrenoSenaHoy ?? 0),
    ventasPijSemana: a.ventasPijSemana + b.ventasPijSemana,
    ventasPijHoy: a.ventasPijHoy + b.ventasPijHoy,
    tratadosHoy: (a.tratadosHoy ?? 0) + b.tratadosHoy,
    tratadosSemana: (a.tratadosSemana ?? 0) + b.tratadosSemana,
    tratadosMes: (a.tratadosMes ?? 0) + b.tratadosMes,
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
  const terrenosSenaVistas = new Set();
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
      if (esTerrenoActual && !terrenosVistas.has(leadId) && !terrenosSenaVistas.has(leadId)) {
        const esSena = item.lead.seguimiento?.estadoPago === 'sena';
        if (esSena) {
          terrenosSenaVistas.add(leadId);
          eventos.push({ fecha: fecha.toISOString(), tipo: 'terreno_sena', supervisorNombre: supNombre });
        } else {
          terrenosVistas.add(leadId);
          eventos.push({ fecha: fecha.toISOString(), tipo: 'terreno', supervisorNombre: supNombre });
        }
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
export function buildAdminDashboard(leadsConSupervisor, historialRows = [], ahora = new Date(), periodo = 'mes') {
  const { desde, hasta, hoy } = rangoPorPeriodo(periodo, ahora);
  const rangeHoy = rangoPorPeriodo('hoy', ahora);
  const rangeSemana = rangoPorPeriodo('semana', ahora);
  const rangeMes = rangoPorPeriodo('mes', ahora);

  const historialPorLeadMap = new Map();
  for (const raw of historialRows) {
    const row = raw;
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    if (!leadId) continue;
    const fecha = parseFecha(fechaHistorial(row) ?? raw.creadoEn);
    if (!fecha) continue;
    if (!historialPorLeadMap.has(leadId)) {
      historialPorLeadMap.set(leadId, []);
    }
    historialPorLeadMap.get(leadId).push(fecha);
  }

  const leadTieneTratamientoEnRango = (lead, desdeVal, hastaVal) => {
    const fechasHistorial = historialPorLeadMap.get(String(lead.id)) ?? [];
    for (const f of fechasHistorial) {
      if (f.getTime() >= desdeVal.getTime() && f.getTime() <= hastaVal.getTime()) {
        return true;
      }
    }
    const seg = lead.seguimiento;
    if (seg && (seg.canal != null || seg.huboEntrevista != null)) {
      const fechaSeg = parseFecha(seg.creadoEn ?? seg.fechaCierre) ?? parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
      if (fechaSeg && fechaSeg.getTime() >= desdeVal.getTime() && fechaSeg.getTime() <= hastaVal.getTime()) {
        return true;
      }
    }
    return false;
  };

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

    if (leadTieneTratamientoEnRango(lead, rangeHoy.desde, rangeHoy.hasta)) {
      bucket.tratadosHoy += 1;
    }
    if (leadTieneTratamientoEnRango(lead, rangeSemana.desde, rangeSemana.hasta)) {
      bucket.tratadosSemana += 1;
    }
    if (leadTieneTratamientoEnRango(lead, rangeMes.desde, rangeMes.hasta)) {
      bucket.tratadosMes += 1;
    }

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
          if (lead.seguimiento?.idProducto === ID_PRODUCTO_TERRENO) {
            const esSeña = lead.seguimiento?.estadoPago === 'sena';
            if (esSeña) {
              bucket.ventasTerrenoSenaSemana += 1;
              // Seña NO cuenta como cierre ni como terreno en el informe
            } else {
              bucket.cierresSemana += 1;
              bucket.ventasTerrenoSemana += 1;
            }
          } else if (lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ) {
            bucket.cierresSemana += 1;
            bucket.ventasPijSemana += 1;
          } else {
            bucket.cierresSemana += 1;
          }
        }

        if (cierreEsHoy) {
          if (lead.seguimiento?.idProducto === ID_PRODUCTO_TERRENO) {
            const esSeña = lead.seguimiento?.estadoPago === 'sena';
            if (esSeña) {
              bucket.ventasTerrenoSenaHoy += 1;
            } else {
              bucket.cierresHoy += 1;
              bucket.ventasTerrenoHoy += 1;
            }
          } else if (lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ) {
            bucket.cierresHoy += 1;
            bucket.ventasPijHoy += 1;
          } else {
            bucket.cierresHoy += 1;
          }
        }
      }
    }

    const comprasAdicionales = lead.seguimiento?.comprasAdicionales ?? [];
    for (const compra of comprasAdicionales) {
      const fechaC = parseFecha(compra.fechaCierre);
      if (fechaC) {
        const cierreEnSemana = enRango(fechaC, desde, hasta);
        const cierreEsHoy = esMismoDia(fechaC, hoy);

        if (cierreEnSemana) {
          if (compra.idProducto === ID_PRODUCTO_TERRENO) {
            const esSeña = compra.estadoPago === 'sena';
            if (esSeña) {
              bucket.ventasTerrenoSenaSemana += 1;
            } else {
              bucket.cierresSemana += 1;
              bucket.ventasTerrenoSemana += 1;
            }
          } else if (compra.idProducto === ID_PRODUCTO_PIJ) {
            bucket.cierresSemana += 1;
            bucket.ventasPijSemana += 1;
          } else {
            bucket.cierresSemana += 1;
          }
        }

        if (cierreEsHoy) {
          if (compra.idProducto === ID_PRODUCTO_TERRENO) {
            const esSeña = compra.estadoPago === 'sena';
            if (esSeña) {
              bucket.ventasTerrenoSenaHoy += 1;
            } else {
              bucket.cierresHoy += 1;
              bucket.ventasTerrenoHoy += 1;
            }
          } else if (compra.idProducto === ID_PRODUCTO_PIJ) {
            bucket.cierresHoy += 1;
            bucket.ventasPijHoy += 1;
          } else {
            bucket.cierresHoy += 1;
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
        ventasTerrenoSenaSemana: 0,
        ventasTerrenoSenaHoy: 0,
        ventasPijSemana: 0,
        ventasPijHoy: 0,
        tratadosHoy: 0,
        tratadosSemana: 0,
        tratadosMes: 0,
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
  const terrenoCierresMap = new Map();
  const leadsSinTratar = [];

  for (const item of leadsConSupervisor) {
    const { lead, supervisorNombre } = item;
    const esCierre = lead.seguimiento?.resultadoEntrevista === 'compro';
    const esPij = lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ;
    const esTerreno = lead.seguimiento?.idProducto === ID_PRODUCTO_TERRENO;
    const operadorNombre = (lead.seguimiento?.operadorNombre || lead.promotorNombre || 'Sin asignar').trim();

    if (esCierre && esPij) {
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

    if (esCierre && esTerreno) {
      if (!terrenoCierresMap.has(operadorNombre)) {
        terrenoCierresMap.set(operadorNombre, []);
      }
      terrenoCierresMap.get(operadorNombre).push({
        leadId: String(lead.id),
        leadNombre: lead.nombre,
        leadTelefono: lead.telefono || '—',
        numeroRecibo: lead.seguimiento?.numeroRecibo || '—',
        idBarrio: lead.seguimiento?.idBarrio || null,
        fechaCierre: lead.seguimiento?.fechaCierre || lead.seguimiento?.creadoEn || lead.seguimiento?.creado_en || '',
        estadoPago: lead.seguimiento?.estadoPago || null,
      });
    }

    const comprasAdicionales = lead.seguimiento?.comprasAdicionales ?? [];
    for (const compra of comprasAdicionales) {
      if (compra.idProducto === ID_PRODUCTO_PIJ) {
        if (!pijCierresMap.has(operadorNombre)) {
          pijCierresMap.set(operadorNombre, []);
        }
        pijCierresMap.get(operadorNombre).push({
          leadId: String(lead.id),
          leadNombre: `${lead.nombre} (Adic.)`,
          leadTelefono: lead.telefono || '—',
          numeroAnexo: compra.numeroRecibo || '—',
          fechaCierre: compra.fechaCierre || '',
          estadoPago: compra.estadoPago || null,
        });
      } else if (compra.idProducto === ID_PRODUCTO_TERRENO) {
        if (!terrenoCierresMap.has(operadorNombre)) {
          terrenoCierresMap.set(operadorNombre, []);
        }
        terrenoCierresMap.get(operadorNombre).push({
          leadId: String(lead.id),
          leadNombre: `${lead.nombre} (Adic.)`,
          leadTelefono: lead.telefono || '—',
          numeroRecibo: compra.numeroRecibo || '—',
          idBarrio: compra.idBarrio || null,
          fechaCierre: compra.fechaCierre || '',
          estadoPago: compra.estadoPago || null,
        });
      }
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

  const todosOperadores = new Set([...pijCierresMap.keys(), ...terrenoCierresMap.keys()]);

  const pijCierresPorPersona = [...todosOperadores].map((operadorNombre) => {
    const cierres = pijCierresMap.get(operadorNombre) ?? [];
    const recibos = terrenoCierresMap.get(operadorNombre) ?? [];

    cierres.sort((a, b) => {
      const dateA = a.fechaCierre ? new Date(a.fechaCierre).getTime() : 0;
      const dateB = b.fechaCierre ? new Date(b.fechaCierre).getTime() : 0;
      return dateB - dateA;
    });

    recibos.sort((a, b) => {
      const dateA = a.fechaCierre ? new Date(a.fechaCierre).getTime() : 0;
      const dateB = b.fechaCierre ? new Date(b.fechaCierre).getTime() : 0;
      return dateB - dateA;
    });

    return {
      operadorNombre,
      cantidad: cierres.length,
      cierres,
      cantidadRecibos: recibos.length,
      recibos,
    };
  }).sort((a, b) => (b.cantidad + (b.cantidadRecibos ?? 0)) - (a.cantidad + (a.cantidadRecibos ?? 0)) || a.operadorNombre.localeCompare(b.operadorNombre, 'es'));

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
