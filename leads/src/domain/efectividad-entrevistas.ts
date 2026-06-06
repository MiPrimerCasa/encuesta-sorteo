import type {
  EfectividadEntrevistasEquipo,
  EfectividadEntrevistasPromotor,
  Lead,
  Promotor,
  ResultadoEntrevista,
} from '../types';

const RESULTADOS_ENTREVISTA: ResultadoEntrevista[] = [
  'compro',
  'no_compro',
  'reagenda',
  'sin_interes',
  'derivar_terreno',
];

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function emptyBucket() {
  return {
    entrevistas: 0,
    compro: 0,
    noCompro: 0,
    sinInteres: 0,
    reagenda: 0,
    derivarTerreno: 0,
    pendiente: 0,
  };
}

/** Lead con entrevista realizada (alineado a admin-productividad / RF-26). */
export function leadTuvoEntrevistaRealizada(lead: Lead): boolean {
  if (lead.seguimiento?.huboEntrevista === true) return true;
  const res = lead.seguimiento?.resultadoEntrevista;
  return res != null && RESULTADOS_ENTREVISTA.includes(res);
}

function resultadoEntrevistaLead(lead: Lead): ResultadoEntrevista | 'pendiente' {
  const res = lead.seguimiento?.resultadoEntrevista;
  if (res) return res;
  if (leadTuvoEntrevistaRealizada(lead)) return 'pendiente';
  return 'pendiente';
}

function bumpBucket(
  bucket: ReturnType<typeof emptyBucket>,
  resultado: ResultadoEntrevista | 'pendiente',
) {
  bucket.entrevistas += 1;
  switch (resultado) {
    case 'compro':
      bucket.compro += 1;
      break;
    case 'no_compro':
      bucket.noCompro += 1;
      break;
    case 'sin_interes':
      bucket.sinInteres += 1;
      break;
    case 'reagenda':
      bucket.reagenda += 1;
      break;
    case 'derivar_terreno':
      bucket.derivarTerreno += 1;
      break;
    default:
      bucket.pendiente += 1;
  }
}

function bucketToPromotor(
  id: string,
  nombre: string,
  bucket: ReturnType<typeof emptyBucket>,
): EfectividadEntrevistasPromotor {
  return {
    id,
    nombre,
    entrevistas: bucket.entrevistas,
    compro: bucket.compro,
    noCompro: bucket.noCompro,
    sinInteres: bucket.sinInteres,
    reagenda: bucket.reagenda,
    derivarTerreno: bucket.derivarTerreno,
    pendiente: bucket.pendiente,
    tasaCierreEntrevistaPct: pct(bucket.compro, bucket.entrevistas),
  };
}

/**
 * RF-26 — efectividad de entrevistas del equipo para el supervisor.
 * Cuenta solo leads con entrevista realizada; la tasa es compras / entrevistas.
 */
export function buildEfectividadEntrevistasEquipo(
  leads: Lead[],
  promotores: Promotor[],
): EfectividadEntrevistasEquipo {
  const porId = new Map<string, ReturnType<typeof emptyBucket>>();
  for (const p of promotores) {
    porId.set(p.id, emptyBucket());
  }

  const resumen = emptyBucket();

  for (const lead of leads) {
    if (!leadTuvoEntrevistaRealizada(lead)) continue;
    const resultado = resultadoEntrevistaLead(lead);
    bumpBucket(resumen, resultado);

    const bucket = porId.get(lead.promotorId) ?? emptyBucket();
    bumpBucket(bucket, resultado);
    porId.set(lead.promotorId, bucket);
  }

  const porPromotor = promotores
    .map((p) => bucketToPromotor(p.id, p.nombre, porId.get(p.id) ?? emptyBucket()))
    .sort((a, b) => {
      if (b.entrevistas !== a.entrevistas) return b.entrevistas - a.entrevistas;
      return (b.tasaCierreEntrevistaPct ?? 0) - (a.tasaCierreEntrevistaPct ?? 0);
    });

  return {
    resumen: {
      entrevistas: resumen.entrevistas,
      compro: resumen.compro,
      noCompro: resumen.noCompro,
      sinInteres: resumen.sinInteres,
      reagenda: resumen.reagenda,
      derivarTerreno: resumen.derivarTerreno,
      pendiente: resumen.pendiente,
      tasaCierreEntrevistaPct: pct(resumen.compro, resumen.entrevistas),
    },
    porPromotor,
  };
}
