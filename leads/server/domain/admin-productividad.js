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
  if (leadTuvoEntrevista(lead, historial)) return 'pendiente';
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

/** Métricas de embudo, eficiencia, backlog y cruce encuesta → cierre. */
export function buildAdminProductividad(leads, historialRows = [], ahora = new Date()) {
  const historialPorLead = indexHistorial(historialRows);

  let conEntrevista = 0;
  let conCierre = 0;
  const resultados = {
    compro: 0,
    no_compro: 0,
    reagenda: 0,
    sin_interes: 0,
    derivar_terreno: 0,
    pendiente: 0,
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
    const pb = promotorMap.get(pKey);
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

  const fuenteOrder = ['qr', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'app', 'otros'];

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
