/** Utilidades ventas PIJ + terreno (servidor, espejo de src/domain/pij-recibo.ts). */

const ID_PIJ = 'prod-pij';
const ID_TERRENO = 'prod-terreno';

export function parsePijRecibo(recibo) {
  const clean = String(recibo ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const match = clean.match(/^([A-Z])(\d+)(?:\/300)?(?:\s+ANEXO\s+(\d+)(?:\/300)?)?$/);
  if (match) {
    return { serie: match[1], adhesion: match[2], anexo: match[3] || '' };
  }
  const matchFuzzy = clean.match(/^([A-Z])(\d+)/);
  if (matchFuzzy) {
    const anexoMatch = clean.match(/ANEXO\s*(\d+)/);
    return {
      serie: matchFuzzy[1],
      adhesion: matchFuzzy[2],
      anexo: anexoMatch ? anexoMatch[1] : '',
    };
  }
  return { serie: 'A', adhesion: '', anexo: '' };
}

export function claveAdhesionPij(serie, adhesion) {
  const s = String(serie ?? '').trim().toUpperCase();
  const a = String(adhesion ?? '').trim().replace(/\D/g, '');
  if (!s || !a) return null;
  return `${s}${a}`;
}

export function claveAnexoPij(anexo) {
  const x = String(anexo ?? '').trim().replace(/\D/g, '');
  if (!x) return null;
  return `ANEXO${x}`;
}

export function claveReciboTerreno(numeroRecibo) {
  const raw = String(numeroRecibo ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits || raw.toUpperCase().replace(/\s+/g, '');
}

function indexarReciboPij(recibo, meta) {
  const parsed = parsePijRecibo(recibo);
  const adhesiones = {};
  const base = { ...meta, reciboCompleto: String(recibo ?? '').trim(), idProducto: ID_PIJ };

  const claveAdh = claveAdhesionPij(parsed.serie, parsed.adhesion);
  if (claveAdh) adhesiones[claveAdh] = base;

  return { adhesiones };
}

function indexarReciboTerreno(recibo, meta) {
  const recibosTerreno = {};
  const clave = claveReciboTerreno(recibo);
  if (clave) {
    recibosTerreno[clave] = {
      ...meta,
      reciboCompleto: String(recibo ?? '').trim(),
      idProducto: ID_TERRENO,
    };
  }
  return { recibosTerreno };
}

export function construirIndiceVentasGlobal(leads) {
  const adhesiones = {};
  const anexos = {};
  const recibosTerreno = {};

  for (const l of leads) {
    const seg = l.seguimiento;
    const cliente = l.nombre;
    const vendedor = l.promotorNombre || 'Sin Vendedor';
    const leadId = String(l.id);
    const metaBase = { cliente, vendedor, leadId };

    if (seg?.idProducto === ID_PIJ && seg.numeroRecibo?.trim()) {
      const idx = indexarReciboPij(seg.numeroRecibo, { ...metaBase, esAdicional: false });
      Object.assign(adhesiones, idx.adhesiones);
    }

    if (seg?.idProducto === ID_TERRENO && seg.numeroRecibo?.trim()) {
      const idx = indexarReciboTerreno(seg.numeroRecibo, { ...metaBase, esAdicional: false });
      Object.assign(recibosTerreno, idx.recibosTerreno);
    }

    let adicionales = [];
    if (seg?.comprasAdicionales) {
      try {
        adicionales =
          typeof seg.comprasAdicionales === 'string'
            ? JSON.parse(seg.comprasAdicionales)
            : seg.comprasAdicionales;
      } catch {
        adicionales = [];
      }
    }

    if (Array.isArray(adicionales)) {
      for (const comp of adicionales) {
        if (!comp.numeroRecibo?.trim()) continue;
        const metaAdic = {
          ...metaBase,
          esAdicional: true,
          compraId: comp.id != null ? String(comp.id) : undefined,
        };
        if (comp.idProducto === ID_PIJ) {
          const idx = indexarReciboPij(comp.numeroRecibo, metaAdic);
          Object.assign(adhesiones, idx.adhesiones);
        } else if (comp.idProducto === ID_TERRENO) {
          const idx = indexarReciboTerreno(comp.numeroRecibo, metaAdic);
          Object.assign(recibosTerreno, idx.recibosTerreno);
        }
      }
    }
  }

  return { adhesiones, anexos, recibosTerreno };
}

/** @deprecated alias */
export const construirIndicePijGlobal = construirIndiceVentasGlobal;
