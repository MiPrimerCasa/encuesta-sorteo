const FUENTE_LABEL = {
  qr: 'QR',
  app: 'Manual',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
};

function parseFecha(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? null : d;
}

function bitTrue(val) {
  return val === true || val === 1 || val === '1';
}

function filaIndicaEntrevista(row) {
  return bitTrue(row.hubo_entrevista ?? row.huboEntrevista);
}

function fechaHistorial(row) {
  return row.creado_en ?? row.creadoEn ?? row.fecha_registro ?? row.fechaRegistro ?? row.registrado_en ?? null;
}

function pct(num, den) {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function mediana(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function indexHistorial(rows) {
  const map = new Map();
  for (const raw of rows) {
    const id = String(raw.lead_id ?? raw.leadId ?? '');
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(raw);
  }
  return map;
}

function leadCerro(lead, historial) {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

function leadTuvoEntrevista(lead, historial) {
  if (lead.seguimiento?.huboEntrevista === true) return true;
  return historial.some((row) => filaIndicaEntrevista(row));
}

function leadSinGestion(lead, historial) {
  if (leadCerro(lead, historial)) return false;
  if (leadTuvoEntrevista(lead, historial)) return false;
  if (lead.seguimiento?.seguimientoPijPromotor === true) return false;
  if (lead.seguimiento?.resultadoEntrevista === 'reagenda') return false;
  return true;
}

function resultadoFinalLead(lead, historial) {
  if (leadCerro(lead, historial)) return 'compro';
  const res = lead.seguimiento?.resultadoEntrevista;
  if (res) return res;
  if (lead.seguimiento?.canal == null && lead.seguimiento?.huboEntrevista == null) {
    return 'sin_tratar';
  }
  return 'pendiente';
}

function primeraEntrevistaFecha(lead, historial) {
  const fechas = [];
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

function leadTuvoSeguimientoPij(lead, historial) {
  if (lead.seguimiento?.seguimientoPijPromotor === true) return true;
  for (const row of historial) {
    const snap = row.seguimientoSnapshot ?? row;
    if (bitTrue(snap.seguimientoPijPromotor ?? snap.seguimiento_pij_promotor)) return true;
  }
  return false;
}

function fuenteLead(lead) {
  return lead.seguimiento?.fuente ?? 'otros';
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasDesdeAlta(lead, ahora) {
  const alta = parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
  if (!alta) return 0;
  return Math.floor((startOfDay(ahora).getTime() - startOfDay(alta).getTime()) / 86400000);
}

function enRangoFecha(fecha, desde, hasta) {
  if (!fecha) return false;
  const t = fecha.getTime();
  return t >= desde.getTime() && t <= hasta.getTime();
}

function leadIngresadoEnPeriodo(lead, desde, hasta) {
  const alta = parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
  return alta != null && enRangoFecha(alta, desde, hasta);
}

function fechaCierreLead(lead) {
  return parseFecha(
    lead.seguimiento?.fechaCierre ??
      lead.seguimiento?.creadoEn ??
      lead.seguimiento?.creado_en,
  );
}

function cierreEnPeriodo(lead, desde, hasta) {
  if (lead.seguimiento?.resultadoEntrevista !== 'compro') return false;
  const fc = fechaCierreLead(lead);
  return fc != null && enRangoFecha(fc, desde, hasta);
}

/** Cierres con referidos por fecha de cierre en el rango (todos los leads, no solo altas del período). */
function contarReferidosCierresPeriodo(leads, desde, hasta) {
  let cierresConReferidos = 0;
  let totalReferidos = 0;
  for (const lead of leads) {
    if (!cierreEnPeriodo(lead, desde, hasta)) continue;
    if (!bitTrue(lead.seguimiento?.brindoReferidos)) continue;
    cierresConReferidos += 1;
    totalReferidos += lead.seguimiento?.referidos?.length ?? 0;
  }
  return { cierresConReferidos, totalReferidos };
}

function seguimientoPijEnPeriodo(lead, hist, desde, hasta) {
  if (lead.seguimiento?.seguimientoPijPromotor === true) {
    const fc = parseFecha(lead.seguimiento?.creadoEn ?? lead.seguimiento?.creado_en);
    if (fc && enRangoFecha(fc, desde, hasta)) return true;
  }
  for (const row of hist) {
    const snap = row.seguimientoSnapshot ?? row;
    if (!bitTrue(snap.seguimientoPijPromotor ?? snap.seguimiento_pij_promotor)) continue;
    const f = parseFecha(fechaHistorial(row));
    if (f && enRangoFecha(f, desde, hasta)) return true;
  }
  return false;
}

function primeraEntrevistaEnPeriodo(lead, hist, desde, hasta) {
  const fechas = [];
  for (const row of hist) {
    if (!filaIndicaEntrevista(row)) continue;
    const f = parseFecha(fechaHistorial(row));
    if (f && enRangoFecha(f, desde, hasta)) fechas.push(f.getTime());
  }
  if (lead.seguimiento?.huboEntrevista && lead.horarioEntrevista) {
    const h = parseFecha(lead.horarioEntrevista);
    if (h && enRangoFecha(h, desde, hasta)) fechas.push(h.getTime());
  }
  if (!fechas.length) return null;
  return new Date(Math.min(...fechas));
}

/**
 * Métricas de productividad alineadas al período del informe cuando se pasa informeAlign.
 * @param {{ periodo: string, rango?: { desde: Date, hasta: Date }, totales: object, promotores: Array }} informeAlign
 */
export function buildAdminProductividad(leads, historialRows = [], ahora = new Date(), informeAlign = null) {
  const historialPorLead = indexHistorial(historialRows);
  const rango = informeAlign?.rango ?? null;
  const filtrarPorPeriodo = Boolean(rango?.desde && rango?.hasta);

  const resultados = {
    compro: 0,
    no_compro: 0,
    reagenda: 0,
    sin_interes: 0,
    derivar_terreno: 0,
    pendiente: 0,
    sin_tratar: 0,
  };
  const backlog = { sinGestion7: 0, sinGestion14: 0, sinGestion30: 0 };
  const diasHastaEntrevista = [];
  let pijSeguimiento = 0;
  let pijConCierre = 0;
  let cierresConReferidos = 0;
  let totalReferidos = 0;

  const promotorMap = new Map();
  const canalMap = new Map();
  const conocimientoMap = new Map();

  function bumpConocimiento(label, cerro) {
    const cur = conocimientoMap.get(label) ?? { leads: 0, cierres: 0 };
    cur.leads += 1;
    if (cerro) cur.cierres += 1;
    conocimientoMap.set(label, cur);
  }

  for (const lead of leads) {
    const hist = historialPorLead.get(String(lead.id)) ?? [];

    if (filtrarPorPeriodo && !leadIngresadoEnPeriodo(lead, rango.desde, rango.hasta)) {
      continue;
    }

    const cierre = filtrarPorPeriodo
      ? cierreEnPeriodo(lead, rango.desde, rango.hasta)
      : leadCerro(lead, hist);

    const resultado = resultadoFinalLead(lead, hist);
    resultados[resultado] += 1;

    if (leadSinGestion(lead, hist)) {
      const dias = diasDesdeAlta(lead, ahora);
      if (dias >= 7) backlog.sinGestion7 += 1;
      if (dias >= 14) backlog.sinGestion14 += 1;
      if (dias >= 30) backlog.sinGestion30 += 1;
    }

    const alta = parseFecha(lead.fechaAlta ?? lead.fechaObtencion);
    const primeraEnt = filtrarPorPeriodo
      ? primeraEntrevistaEnPeriodo(lead, hist, rango.desde, rango.hasta)
      : primeraEntrevistaFecha(lead, hist);
    if (primeraEnt && alta) {
      const dias = (startOfDay(primeraEnt).getTime() - startOfDay(alta).getTime()) / 86400000;
      if (dias >= 0) diasHastaEntrevista.push(Math.round(dias * 10) / 10);
    }

    const tuvoPij = filtrarPorPeriodo
      ? seguimientoPijEnPeriodo(lead, hist, rango.desde, rango.hasta)
      : leadTuvoSeguimientoPij(lead, hist);
    if (tuvoPij) {
      pijSeguimiento += 1;
      if (cierre) pijConCierre += 1;
    }

    if (!filtrarPorPeriodo && cierre && bitTrue(lead.seguimiento?.brindoReferidos)) {
      cierresConReferidos += 1;
      totalReferidos += lead.seguimiento?.referidos?.length ?? 0;
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
    const pb = promotorMap.get(pKey);
    pb.leads += 1;

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

  const total = filtrarPorPeriodo
    ? (informeAlign.totales.leadsSemana ?? 0)
    : leads.length;
  const promedioDias =
    diasHastaEntrevista.length > 0
      ? Math.round(
          (diasHastaEntrevista.reduce((a, b) => a + b, 0) / diasHastaEntrevista.length) * 10,
        ) / 10
      : null;

  const fuenteOrder = ['qr', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'app', 'otros'];

  const embudoPromotoresBase = [...promotorMap.values()].map((p) => ({
    ...p,
    tasaEntrevistaPct: pct(p.entrevistas, p.leads),
    tasaCierrePct: pct(p.cierres, p.leads),
    tasaCierreEntrevistaPct: pct(p.cierres, p.entrevistas),
  }));

  let embudoGlobalFinal = {
    leads: total,
    conEntrevista: 0,
    conCierre: 0,
    tasaEntrevistaPct: null,
    tasaCierreEntrevistaPct: null,
    tasaCierreLeadPct: null,
  };
  let embudoPromotoresFinal = embudoPromotoresBase;

  if (informeAlign) {
    const leadsPeriodo = informeAlign.totales.leadsSemana ?? total;
    const entrevistasPeriodo = informeAlign.totales.entrevistasSemana ?? 0;
    const cierresPeriodo = informeAlign.totales.cierresSemana ?? 0;
    embudoGlobalFinal = {
      leads: leadsPeriodo,
      conEntrevista: entrevistasPeriodo,
      conCierre: cierresPeriodo,
      tasaEntrevistaPct: pct(entrevistasPeriodo, leadsPeriodo),
      tasaCierreEntrevistaPct: pct(cierresPeriodo, entrevistasPeriodo),
      tasaCierreLeadPct: pct(cierresPeriodo, leadsPeriodo),
    };

    const informePorPromotor = new Map(
      (informeAlign.promotores ?? []).map((p) => [p.promotorId, p]),
    );
    const vistos = new Set();
    embudoPromotoresFinal = embudoPromotoresBase.map((p) => {
      vistos.add(p.promotorId);
      const inf = informePorPromotor.get(p.promotorId);
      const entrevistas = inf?.entrevistasSemana ?? 0;
      const cierres = inf?.cierresSemana ?? 0;
      return {
        ...p,
        entrevistas,
        cierres,
        tasaEntrevistaPct: pct(entrevistas, p.leads),
        tasaCierrePct: pct(cierres, p.leads),
        tasaCierreEntrevistaPct: pct(cierres, entrevistas),
      };
    });
    for (const inf of informeAlign.promotores ?? []) {
      if (vistos.has(inf.promotorId)) continue;
      if ((inf.entrevistasSemana ?? 0) <= 0 && (inf.cierresSemana ?? 0) <= 0) continue;
      const leadsProm = inf.leadsTotal ?? 0;
      const entrevistas = inf.entrevistasSemana ?? 0;
      const cierres = inf.cierresSemana ?? 0;
      embudoPromotoresFinal.push({
        promotorId: inf.promotorId,
        promotorNombre: inf.promotorNombre,
        supervisorNombre: inf.supervisorNombre ?? 'Sin supervisor',
        leads: leadsProm,
        entrevistas,
        cierres,
        tasaEntrevistaPct: pct(entrevistas, leadsProm),
        tasaCierrePct: pct(cierres, leadsProm),
        tasaCierreEntrevistaPct: pct(cierres, entrevistas),
      });
    }
    embudoPromotoresFinal.sort((a, b) => (b.tasaCierrePct ?? 0) - (a.tasaCierrePct ?? 0));
  } else {
    embudoPromotoresFinal.sort((a, b) => (b.tasaCierrePct ?? 0) - (a.tasaCierrePct ?? 0));
  }

  if (filtrarPorPeriodo && rango?.desde && rango?.hasta) {
    const refPeriodo = contarReferidosCierresPeriodo(leads, rango.desde, rango.hasta);
    cierresConReferidos = refPeriodo.cierresConReferidos;
    totalReferidos = refPeriodo.totalReferidos;
  }

  return {
    periodoEmbudo: informeAlign?.periodo ?? null,
    embudoGlobal: embudoGlobalFinal,
    embudoPromotores: embudoPromotoresFinal,
    resultadosEntrevista: { ...resultados },
    canales: fuenteOrder.map((f) => {
      const c = canalMap.get(f) ?? { leads: 0, cierres: 0 };
      return {
        fuente: f,
        label: f === 'otros' ? 'Otros' : (FUENTE_LABEL[f] ?? f),
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
