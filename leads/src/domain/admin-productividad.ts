import type {
  AdminProductividad,
  FuenteLead,
  Lead,
  ResultadoEntrevista,
  SeguimientoHistorialEntry,
} from '../types';
import { FUENTE_LABEL } from './fuenteLabels';

type HistorialRow = SeguimientoHistorialEntry | Record<string, unknown>;

function parseFecha(val: string | Date | null | undefined) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? null : d;
}

function bitTrue(val: unknown) {
  return val === true || val === 1 || val === '1';
}

function filaIndicaEntrevista(row: HistorialRow) {
  const r = row as Record<string, unknown>;
  return bitTrue(r.hubo_entrevista ?? r.huboEntrevista);
}

function fechaHistorial(row: HistorialRow) {
  const r = row as Record<string, unknown>;
  return (
    (r.creado_en ??
      r.creadoEn ??
      r.fecha_registro ??
      r.fechaRegistro ??
      r.registrado_en ??
      (row as SeguimientoHistorialEntry).creadoEn) as string | undefined
  );
}

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function mediana(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function indexHistorial(rows: HistorialRow[]) {
  const map = new Map<string, HistorialRow[]>();
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const id = String(r.lead_id ?? r.leadId ?? '');
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(raw);
  }
  return map;
}

function leadCerro(lead: Lead, _historial: HistorialRow[]): boolean {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

function leadTuvoEntrevista(lead: Lead, historial: HistorialRow[]): boolean {
  if (lead.seguimiento?.huboEntrevista === true) return true;
  return historial.some((row) => filaIndicaEntrevista(row));
}

function leadSinGestion(lead: Lead, historial: HistorialRow[]): boolean {
  if (leadCerro(lead, historial)) return false;
  if (leadTuvoEntrevista(lead, historial)) return false;
  if (lead.seguimiento?.seguimientoPijPromotor === true) return false;
  if (lead.seguimiento?.resultadoEntrevista === 'reagenda') return false;
  return true;
}

function resultadoFinalLead(
  lead: Lead,
  historial: HistorialRow[],
): ResultadoEntrevista | 'pendiente' {
  if (leadCerro(lead, historial)) return 'compro';
  const res = lead.seguimiento?.resultadoEntrevista;
  if (res) return res;
  if (leadTuvoEntrevista(lead, historial)) return 'pendiente';
  return 'pendiente';
}

function primeraEntrevistaFecha(lead: Lead, historial: HistorialRow[]): Date | null {
  const fechas: number[] = [];
  for (const row of historial) {
    if (!filaIndicaEntrevista(row)) continue;
    const f = parseFecha(fechaHistorial(row));
    if (f) fechas.push(f.getTime());
  }
  if (lead.seguimiento?.huboEntrevista && lead.horarioEntrevista) {
    const h = parseFecha(lead.horarioEntrevista);
    if (h) fechas.push(h.getTime());
  }
  if (!fechas.length) return null;
  return new Date(Math.min(...fechas));
}

function leadTuvoSeguimientoPij(lead: Lead, historial: HistorialRow[]): boolean {
  if (lead.seguimiento?.seguimientoPijPromotor === true) return true;
  for (const row of historial) {
    const r = row as Record<string, unknown>;
    const snap = (r.seguimientoSnapshot ?? r) as Record<string, unknown>;
    if (bitTrue(snap.seguimientoPijPromotor ?? snap.seguimiento_pij_promotor)) return true;
  }
  return false;
}

function fuenteLead(lead: Lead): FuenteLead | 'otros' {
  return lead.seguimiento?.fuente ?? 'otros';
}

function diasDesdeAlta(lead: Lead, ahora: Date): number {
  const alta = parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
  if (!alta) return 0;
  return Math.floor((startOfDay(ahora).getTime() - startOfDay(alta).getTime()) / 86400000);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const RESULTADO_LABEL: Record<ResultadoEntrevista | 'pendiente', string> = {
  compro: 'Compró',
  no_compro: 'No compró',
  reagenda: 'Reagenda',
  sin_interes: 'Sin interés',
  derivar_terreno: 'Derivar terreno',
  pendiente: 'Sin resultado',
};

export { RESULTADO_LABEL as ADMIN_RESULTADO_ENTREVISTA_LABEL };

/** Métricas de embudo, eficiencia, backlog y cruce encuesta → cierre. */
export function buildAdminProductividad(
  leads: Lead[],
  historialRows: HistorialRow[] = [],
  ahora = new Date(),
): AdminProductividad {
  const historialPorLead = indexHistorial(historialRows);

  let conEntrevista = 0;
  let conCierre = 0;
  const resultados: Record<ResultadoEntrevista | 'pendiente', number> = {
    compro: 0,
    no_compro: 0,
    reagenda: 0,
    sin_interes: 0,
    derivar_terreno: 0,
    pendiente: 0,
  };
  const backlog = { sinGestion7: 0, sinGestion14: 0, sinGestion30: 0 };
  const diasHastaEntrevista: number[] = [];
  let pijSeguimiento = 0;
  let pijConCierre = 0;
  let cierresConReferidos = 0;
  let totalReferidos = 0;

  const promotorMap = new Map<
    string,
    {
      promotorId: string;
      promotorNombre: string;
      supervisorNombre: string;
      leads: number;
      entrevistas: number;
      cierres: number;
    }
  >();

  const canalMap = new Map<
    FuenteLead | 'otros',
    { leads: number; cierres: number }
  >();

  const conocimientoMap = new Map<string, { leads: number; cierres: number }>();

  function bumpConocimiento(label: string, cerro: boolean) {
    const cur = conocimientoMap.get(label) ?? { leads: 0, cierres: 0 };
    cur.leads += 1;
    if (cerro) cur.cierres += 1;
    conocimientoMap.set(label, cur);
  }

  for (const lead of leads) {
    const hist = historialPorLead.get(String(lead.id)) ?? [];
    const entrevista = leadTuvoEntrevista(lead, hist);
    const cierre = leadCerro(lead, hist);
    if (entrevista) conEntrevista += 1;
    if (cierre) conCierre += 1;

    const resultado = resultadoFinalLead(lead, hist);
    resultados[resultado] += 1;

    if (leadSinGestion(lead, hist)) {
      const dias = diasDesdeAlta(lead, ahora);
      if (dias >= 7) backlog.sinGestion7 += 1;
      if (dias >= 14) backlog.sinGestion14 += 1;
      if (dias >= 30) backlog.sinGestion30 += 1;
    }

    const primeraEnt = primeraEntrevistaFecha(lead, hist);
    const alta = parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
    if (primeraEnt && alta) {
      const dias = (startOfDay(primeraEnt).getTime() - startOfDay(alta).getTime()) / 86400000;
      if (dias >= 0) diasHastaEntrevista.push(Math.round(dias * 10) / 10);
    }

    if (leadTuvoSeguimientoPij(lead, hist)) {
      pijSeguimiento += 1;
      if (cierre) pijConCierre += 1;
    }

    if (cierre && lead.seguimiento?.brindoReferidos === true) {
      cierresConReferidos += 1;
      totalReferidos += lead.seguimiento.referidos?.length ?? 0;
    }

    const pKey = lead.promotorId;
    if (!promotorMap.has(pKey)) {
      promotorMap.set(pKey, {
        promotorId: lead.promotorId,
        promotorNombre: lead.promotorNombre ?? lead.promotorId,
        supervisorNombre: lead.supervisorNombre ?? 'Sin supervisor',
        leads: 0,
        entrevistas: 0,
        cierres: 0,
      });
    }
    const pb = promotorMap.get(pKey)!;
    pb.leads += 1;
    if (entrevista) pb.entrevistas += 1;
    if (cierre) pb.cierres += 1;

    const fuente = fuenteLead(lead);
    const cb = canalMap.get(fuente) ?? { leads: 0, cierres: 0 };
    cb.leads += 1;
    if (cierre) cb.cierres += 1;
    canalMap.set(fuente, cb);

    const mpcLabel =
      lead.conoceMpc === true
        ? 'Conoce MPC: Sí'
        : lead.conoceMpc === false
          ? 'Conoce MPC: No'
          : 'Conoce MPC: Sin dato';
    bumpConocimiento(mpcLabel, cierre);

    const pijLabel =
      lead.sabiaPlanInversionJoven === true
        ? 'Sabía PIJ: Sí'
        : lead.sabiaPlanInversionJoven === false
          ? 'Sabía PIJ: No'
          : 'Sabía PIJ: Sin dato';
    bumpConocimiento(pijLabel, cierre);
  }

  const total = leads.length;
  const promedioDias =
    diasHastaEntrevista.length > 0
      ? Math.round(
          (diasHastaEntrevista.reduce((a, b) => a + b, 0) / diasHastaEntrevista.length) * 10,
        ) / 10
      : null;

  const fuenteOrder: Array<FuenteLead | 'otros'> = [
    'qr',
    'facebook',
    'instagram',
    'whatsapp',
    'tiktok',
    'app',
    'otros',
  ];

  return {
    embudoGlobal: {
      leads: total,
      conEntrevista,
      conCierre,
      tasaEntrevistaPct: pct(conEntrevista, total),
      tasaCierreEntrevistaPct: pct(conCierre, conEntrevista),
      tasaCierreLeadPct: pct(conCierre, total),
    },
    embudoPromotores: [...promotorMap.values()]
      .map((p) => ({
        ...p,
        tasaEntrevistaPct: pct(p.entrevistas, p.leads),
        tasaCierrePct: pct(p.cierres, p.leads),
        tasaCierreEntrevistaPct: pct(p.cierres, p.entrevistas),
      }))
      .sort((a, b) => (b.tasaCierrePct ?? 0) - (a.tasaCierrePct ?? 0)),
    resultadosEntrevista: {
      compro: resultados.compro,
      no_compro: resultados.no_compro,
      reagenda: resultados.reagenda,
      sin_interes: resultados.sin_interes,
      derivar_terreno: resultados.derivar_terreno,
      pendiente: resultados.pendiente,
    },
    canales: fuenteOrder.map((f) => {
      const c = canalMap.get(f) ?? { leads: 0, cierres: 0 };
      return {
        fuente: f,
        label: f === 'otros' ? 'Otros' : FUENTE_LABEL[f],
        leads: c.leads,
        cierres: c.cierres,
        tasaCierrePct: pct(c.cierres, c.leads),
      };
    }),
    backlog,
    tiempoPrimeraEntrevista: {
      promedioDias,
      medianaDias: mediana(diasHastaEntrevista),
      muestras: diasHastaEntrevista.length,
    },
    conocimientoVsCierre: [...conocimientoMap.entries()]
      .map(([segmento, v]) => ({
        segmento,
        leads: v.leads,
        cierres: v.cierres,
        tasaCierrePct: pct(v.cierres, v.leads),
      }))
      .sort((a, b) => a.segmento.localeCompare(b.segmento, 'es')),
    pijRecuperacion: {
      totalSeguimiento: pijSeguimiento,
      conCierre: pijConCierre,
      tasaRecuperacionPct: pct(pijConCierre, pijSeguimiento),
    },
    referidos: {
      cierresConReferidos,
      totalReferidos,
    },
  };
}
