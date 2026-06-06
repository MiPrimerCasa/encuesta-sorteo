#!/usr/bin/env node
/**
 * Verificación panel superadmin (RF-35): encuestasMuestra + seguimiento + dashboard.
 *
 * Uso:
 *   node --env-file=src/.env scripts/verify-admin-dashboard.js
 *   npm run verify:admin-dashboard
 *
 * Exit code: 0 = OK o solo advertencias; 1 = fallos bloqueantes.
 */
import '../server/load-env.js';
import sql from 'mssql';
import { fetchAdminDashboard } from '../server/db/admin-dashboard.js';
import { fetchEncuestasMuestraGlobalRaw, mapEncuestaRowToLead } from '../server/db/encuestas.js';
import { superadminLoginIds } from '../server/db/superadmin-auth.js';
import { closeSqlPool, getSqlPoolEncuestas, isSqlServerConfigured } from '../server/db/mssql.js';
import {
  batchLatestSeguimientoSql,
  useSeguimientoSql,
} from '../server/db/seguimiento-sql.js';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const QUIET = args.includes('-q');

/** @type {{ level: 'ok'|'warn'|'fail'; section: string; message: string }[]} */
const log = [];

function record(level, section, message) {
  log.push({ level, section, message });
  if (JSON_OUT || QUIET) return;
  const tag = level === 'ok' ? '  OK ' : level === 'warn' ? ' WARN' : ' FAIL';
  console.log(`${tag} [${section}] ${message}`);
}

function section(title) {
  if (!JSON_OUT && !QUIET) console.log(`\n=== ${title} ===`);
}

function normalizeProc(raw, fallback) {
  return String(raw || fallback)
    .replace(/^\[?dbo\]?\./i, '')
    .replace(/[\[\]]/g, '');
}

function hasColumn(row, ...names) {
  if (!row) return false;
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  return names.some((n) => keys.includes(n.toLowerCase()));
}

function pickField(row, ...names) {
  if (!row) return null;
  for (const n of names) {
    const k = Object.keys(row).find((x) => x.toLowerCase() === n.toLowerCase());
    if (k != null && row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}

async function testExecuteProc(pool, procName) {
  const result = await pool.request().execute(procName);
  return result.recordset ?? result.recordsets?.[0] ?? [];
}

async function testHistorialSp(pool, procName, leadId) {
  const result = await pool
    .request()
    .input('lead_id', sql.Int, leadId)
    .input('id_operador', sql.Int, 0)
    .input('lim', sql.Int, 5)
    .execute(procName);
  return result.recordset ?? [];
}

async function testUltimosSp(pool, procName, idOperador) {
  const result = await pool
    .request()
    .input('id_operador', sql.Int, idOperador)
    .execute(procName);
  return result.recordset ?? [];
}

async function testSelectSeguimiento(pool, table) {
  try {
    const result = await pool.request().query(`
      SELECT TOP 1 *
      FROM dbo.[${table}]
      ORDER BY id DESC
    `);
    return { row: result.recordset?.[0] ?? null, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/permission|denied/i.test(msg)) {
      return { row: null, error: 'permission' };
    }
    try {
      const fallback = await pool.request().query(`
        SELECT TOP 1 id, lead_id
        FROM dbo.[${table}]
        ORDER BY id DESC
      `);
      return { row: fallback.recordset?.[0] ?? null, error: msg };
    } catch (error2) {
      return {
        row: null,
        error: error2 instanceof Error ? error2.message : String(error2),
      };
    }
  }
}

function checkEnv() {
  section('1. Configuración (.env)');

  if (!isSqlServerConfigured()) {
    record('fail', 'env', 'Faltan DB_HOST, DB_USER o DB_NAME.');
    return false;
  }
  record('ok', 'env', `SQL ${process.env.DB_USER}@${process.env.DB_HOST}/${process.env.ENCUESTAS_DB_NAME || process.env.DB_NAME}`);

  const spAdmin = normalizeProc(process.env.SP_ENCUESTAS_ADMIN, 'encuestasMuestra');
  record('ok', 'env', `SP_ENCUESTAS_ADMIN=${spAdmin}`);

  if (useSeguimientoSql()) {
    record('ok', 'env', `SP_SEGUIMIENTO=${process.env.SP_SEGUIMIENTO}`);
    const hist = process.env.SP_SEGUIMIENTO_HISTORIAL || 'SP_HistorialSeguimientoLead (default)';
    const ult = process.env.SP_SEGUIMIENTO_ULTIMOS || 'SP_UltimoSeguimientoOperador (default)';
    record('ok', 'env', `Historial: ${hist}`);
    record('ok', 'env', `Últimos: ${ult}`);
  } else {
    record('warn', 'env', 'SP_SEGUIMIENTO no configurado — métricas de entrevistas/cierres quedarán en 0.');
  }

  const superadmins = superadminLoginIds();
  if (superadmins.length) {
    record('ok', 'env', `SUPERADMIN_LOGIN_IDS: ${superadmins.join(', ')}`);
  } else {
    record('warn', 'env', 'SUPERADMIN_LOGIN_IDS vacío — solo podés probar con /demo/superadmin.');
  }

  return true;
}

async function checkEncuestasMuestra() {
  section('2. SP listado global (encuestasMuestra)');

  const proc = normalizeProc(process.env.SP_ENCUESTAS_ADMIN, 'encuestasMuestra');
  let rows = [];

  try {
    rows = await fetchEncuestasMuestraGlobalRaw();
    if (rows.length) {
      record('ok', 'encuestas', `${proc}: ${rows.length} fila(s).`);
    } else {
      record('warn', 'encuestas', `${proc} ejecutó OK pero devolvió 0 filas.`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record('fail', 'encuestas', `${proc}: ${msg}`);
    if (/permission|denied|EXECUTE/i.test(msg)) {
      record('fail', 'encuestas', 'Pedí al DBA: GRANT EXECUTE ON dbo.encuestasMuestra TO [MPCSP];');
    }
    return { rows: [], proc };
  }

  const first = rows[0];
  if (!first) return { rows, proc };

  const columnChecks = [
    { cols: ['id'], label: 'id encuesta', required: true },
    { cols: ['Promotor', 'promotor'], label: 'Promotor', required: true },
    { cols: ['supervisor', 'Supervisor'], label: 'supervisor', required: true },
    { cols: ['Conoce MPC'], label: 'Conoce MPC (campo3)', required: false },
    {
      cols: ['Sabias que con 55.000 pesos por mes (cuotas fijas ) comenzás pagando tu terreno'],
      label: 'Sabía PIJ (campo4)',
      required: false,
    },
    { cols: ['origen', 'Origen'], label: 'origen (canales)', required: false },
    { cols: ['fechaAlta'], label: 'fechaAlta', required: false },
    { cols: ['idSupervisor', 'IdSupervisor'], label: 'idSupervisor', required: false },
    { cols: ['idVendedor', 'IdVendedor'], label: 'idVendedor', required: false },
  ];

  for (const { cols, label, required } of columnChecks) {
    if (hasColumn(first, ...cols)) {
      record('ok', 'columnas', `${label}: presente.`);
    } else if (required) {
      record('fail', 'columnas', `${label}: falta en el SP.`);
    } else {
      record('warn', 'columnas', `${label}: no viene en ${proc} (métrica parcial o agrupación por nombre).`);
    }
  }

  const supIds = new Set(
    rows
      .map((r) => pickField(r, 'idSupervisor', 'IdSupervisor'))
      .filter((v) => v != null)
      .map(String),
  );
  const supNombres = new Set(
    rows
      .map((r) => String(pickField(r, 'supervisor', 'Supervisor') ?? '').trim())
      .filter(Boolean),
  );
  record(
    'ok',
    'encuestas',
    `Supervisores distintos: ${supIds.size || supNombres.size} (${supIds.size ? 'por id' : 'por nombre'}).`,
  );

  const lead = mapEncuestaRowToLead(first);
  const conoce = [lead.conoceMpc === true, lead.conoceMpc === false, lead.conoceMpc == null];
  record(
    'ok',
    'mapeo',
    `Ejemplo lead id=${lead.id} promotor="${lead.promotorNombre}" conoceMpc=${conoce.filter(Boolean).length ? 'con datos' : 'sin parsear'}.`,
  );

  return { rows, proc, sampleLeadId: Number.parseInt(String(lead.id), 10) };
}

async function checkSeguimiento(sampleLeadId) {
  section('3. Seguimiento SQL (historial + estado actual)');

  if (!useSeguimientoSql()) {
    record('warn', 'seguimiento', 'Omitido — SP_SEGUIMIENTO no activo.');
    return { historialOk: false, batchOk: false, rowCount: 0 };
  }

  const table = String(process.env.SEGUIMIENTO_TABLE || 'registrarSeguimientoLead').replace(
    /[\[\]]/g,
    '',
  );
  const procHist = normalizeProc(
    process.env.SP_SEGUIMIENTO_HISTORIAL || 'SP_HistorialSeguimientoLead',
    'SP_HistorialSeguimientoLead',
  );
  const procUlt = normalizeProc(
    process.env.SP_SEGUIMIENTO_ULTIMOS || 'SP_UltimoSeguimientoOperador',
    'SP_UltimoSeguimientoOperador',
  );

  let pool;
  let historialOk = false;
  let batchOk = false;
  let rowCount = 0;
  let tableRow = null;

  try {
    pool = await getSqlPoolEncuestas();

    try {
      const selectResult = await testSelectSeguimiento(pool, table);
      tableRow = selectResult.row;
      const selectErr = selectResult.error;
      rowCount = tableRow ? 1 : 0;
      if (tableRow) {
        record(
          'ok',
          'seguimiento',
          `SELECT en ${table}: OK (última fila id=${tableRow.id}, lead_id=${tableRow.lead_id}).`,
        );
        if (selectErr) {
          record('warn', 'seguimiento', `SELECT parcial: ${selectErr}`);
        }
        if (tableRow.creado_en == null && tableRow.creadoEn == null) {
          record(
            'warn',
            'seguimiento',
            'Columna creado_en no presente — agregar con sql/SP_RegistrarSeguimientoLead-notas.sql',
          );
        }
      } else if (selectErr === 'permission') {
        record('fail', 'seguimiento', `SELECT en ${table}: permiso denegado.`);
        record('fail', 'seguimiento', 'Pedí al DBA: GRANT SELECT ON dbo.registrarSeguimientoLead TO [MPCSP];');
      } else if (selectErr) {
        record('fail', 'seguimiento', `SELECT en ${table}: ${selectErr}`);
      } else {
        record('warn', 'seguimiento', `SELECT en ${table}: OK pero tabla vacía.`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record('fail', 'seguimiento', `SELECT en ${table}: ${msg}`);
      record('fail', 'seguimiento', 'Pedí al DBA: GRANT SELECT ON dbo.registrarSeguimientoLead TO [MPCSP];');
    }

    if (Number.isFinite(sampleLeadId) && sampleLeadId > 0) {
      try {
        const hist = await testHistorialSp(pool, procHist, sampleLeadId);
        historialOk = true;
        record('ok', 'seguimiento', `${procHist} lead_id=${sampleLeadId}: ${hist.length} fila(s).`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        record('fail', 'seguimiento', `${procHist}: ${msg}`);
        record('fail', 'seguimiento', `GRANT EXECUTE ON dbo.${procHist} TO [MPCSP];`);
      }
    }

    try {
      const ult = await testUltimosSp(pool, procUlt, 132);
      record('ok', 'seguimiento', `${procUlt} @id_operador=132: ${ult.length} fila(s).`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record('warn', 'seguimiento', `${procUlt}: ${msg}`);
      record('warn', 'seguimiento', `Opcional: GRANT EXECUTE ON dbo.${procUlt} TO [MPCSP];`);
    }
  } catch (error) {
    record('fail', 'seguimiento', error instanceof Error ? error.message : String(error));
  }

  if (Number.isFinite(sampleLeadId)) {
    try {
      const batch = await batchLatestSeguimientoSql([String(sampleLeadId)], null);
      batchOk = Object.keys(batch).length > 0;
      if (batchOk) {
        record('ok', 'seguimiento', `batchLatestSeguimientoSql lead ${sampleLeadId}: estado cargado.`);
      } else {
        record('warn', 'seguimiento', `batchLatestSeguimientoSql lead ${sampleLeadId}: sin filas (lead sin seguimiento guardado).`);
      }
    } catch (error) {
      record('fail', 'seguimiento', `batchLatestSeguimientoSql: ${error instanceof Error ? error.message : error}`);
    }
  }

  return { historialOk, batchOk, rowCount, tableRow };
}

async function checkDashboard(encuestasRows) {
  section('4. Dashboard API (fetchAdminDashboard)');

  let dash;
  try {
    dash = await fetchAdminDashboard();
  } catch (error) {
    record('fail', 'dashboard', error instanceof Error ? error.message : String(error));
    return null;
  }

  if (dash.aviso) {
    record('warn', 'dashboard', `aviso: ${dash.aviso}`);
  }

  record('ok', 'dashboard', `source=${dash.source ?? '?'} totalLeads=${dash.totalLeads ?? 0} supervisores=${dash.totalSupervisores ?? dash.supervisores?.length ?? 0}`);

  const blocks = [
    {
      name: 'Conocimiento encuesta',
      ok: (d) => (d.conocimientoLeads?.total ?? 0) > 0,
      detail: (d) =>
        `total=${d.conocimientoLeads?.total} MPC sí=${d.conocimientoLeads?.conoceMpc?.si ?? 0}`,
      needs: 'encuestasMuestra',
    },
    {
      name: 'Gráfico — leads (altas)',
      ok: (d) => (d.eventos ?? []).some((e) => e.tipo === 'lead'),
      detail: (d) => `eventos lead=${(d.eventos ?? []).filter((e) => e.tipo === 'lead').length}`,
      needs: 'encuestasMuestra',
    },
    {
      name: 'Canales / origen',
      ok: (d) => (d.productividad?.canales?.length ?? 0) > 0,
      detail: (d) => `canales=${d.productividad?.canales?.length ?? 0}`,
      needs: 'encuestasMuestra (origen)',
    },
    {
      name: 'Tabla supervisores',
      ok: (d) => (d.supervisores?.length ?? 0) > 0,
      detail: (d) => `${d.supervisores?.length ?? 0} equipos`,
      needs: 'encuestasMuestra',
    },
    {
      name: 'KPIs Hoy — entrevistas',
      ok: (d) => (d.resumenHoy?.entrevistas ?? 0) > 0,
      detail: (d) => `entrevistas=${d.resumenHoy?.entrevistas ?? 0}`,
      needs: 'registrarSeguimientoLead',
      soft: true,
    },
    {
      name: 'KPIs Hoy — cierres',
      ok: (d) => (d.resumenHoy?.cierres ?? 0) > 0,
      detail: (d) => `cierres=${d.resumenHoy?.cierres ?? 0}`,
      needs: 'registrarSeguimientoLead',
      soft: true,
    },
    {
      name: 'Gráfico — entrevistas/cierres',
      ok: (d) =>
        (d.eventos ?? []).some((e) => ['entrevista', 'cierre', 'terreno', 'pij'].includes(e.tipo)),
      detail: (d) => {
        const ev = d.eventos ?? [];
        return `ent=${ev.filter((e) => e.tipo === 'entrevista').length} cierres=${ev.filter((e) => e.tipo === 'cierre').length}`;
      },
      needs: 'registrarSeguimientoLead',
      soft: true,
    },
    {
      name: 'Embudo — con entrevista',
      ok: (d) => (d.productividad?.embudoGlobal?.conEntrevista ?? 0) > 0,
      detail: (d) => `conEntrevista=${d.productividad?.embudoGlobal?.conEntrevista ?? 0}`,
      needs: 'registrarSeguimientoLead',
      soft: true,
    },
    {
      name: 'Rankings semana — entrevistas',
      ok: (d) => (d.rankings?.entrevistasSemana?.length ?? 0) > 0,
      detail: (d) => `top=${d.rankings?.entrevistasSemana?.length ?? 0}`,
      needs: 'registrarSeguimientoLead',
      soft: true,
    },
  ];

  section('5. Bloques de pantalla (doc RF-35)');

  for (const block of blocks) {
    const passes = block.ok(dash);
    const detail = block.detail(dash);
    if (passes) {
      record('ok', 'pantalla', `${block.name}: ${detail}`);
    } else if (block.soft && encuestasRows > 0) {
      record('warn', 'pantalla', `${block.name}: ${detail} — requiere ${block.needs}.`);
    } else if (!block.soft) {
      record('fail', 'pantalla', `${block.name}: ${detail} — requiere ${block.needs}.`);
    } else {
      record('warn', 'pantalla', `${block.name}: ${detail}`);
    }
  }

  return dash;
}

function printSummary() {
  const fails = log.filter((e) => e.level === 'fail');
  const warns = log.filter((e) => e.level === 'warn');
  const oks = log.filter((e) => e.level === 'ok');

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          ok: fails.length === 0,
          counts: { ok: oks.length, warn: warns.length, fail: fails.length },
          entries: log,
        },
        null,
        2,
      ),
    );
    return fails.length === 0 ? 0 : 1;
  }

  section('Resumen');
  console.log(`  OK: ${oks.length}  |  WARN: ${warns.length}  |  FAIL: ${fails.length}`);

  if (fails.length) {
    console.log('\nFallos bloqueantes:');
    fails.forEach((e) => console.log(`  • [${e.section}] ${e.message}`));
  }
  if (warns.length) {
    console.log('\nAdvertencias (panel parcial):');
    warns.forEach((e) => console.log(`  • [${e.section}] ${e.message}`));
  }

  if (!fails.length && !warns.length) {
    console.log('\nPanel superadmin listo con datos reales completos.');
  } else if (!fails.length) {
    console.log('\nPanel usable con datos de encuesta; completar permisos SQL de seguimiento para KPIs de actividad.');
    console.log('Script DBA: sql/grants-mpcsp-leads.sql');
  } else {
    console.log('\nCorregí los FAIL antes de usar el panel en producción.');
  }

  return fails.length === 0 ? 0 : 1;
}

async function main() {
  if (!JSON_OUT) {
    console.log('=== verify-admin-dashboard (RF-35) ===');
    console.log(`Fecha: ${new Date().toISOString()}`);
  }

  if (!checkEnv()) {
    process.exitCode = printSummary();
    await closeSqlPool();
    return;
  }

  const enc = await checkEncuestasMuestra();
  await checkSeguimiento(enc.sampleLeadId);
  await checkDashboard(enc.rows.length);

  process.exitCode = printSummary();
  await closeSqlPool();
}

main().catch(async (error) => {
  console.error('Error fatal:', error);
  process.exitCode = 1;
  await closeSqlPool();
});
