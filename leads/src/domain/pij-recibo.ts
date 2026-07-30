/** Utilidades PIJ — serie/adhesión/anexo (compartido formulario + validación). */

export type SeriePij = 'A' | 'B';

export type PijReciboParseado = {
  serie: SeriePij;
  adhesion: string;
  anexo: string;
};

export type OcupanteVentaIndice = {
  cliente: string;
  vendedor: string;
  leadId: string;
  esAdicional: boolean;
  compraId?: string;
  reciboCompleto: string;
  idProducto?: 'prod-pij' | 'prod-terreno';
};

/** @deprecated alias */
export type OcupantePijIndice = OcupanteVentaIndice;

export type IndiceVentasOcupados = {
  adhesiones: Record<string, OcupanteVentaIndice>;
  anexos: Record<string, OcupanteVentaIndice>;
  recibosTerreno: Record<string, OcupanteVentaIndice>;
};

/** @deprecated alias */
export type IndicePijOcupados = IndiceVentasOcupados;

export type ExcluirRegistroVenta = {
  leadId?: string;
  /** Excluir venta principal del lead (edición sin cambiar documento). */
  esPrincipal?: boolean;
  compraId?: string;
};

/** @deprecated alias */
export type ExcluirRegistroPij = ExcluirRegistroVenta;

export type ConflictoVenta =
  | { producto: 'pij'; campo: 'adhesion'; display: string; ocupante: OcupanteVentaIndice }
  | { producto: 'terreno'; campo: 'recibo'; display: string; ocupante: OcupanteVentaIndice };

/** @deprecated alias */
export type ConflictoPij = Extract<ConflictoVenta, { producto: 'pij' }>;

export function buildPijRecibo(serie: string, adh: string, anexo: string): string {
  const s = serie.trim().toUpperCase();
  const a = adh.trim().replace(/\D/g, '');
  const x = anexo.trim().replace(/\D/g, '');
  const parts: string[] = [];
  if (a) parts.push(`${s}${a}/300`);
  // Anexo: número sucesivo (sin /300). Ej.: A230/300 ANEXO 400
  if (x) parts.push(`ANEXO ${x}`);
  return parts.join(' ');
}

export function parsePijRecibo(recibo: string): PijReciboParseado {
  const clean = recibo.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = clean.match(/^([AB])(\d+)(?:\/300)?(?:\s+ANEXO\s+(\d+)(?:\/300)?)?$/);
  if (match) {
    return {
      serie: match[1] as SeriePij,
      adhesion: match[2],
      anexo: match[3] || '',
    };
  }
  const matchFuzzy = clean.match(/^([AB])(\d+)/);
  if (matchFuzzy) {
    const anexoMatch = clean.match(/ANEXO\s*(\d+)/);
    return {
      serie: matchFuzzy[1] as SeriePij,
      adhesion: matchFuzzy[2],
      anexo: anexoMatch ? anexoMatch[1] : '',
    };
  }
  return { serie: 'A', adhesion: '', anexo: '' };
}

export function claveAdhesionPij(serie: string, adhesion: string): string | null {
  const s = serie.trim().toUpperCase();
  const a = adhesion.trim().replace(/\D/g, '');
  if (!s || !a) return null;
  return `${s}${a}`;
}

export function claveAnexoPij(anexo: string): string | null {
  const x = anexo.trim().replace(/\D/g, '');
  if (!x) return null;
  return `ANEXO${x}`;
}

export function displayAdhesionPij(serie: string, adhesion: string): string {
  const clave = claveAdhesionPij(serie, adhesion);
  return clave ? `${clave}/300` : '';
}

export function displayAnexoPij(anexo: string): string {
  const x = anexo.trim().replace(/\D/g, '');
  return x ? `ANEXO ${x}` : '';
}

function esMismoRegistroExcluido(
  ocupante: OcupanteVentaIndice,
  excluir?: ExcluirRegistroVenta,
): boolean {
  if (!excluir?.leadId || String(ocupante.leadId) !== String(excluir.leadId)) return false;
  if (excluir.esPrincipal && !ocupante.esAdicional) return true;
  if (
    excluir.compraId &&
    ocupante.esAdicional &&
    ocupante.compraId &&
    String(ocupante.compraId) === String(excluir.compraId)
  ) {
    return true;
  }
  return false;
}

function conflictoPijDesdeOcupante(
  display: string,
  ocupante: OcupanteVentaIndice,
): ConflictoVenta {
  return { producto: 'pij', campo: 'adhesion', display, ocupante };
}

/** Normaliza número de recibo terreno para comparación global. */
export function claveReciboTerreno(numeroRecibo: string): string | null {
  const raw = numeroRecibo.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits || raw.toUpperCase().replace(/\s+/g, '');
}

export function displayReciboTerreno(numeroRecibo: string): string {
  return numeroRecibo.trim();
}

export function mensajeConflictoVenta(conflicto: ConflictoVenta): string {
  const tipoVenta = conflicto.ocupante.esAdicional ? 'venta adicional de' : 'venta de';
  if (conflicto.producto === 'pij') {
    return `La adhesión ${conflicto.display} ya está registrada en ${tipoVenta} ${conflicto.ocupante.cliente} (${conflicto.ocupante.vendedor})`;
  }
  return `El recibo ${conflicto.display} ya está registrado en ${tipoVenta} ${conflicto.ocupante.cliente} (${conflicto.ocupante.vendedor})`;
}

export function mensajeConflictoPij(conflicto: ConflictoPij): string {
  return mensajeConflictoVenta(conflicto);
}

export function buscarConflictoTerreno(
  indice: IndiceVentasOcupados,
  numeroRecibo: string,
  excluir?: ExcluirRegistroVenta,
): ConflictoVenta | null {
  const clave = claveReciboTerreno(numeroRecibo);
  if (!clave) return null;
  const ocupante = indice.recibosTerreno[clave];
  if (ocupante && !esMismoRegistroExcluido(ocupante, excluir)) {
    return {
      producto: 'terreno',
      campo: 'recibo',
      display: displayReciboTerreno(numeroRecibo),
      ocupante,
    };
  }
  return null;
}

export function buscarConflictoPij(
  indice: IndiceVentasOcupados,
  serie: string,
  adhesion: string,
  _anexo?: string,
  excluir?: ExcluirRegistroVenta,
): ConflictoVenta | null {
  const claveAdh = claveAdhesionPij(serie, adhesion);
  if (!claveAdh) return null;
  const ocupante = indice.adhesiones[claveAdh];
  if (ocupante && !esMismoRegistroExcluido(ocupante, excluir)) {
    return conflictoPijDesdeOcupante(displayAdhesionPij(serie, adhesion), ocupante);
  }
  return null;
}

function indexarReciboPijEnIndice(
  recibo: string,
  meta: Omit<OcupanteVentaIndice, 'reciboCompleto'>,
): Pick<IndiceVentasOcupados, 'adhesiones'> {
  const parsed = parsePijRecibo(recibo);
  const adhesiones: Record<string, OcupanteVentaIndice> = {};
  const base = { ...meta, reciboCompleto: recibo.trim(), idProducto: 'prod-pij' as const };
  const claveAdh = claveAdhesionPij(parsed.serie, parsed.adhesion);
  if (claveAdh) adhesiones[claveAdh] = base;
  return { adhesiones };
}

function indexarReciboTerrenoEnIndice(
  recibo: string,
  meta: Omit<OcupanteVentaIndice, 'reciboCompleto'>,
): Pick<IndiceVentasOcupados, 'recibosTerreno'> {
  const recibosTerreno: Record<string, OcupanteVentaIndice> = {};
  const clave = claveReciboTerreno(recibo);
  if (clave) {
    recibosTerreno[clave] = {
      ...meta,
      reciboCompleto: recibo.trim(),
      idProducto: 'prod-terreno',
    };
  }
  return { recibosTerreno };
}

/** Indexa ventas PIJ y terreno de la bandeja local. */
export function construirIndiceVentasDesdeLeads(
  leads: Array<{
    id: string;
    nombre: string;
    promotorNombre?: string;
    seguimiento?: {
      numeroRecibo?: string | null;
      idProducto?: string | null;
      comprasAdicionales?: Array<{
        id: string;
        idProducto: string;
        numeroRecibo: string;
      }> | null;
    } | null;
  }>,
): IndiceVentasOcupados {
  const adhesiones: Record<string, OcupanteVentaIndice> = {};
  const anexos: Record<string, OcupanteVentaIndice> = {};
  const recibosTerreno: Record<string, OcupanteVentaIndice> = {};

  const merge = (partial: Partial<IndiceVentasOcupados>) => {
    Object.assign(adhesiones, partial.adhesiones ?? {});
    Object.assign(recibosTerreno, partial.recibosTerreno ?? {});
  };

  for (const l of leads) {
    const seg = l.seguimiento;
    const metaBase = {
      cliente: l.nombre,
      vendedor: l.promotorNombre || 'Sin Vendedor',
      leadId: String(l.id),
    };

    if (seg?.idProducto === 'prod-pij' && seg.numeroRecibo?.trim()) {
      merge(indexarReciboPijEnIndice(seg.numeroRecibo, { ...metaBase, esAdicional: false }));
    }
    if (seg?.idProducto === 'prod-terreno' && seg.numeroRecibo?.trim()) {
      merge(
        indexarReciboTerrenoEnIndice(seg.numeroRecibo, { ...metaBase, esAdicional: false }),
      );
    }

    for (const compra of seg?.comprasAdicionales ?? []) {
      if (!compra.numeroRecibo?.trim()) continue;
      const metaAdic = { ...metaBase, esAdicional: true, compraId: compra.id };
      if (compra.idProducto === 'prod-pij') {
        merge(indexarReciboPijEnIndice(compra.numeroRecibo, metaAdic));
      } else if (compra.idProducto === 'prod-terreno') {
        merge(indexarReciboTerrenoEnIndice(compra.numeroRecibo, metaAdic));
      }
    }
  }

  return { adhesiones, anexos, recibosTerreno };
}

/** @deprecated alias */
export const construirIndicePijDesdeLeads = construirIndiceVentasDesdeLeads;

export function fusionarIndicesVentas(
  ...indices: IndiceVentasOcupados[]
): IndiceVentasOcupados {
  const adhesiones: Record<string, OcupanteVentaIndice> = {};
  const anexos: Record<string, OcupanteVentaIndice> = {};
  const recibosTerreno: Record<string, OcupanteVentaIndice> = {};
  for (const ind of indices) {
    Object.assign(adhesiones, ind.adhesiones);
    Object.assign(anexos, ind.anexos);
    Object.assign(recibosTerreno, ind.recibosTerreno);
  }
  return { adhesiones, anexos, recibosTerreno };
}

/** @deprecated alias */
export const fusionarIndicesPij = fusionarIndicesVentas;

/** Compras adicionales en el formulario (aún no guardadas). */
export function indiceVentasDesdeComprasFormulario(
  compras: Array<{ id: string; idProducto: string; numeroRecibo: string }>,
  cliente: string,
  leadId: string,
): IndiceVentasOcupados {
  const adhesiones: Record<string, OcupanteVentaIndice> = {};
  const anexos: Record<string, OcupanteVentaIndice> = {};
  const recibosTerreno: Record<string, OcupanteVentaIndice> = {};
  const merge = (partial: Partial<IndiceVentasOcupados>) => {
    Object.assign(adhesiones, partial.adhesiones ?? {});
    Object.assign(recibosTerreno, partial.recibosTerreno ?? {});
  };

  for (const compra of compras) {
    if (!compra.numeroRecibo?.trim()) continue;
    const meta = {
      cliente,
      vendedor: '—',
      leadId,
      esAdicional: true,
      compraId: compra.id,
    };
    if (compra.idProducto === 'prod-pij') {
      merge(indexarReciboPijEnIndice(compra.numeroRecibo, meta));
    } else if (compra.idProducto === 'prod-terreno') {
      merge(indexarReciboTerrenoEnIndice(compra.numeroRecibo, meta));
    }
  }
  return { adhesiones, anexos, recibosTerreno };
}

/** @deprecated alias */
export const indicePijDesdeComprasFormulario = indiceVentasDesdeComprasFormulario;
