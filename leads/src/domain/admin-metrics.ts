import type {
  AdminChartEvent,
  AdminConocimientoLeads,
  AdminDashboardData,
  Lead,
  RankingAdminEntry,
  SeguimientoHistorialEntry,
} from '../types';
import { buildAdminProductividad } from './admin-productividad';

const ID_PRODUCTO_PIJ = 'prod-pij';
const ID_PRODUCTO_TERRENO = 'prod-terreno';

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Rango de fechas por periodo: hoy, semana o mes. */
export function rangoPorPeriodo(periodo: string, hoy = new Date()) {
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

function parseFecha(val: string | Date | null | undefined) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? null : d;
}

function esMismoDia(a: string | Date, b: Date) {
  const da = parseFecha(a);
  if (!da) return false;
  return startOfDay(da).getTime() === startOfDay(b).getTime();
}

function enRango(fecha: string | Date, desde: Date, hasta: Date) {
  const d = parseFecha(fecha);
  if (!d) return false;
  const t = d.getTime();
  return t >= desde.getTime() && t <= hasta.getTime();
}

function bitTrue(val: unknown) {
  return val === true || val === 1 || val === '1';
}

function filaIndicaEntrevista(row: Record<string, unknown>) {
  return bitTrue(row.hubo_entrevista ?? row.huboEntrevista);
}

function filaIndicaCierre(row: Record<string, unknown>) {
  return String(row.resultado_entrevista ?? row.resultadoEntrevista ?? '').trim() === 'compro';
}

function productoDesdeFila(row: Record<string, unknown>) {
  return String(row.id_producto ?? row.idProducto ?? '').trim() || null;
}

export function esVentaTerreno(row: Record<string, unknown>) {
  return filaIndicaCierre(row) && productoDesdeFila(row) === ID_PRODUCTO_TERRENO;
}

export function esVentaPij(row: Record<string, unknown>) {
  return filaIndicaCierre(row) && productoDesdeFila(row) === ID_PRODUCTO_PIJ;
}

function fechaHistorial(row: Record<string, unknown>) {
  return (
    (row.creado_en ??
      row.creadoEn ??
      row.fecha_registro ??
      row.fechaRegistro ??
      row.registrado_en) as string | undefined
  );
}

function normalizeSupervisorKey(nombre?: string) {
  return (nombre ?? 'Sin supervisor')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

type PromotorBucket = AdminDashboardData['supervisores'][0]['promotores'][0];

function crearBucketPromotor(lead: Lead): PromotorBucket {
  return {
    promotorId: lead.promotorId,
    promotorNombre: lead.promotorNombre ?? lead.promotorId,
    codigoCarga: lead.codigoPromotorCarga,
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
    tratadosHoy: 0,
    tratadosSemana: 0,
    tratadosMes: 0,
  };
}

function sumarBuckets(
  a: AdminDashboardData['supervisores'][0]['totales'],
  b: PromotorBucket,
): AdminDashboardData['supervisores'][0]['totales'] {
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
    tratadosHoy: (a.tratadosHoy ?? 0) + b.tratadosHoy,
    tratadosSemana: (a.tratadosSemana ?? 0) + b.tratadosSemana,
    tratadosMes: (a.tratadosMes ?? 0) + b.tratadosMes,
  };
}

function rankingDesdePromotores(
  promotores: Array<PromotorBucket & { supervisorNombre?: string }>,
  campo: keyof PromotorBucket,
  limite = 5,
): RankingAdminEntry[] {
  return [...promotores]
    .filter((p) => typeof p[campo] === 'number' && (p[campo] as number) > 0)
    .sort((a, b) => (b[campo] as number) - (a[campo] as number))
    .slice(0, limite)
    .map((p) => ({
      promotorId: p.promotorId,
      promotorNombre: p.promotorNombre,
      supervisorNombre: p.supervisorNombre,
      valor: p[campo] as number,
    }));
}

type LeadConSupervisor = {
  lead: Lead;
  supervisorNombre: string;
};

/** Eventos para gráficos temporales (leads + historial). */
export function buildAdminChartEvents(
  leadsConSupervisor: LeadConSupervisor[],
  historialRows: Array<SeguimientoHistorialEntry | Record<string, unknown>> = [],
) {
  const eventos: AdminChartEvent[] = [];
  const leadPorId = new Map<string, LeadConSupervisor>();
  const entrevistasVistas = new Set<string>();
  const cierresVistas = new Set<string>();
  const terrenosVistas = new Set<string>();
  const pijVistas = new Set<string>();

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

  for (const raw of historialRows) {
    const row = raw as Record<string, unknown>;
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    const item = leadPorId.get(leadId);
    const fecha = parseFecha(fechaHistorial(row) ?? (raw as SeguimientoHistorialEntry).creadoEn);
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

function contarSiNoSin(leads: Lead[], campo: 'conoceMpc' | 'sabiaPlanInversionJoven') {
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
export function buildConocimientoEncuestaStats(leads: Lead[]): AdminConocimientoLeads {
  return {
    total: leads.length,
    conoceMpc: contarSiNoSin(leads, 'conoceMpc'),
    sabiaPlanInversionJoven: contarSiNoSin(leads, 'sabiaPlanInversionJoven'),
  };
}

/** Construye dashboard admin desde leads + filas de historial (demo o cliente). */
export function buildAdminDashboardFromLeads(
  leads: Lead[],
  historialRows: Array<SeguimientoHistorialEntry | Record<string, unknown>> = [],
  ahora = new Date(),
  periodo = 'mes',
): AdminDashboardData {
  const { desde, hasta, hoy } = rangoPorPeriodo(periodo, ahora);
  const rangeHoy = rangoPorPeriodo('hoy', ahora);
  const rangeSemana = rangoPorPeriodo('semana', ahora);
  const rangeMes = rangoPorPeriodo('mes', ahora);

  const historialPorLeadMap = new Map<string, Date[]>();
  for (const raw of historialRows) {
    const row = raw as Record<string, unknown>;
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    if (!leadId) continue;
    const fecha = parseFecha(fechaHistorial(row) ?? (raw as SeguimientoHistorialEntry).creadoEn);
    if (!fecha) continue;
    if (!historialPorLeadMap.has(leadId)) {
      historialPorLeadMap.set(leadId, []);
    }
    historialPorLeadMap.get(leadId)!.push(fecha);
  }

  const leadTieneTratamientoEnRango = (lead: Lead, desdeVal: Date, hastaVal: Date): boolean => {
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

  const leadsConSupervisor = leads.map((lead) => ({
    lead,
    supervisorId: normalizeSupervisorKey(lead.supervisorNombre),
    supervisorNombre: lead.supervisorNombre ?? 'Sin supervisor',
  }));

  const leadPorId = new Map(leadsConSupervisor.map((item) => [String(item.lead.id), item]));
  const supervisoresMap = new Map<
    string,
    { supervisorId: string; supervisorNombre: string; promotoresMap: Map<string, PromotorBucket> }
  >();

  for (const item of leadsConSupervisor) {
    const { lead, supervisorId, supervisorNombre } = item;
    if (!supervisoresMap.has(supervisorId)) {
      supervisoresMap.set(supervisorId, { supervisorId, supervisorNombre, promotoresMap: new Map() });
    }
    const sup = supervisoresMap.get(supervisorId)!;
    if (!sup.promotoresMap.has(lead.promotorId)) {
      sup.promotoresMap.set(lead.promotorId, crearBucketPromotor(lead));
    }
    const bucket = sup.promotoresMap.get(lead.promotorId)!;
    
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
    if (alta && enRango(alta, desde, hasta)) bucket.leadsSemana += 1;

    const esCierre = lead.seguimiento?.resultadoEntrevista === 'compro';
    if (esCierre) {
      const fechaCierre = parseFecha(lead.seguimiento?.creadoEn ?? lead.seguimiento?.fechaCierre);
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

    const comprasAdicionales = lead.seguimiento?.comprasAdicionales ?? [];
    for (const compra of comprasAdicionales) {
      const fechaC = parseFecha(compra.fechaCierre);
      if (fechaC) {
        const cierreEnSemana = enRango(fechaC, desde, hasta);
        const cierreEsHoy = esMismoDia(fechaC, hoy);

        if (cierreEnSemana) {
          bucket.cierresSemana += 1;
          if (compra.idProducto === ID_PRODUCTO_TERRENO) {
            bucket.ventasTerrenoSemana += 1;
          } else if (compra.idProducto === ID_PRODUCTO_PIJ) {
            bucket.ventasPijSemana += 1;
          }
        }

        if (cierreEsHoy) {
          bucket.cierresHoy += 1;
          if (compra.idProducto === ID_PRODUCTO_TERRENO) {
            bucket.ventasTerrenoHoy += 1;
          } else if (compra.idProducto === ID_PRODUCTO_PIJ) {
            bucket.ventasPijHoy += 1;
          }
        }
      }
    }
  }

  const entrevistasPorLeadSemana = new Set<string>();
  const entrevistasPorLeadHoy = new Set<string>();

  for (const raw of historialRows) {
    const row = raw as Record<string, unknown>;
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    const item = leadPorId.get(leadId);
    if (!item) continue;

    const fecha = parseFecha(fechaHistorial(row) ?? (raw as SeguimientoHistorialEntry).creadoEn);
    if (!fecha) continue;

    const { lead, supervisorId } = item;
    const sup = supervisoresMap.get(supervisorId);
    if (!sup) continue;

    if (!sup.promotoresMap.has(lead.promotorId)) {
      sup.promotoresMap.set(lead.promotorId, crearBucketPromotor(lead));
    }
    const bucket = sup.promotoresMap.get(lead.promotorId)!;

    const enSemana = enRango(fecha, desde, hasta);
    const esHoy = esMismoDia(fecha, hoy);

    if (filaIndicaEntrevista(row)) {
      const keySem = `${leadId}|${fecha.toISOString().slice(0, 10)}`;
      if (enSemana && !entrevistasPorLeadSemana.has(keySem)) {
        entrevistasPorLeadSemana.add(keySem);
        bucket.entrevistasSemana += 1;
      }
      if (esHoy && !entrevistasPorLeadHoy.has(leadId)) {
        entrevistasPorLeadHoy.add(leadId);
        bucket.entrevistasHoy += 1;
      }
    }
  }


  const emptyTotales = (): AdminDashboardData['supervisores'][0]['totales'] => ({
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
    tratadosHoy: 0,
    tratadosSemana: 0,
    tratadosMes: 0,
  });

  const supervisores = [...supervisoresMap.values()]
    .map((sup) => {
      const promotores = [...sup.promotoresMap.values()].sort((a, b) =>
        a.promotorNombre.localeCompare(b.promotorNombre, 'es'),
      );
      const totales = promotores.reduce((acc, p) => sumarBuckets(acc, p), emptyTotales());
      return {
        supervisorId: sup.supervisorId,
        supervisorNombre: sup.supervisorNombre,
        promotores,
        totales,
      };
    })
    .sort((a, b) => a.supervisorNombre.localeCompare(b.supervisorNombre, 'es'));

  const todosPromotores = supervisores.flatMap((s) =>
    s.promotores.map((p) => ({ ...p, supervisorNombre: s.supervisorNombre })),
  );

  const resumenHoy = todosPromotores.reduce(
    (acc, p) => ({
      entrevistas: acc.entrevistas + p.entrevistasHoy,
      cierres: acc.cierres + p.cierresHoy,
      ventasTerreno: acc.ventasTerreno + p.ventasTerrenoHoy,
      ventasPij: acc.ventasPij + p.ventasPijHoy,
    }),
    { entrevistas: 0, cierres: 0, ventasTerreno: 0, ventasPij: 0 },
  );

  const pijCierresMap = new Map<string, Array<{
    leadId: string;
    leadNombre: string;
    leadTelefono: string;
    numeroAnexo: string;
    fechaCierre: string;
    estadoPago: string | null;
  }>>();

  const terrenoCierresMap = new Map<string, Array<{
    leadId: string;
    leadNombre: string;
    leadTelefono: string;
    numeroRecibo: string;
    idBarrio: string | null;
    fechaCierre: string;
    estadoPago: string | null;
  }>>();

  for (const item of leadsConSupervisor) {
    const { lead } = item;
    const esCierre = lead.seguimiento?.resultadoEntrevista === 'compro';
    const esPij = lead.seguimiento?.idProducto === ID_PRODUCTO_PIJ;
    const esTerreno = lead.seguimiento?.idProducto === ID_PRODUCTO_TERRENO;
    const operadorNombre = (lead.seguimiento?.operadorNombre || lead.promotorNombre || 'Sin asignar').trim();

    if (esCierre && esPij) {
      if (!pijCierresMap.has(operadorNombre)) {
        pijCierresMap.set(operadorNombre, []);
      }
      pijCierresMap.get(operadorNombre)!.push({
        leadId: String(lead.id),
        leadNombre: lead.nombre,
        leadTelefono: lead.telefono || '—',
        numeroAnexo: lead.seguimiento?.numeroRecibo || '—',
        fechaCierre: lead.seguimiento?.fechaCierre || lead.seguimiento?.creadoEn || '',
        estadoPago: lead.seguimiento?.estadoPago || null,
      });
    }

    if (esCierre && esTerreno) {
      if (!terrenoCierresMap.has(operadorNombre)) {
        terrenoCierresMap.set(operadorNombre, []);
      }
      terrenoCierresMap.get(operadorNombre)!.push({
        leadId: String(lead.id),
        leadNombre: lead.nombre,
        leadTelefono: lead.telefono || '—',
        numeroRecibo: lead.seguimiento?.numeroRecibo || '—',
        idBarrio: lead.seguimiento?.idBarrio || null,
        fechaCierre: lead.seguimiento?.fechaCierre || lead.seguimiento?.creadoEn || '',
        estadoPago: lead.seguimiento?.estadoPago || null,
      });
    }

    const comprasAdicionales = lead.seguimiento?.comprasAdicionales ?? [];
    for (const compra of comprasAdicionales) {
      if (compra.idProducto === ID_PRODUCTO_PIJ) {
        if (!pijCierresMap.has(operadorNombre)) {
          pijCierresMap.set(operadorNombre, []);
        }
        pijCierresMap.get(operadorNombre)!.push({
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
        terrenoCierresMap.get(operadorNombre)!.push({
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
  }

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
    resumenHoy,
    rankings: {
      entrevistasSemana: rankingDesdePromotores(todosPromotores, 'entrevistasSemana'),
      cierresSemana: rankingDesdePromotores(todosPromotores, 'cierresSemana'),
      leadsSemana: rankingDesdePromotores(todosPromotores, 'leadsSemana'),
      ventasTerrenoSemana: rankingDesdePromotores(todosPromotores, 'ventasTerrenoSemana'),
      ventasPijSemana: rankingDesdePromotores(todosPromotores, 'ventasPijSemana'),
    },
    eventos: buildAdminChartEvents(
      leadsConSupervisor.map(({ lead, supervisorNombre }) => ({ lead, supervisorNombre })),
      historialRows,
    ),
    conocimientoLeads: buildConocimientoEncuestaStats(leads),
    productividad: buildAdminProductividad(leads, historialRows, ahora),
    totalLeads: leads.length,
    totalSupervisores: supervisores.length,
    pijCierresPorPersona,
  };
}

export function formatRangoSemana(desde: string, hasta: string) {
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  if (d1.toDateString() === d2.toDateString()) {
    return fmt(d1);
  }
  return `${fmt(d1)} — ${fmt(d2)}`;
}
