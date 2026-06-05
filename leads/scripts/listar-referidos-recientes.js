#!/usr/bin/env node
/**
 * Lista referidos vía SP_ObtenerMetaReferidosLead + nombres del lead origen.
 * Uso: node --env-file=src/.env scripts/listar-referidos-recientes.js [idVendedor]
 */
import '../server/load-env.js';
import sql from 'mssql';
import { fetchReferidosMetaPorIds } from '../server/db/referidos-carga.js';
import {
  fetchEncuestasMuestraRaw,
  mapEncuestaRowToLead,
} from '../server/db/encuestas.js';
import { closeSqlPool, getSqlPoolEncuestas, isSqlServerConfigured } from '../server/db/mssql.js';

const idVendedor = process.argv[2] || '132';

function pickField(row, ...names) {
  if (!row) return null;
  for (const n of names) {
    const k = Object.keys(row).find((x) => x.toLowerCase() === n.toLowerCase());
    if (k != null && row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}

function nombreLead(rows, id) {
  const row = rows.find((r) => String(r.id ?? r.Id) === String(id));
  if (!row) return `(id ${id} — no en listado)`;
  return pickField(row, 'Apellido y nombres', 'Apellido y nombres ') ?? mapEncuestaRowToLead(row).nombre;
}

async function fetchTodosReferidosIds() {
  const pool = await getSqlPoolEncuestas();
  const proc = process.env.SP_OBTENER_META_REFERIDO || 'SP_ObtenerMetaReferidosLead';
  // MPCSP no puede SELECT directo — pedimos meta de todos los ids del listado
  return proc;
}

async function main() {
  if (!isSqlServerConfigured()) {
    console.error('Falta .env SQL');
    process.exit(1);
  }

  const usuario = { id: String(idVendedor), nombre: 'ListarRef', rol: 'supervisor' };
  const rows = await fetchEncuestasMuestraRaw(usuario);
  const ids = rows.map((r) => String(r.id ?? r.Id)).filter(Boolean);

  console.log(`\n=== Referidos (supervisor id ${idVendedor}) ===`);
  console.log(`Leads en bandeja: ${ids.length}\n`);

  const metaMap = await fetchReferidosMetaPorIds(ids);
  if (!metaMap.size) {
    console.log('Ningún lead del listado es referido (SP_ObtenerMetaReferidosLead sin filas).');
    console.log('Tip: el referido puede estar en encuesta pero no en tu bandeja aún.\n');
    process.exit(0);
  }

  const referidos = [...metaMap.entries()].map(([idRef, meta]) => ({
    idReferido: idRef,
    nombreReferido: nombreLead(rows, idRef),
    telefonoReferido: pickField(
      rows.find((r) => String(r.id ?? r.Id) === idRef),
      'telefono',
    ),
    idOrigen: meta.idEncuestaOrigen,
    nombreOrigen: nombreLead(rows, meta.idEncuestaOrigen),
    idRaiz: meta.idEncuestaRaiz,
    nombreRaiz: meta.idEncuestaRaiz ? nombreLead(rows, meta.idEncuestaRaiz) : null,
    nivel: meta.nivel,
    cargadoPor: meta.operadorRol,
  }));

  referidos.sort((a, b) => Number(b.idReferido) - Number(a.idReferido));

  console.log('Referido (id)          | Teléfono      | Cliente que lo refirió (id)     | Raíz cadena');
  console.log('-'.repeat(95));
  for (const r of referidos) {
    const line = [
      `${r.nombreReferido} (#${r.idReferido})`.padEnd(22),
      String(r.telefonoReferido ?? '—').padEnd(14),
      `${r.nombreOrigen} (#${r.idOrigen})`.padEnd(32),
      r.nombreRaiz ? `${r.nombreRaiz} (#${r.idRaiz}) niv.${r.nivel}` : `niv.${r.nivel}`,
      `[${r.cargadoPor}]`,
    ].join(' | ');
    console.log(line);
  }

  console.log(`\nTotal referidos en bandeja: ${referidos.length}\n`);

  // También probar SP directo con ids recientes (últimos 20 ids numéricos altos)
  const idsAltos = ids
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)
    .slice(0, 30)
    .join(',');

  if (idsAltos) {
    const pool = await getSqlPoolEncuestas();
    const proc = process.env.SP_OBTENER_META_REFERIDO || 'SP_ObtenerMetaReferidosLead';
    const req = pool.request();
    req.input('ids_encuesta', sql.NVarChar(sql.MAX), idsAltos);
    const result = await req.execute(proc);
    const spRows = result.recordset ?? [];
    if (spRows.length > referidos.length) {
      console.log(`SP devolvió ${spRows.length} fila(s) en top-30 ids (puede haber más fuera del listado).\n`);
    }
  }
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => closeSqlPool());
