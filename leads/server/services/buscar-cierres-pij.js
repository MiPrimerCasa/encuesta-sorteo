import { parsePijRecibo } from '../domain/pij-recibo.js';

const ID_PIJ = 'prod-pij';

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function soloDigitos(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/**
 * Tokens de búsqueda: texto libre + números (adhesión/anexo).
 * Ej: "A230", "230", "ANEXO 400", "garcia", "ramos"
 */
function tokensBusqueda(q) {
  const raw = String(q ?? '').trim();
  if (!raw) return [];
  const n = norm(raw);
  const toks = new Set();
  toks.add(n);
  for (const part of n.split(/[\s,/|.-]+/).filter(Boolean)) {
    toks.add(part);
  }
  const digits = soloDigitos(raw);
  if (digits) toks.add(digits);
  const mSerie = n.match(/^([AB])(\d+)$/);
  if (mSerie) {
    toks.add(mSerie[1] + mSerie[2]);
    toks.add(mSerie[2]);
  }
  const mAnexo = n.match(/ANEXO\s*(\d+)/);
  if (mAnexo) toks.add(mAnexo[1]);
  return [...toks];
}

function matchTexto(haystack, tokens) {
  const h = norm(haystack);
  if (!h || !tokens.length) return false;
  return tokens.some((t) => t.length >= 2 && h.includes(t));
}

function matchNumero(valor, tokens) {
  const d = soloDigitos(valor);
  if (!d) return false;
  return tokens.some((t) => {
    const td = soloDigitos(t);
    if (!td) return false;
    // match exacto o si buscan un número contenido (mín 2 dígitos)
    return d === td || (td.length >= 2 && d.includes(td)) || (d.length >= 2 && td.includes(d));
  });
}

function matchSerieAdhesion(serie, adhesion, tokens) {
  const s = String(serie ?? '').trim().toUpperCase();
  const a = soloDigitos(adhesion);
  if (s && a) {
    const clave = `${s}${a}`;
    if (tokens.some((t) => norm(t) === clave || norm(t) === `${s}/${a}` || norm(t) === `${s}${a}/300`)) {
      return true;
    }
  }
  if (a && matchNumero(a, tokens)) return true;
  if (s && tokens.some((t) => norm(t) === s)) return true;
  return false;
}

function esCierrePijPrincipal(seg) {
  if (!seg) return false;
  if (seg.resultadoEntrevista !== 'compro') return false;
  if (seg.idProducto && seg.idProducto !== ID_PIJ) return false;
  // Si no hay idProducto pero hay recibo/adhesión PIJ parseable, también
  const recibo = String(seg.numeroRecibo ?? '').trim();
  const adh = String(seg.nroAdhesion ?? '').trim();
  if (seg.idProducto === ID_PIJ) return Boolean(recibo || adh || seg.nroAnexo);
  if (!seg.idProducto && (recibo || adh)) {
    const p = parsePijRecibo(recibo || `${seg.seriePij || 'A'}${adh}`);
    return Boolean(p.adhesion);
  }
  return false;
}

function extraerCamposPij(seg, compra) {
  if (compra) {
    const recibo = String(compra.numeroRecibo ?? '').trim();
    const parsed = parsePijRecibo(recibo);
    return {
      seriePij: compra.serie || parsed.serie || null,
      nroAdhesion: compra.nroAdhesion || parsed.adhesion || null,
      nroAnexo: compra.nroAnexo || parsed.anexo || null,
      numeroRecibo: recibo || null,
    };
  }
  const recibo = String(seg?.numeroRecibo ?? '').trim();
  const parsed = parsePijRecibo(recibo);
  return {
    seriePij: seg?.seriePij || parsed.serie || null,
    nroAdhesion: seg?.nroAdhesion || parsed.adhesion || null,
    nroAnexo: seg?.nroAnexo || parsed.anexo || null,
    numeroRecibo: recibo || null,
  };
}

function itemCoincide(campos, cliente, vendedor, tokens) {
  if (!tokens.length) return false;
  if (matchTexto(cliente, tokens)) return true;
  if (matchTexto(vendedor, tokens)) return true;
  if (matchSerieAdhesion(campos.seriePij, campos.nroAdhesion, tokens)) return true;
  if (matchNumero(campos.nroAnexo, tokens)) return true;
  if (campos.numeroRecibo && matchTexto(campos.numeroRecibo, tokens)) return true;
  if (campos.numeroRecibo && matchNumero(campos.numeroRecibo, tokens)) return true;
  return false;
}

/** Preferir fecha de cierre; si falta (legado), usar creadoEn / entrevista / alta del lead. */
function resolverFechaCierre(seg, compra, lead) {
  const candidatos = [
    compra?.fechaCierre,
    compra?.creadoEn,
    seg?.fechaCierre,
    seg?.creadoEn,
    seg?.fechaEntrevista,
    lead?.fechaAlta,
    lead?.fechaObtencion,
  ];
  for (const f of candidatos) {
    const s = String(f ?? '').trim();
    if (s) return s;
  }
  return null;
}

/**
 * Lista cierres PIJ (principal + adicionales) que matchean q.
 * @param {Array} leads
 * @param {string} q
 * @param {number} [limit=80]
 */
export function buscarCierresPijEnLeads(leads, q, limit = 80) {
  const tokens = tokensBusqueda(q);
  if (!tokens.length) return [];

  const lim = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const items = [];

  for (const lead of leads) {
    if (items.length >= lim) break;
    const seg = lead.seguimiento;
    const cliente = lead.nombre || '';
    const vendedor = lead.promotorNombre || seg?.operadorNombre || '';

    if (esCierrePijPrincipal(seg)) {
      const campos = extraerCamposPij(seg, null);
      if (itemCoincide(campos, cliente, vendedor, tokens)) {
        items.push({
          leadId: String(lead.id),
          nombreCliente: cliente,
          vendedor,
          telefono: lead.telefono || null,
          seriePij: campos.seriePij,
          nroAdhesion: campos.nroAdhesion,
          nroAnexo: campos.nroAnexo,
          numeroRecibo: campos.numeroRecibo,
          fechaCierre: resolverFechaCierre(seg, null, lead),
          esAdicional: false,
          compraId: null,
          formaPago: seg.formaPago || null,
        });
      }
    }

    const adicionales = Array.isArray(seg?.comprasAdicionales) ? seg.comprasAdicionales : [];
    for (const c of adicionales) {
      if (items.length >= lim) break;
      if (c?.idProducto && c.idProducto !== ID_PIJ) continue;
      const recibo = String(c?.numeroRecibo ?? '').trim();
      const adh = String(c?.nroAdhesion ?? '').trim();
      if (!recibo && !adh) continue;
      // Si tiene idProducto distinto de pij, ya continue; si no tiene, exigir parseo PIJ
      if (c?.idProducto !== ID_PIJ) {
        const p = parsePijRecibo(recibo || `A${adh}`);
        if (!p.adhesion) continue;
      }
      const campos = extraerCamposPij(seg, c);
      if (itemCoincide(campos, cliente, vendedor, tokens)) {
        items.push({
          leadId: String(lead.id),
          nombreCliente: cliente,
          vendedor,
          telefono: lead.telefono || null,
          seriePij: campos.seriePij,
          nroAdhesion: campos.nroAdhesion,
          nroAnexo: campos.nroAnexo,
          numeroRecibo: campos.numeroRecibo,
          fechaCierre: resolverFechaCierre(seg, c, lead),
          esAdicional: true,
          compraId: c.id || null,
          formaPago: c.formaPago || null,
        });
      }
    }
  }

  return items;
}
