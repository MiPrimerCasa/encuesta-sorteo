#!/usr/bin/env node
/**
 * Inspecciona [dbo].[rptLinkQRenRedesSociales] en STRSYSTEM.
 *
 * Uso:
 *   node scripts/inspect-links-redes-sp.js
 *   node scripts/inspect-links-redes-sp.js SORTEO01S21P01
 */
import '../server/load-env.js';
import { closeSqlPool, isSqlServerConfigured } from '../server/db/mssql.js';
import {
  buildCatalogFromSpRows,
  fetchLinksRedesRowsFromSql,
  getLinksRedesProcedureName,
} from '../server/db/links-redes-sp.js';

const codigoFiltro = process.argv[2]?.trim() || null;

if (!isSqlServerConfigured()) {
  console.error('Falta .env con DB_HOST, DB_USER, DB_NAME (o src/.env en desarrollo).');
  process.exit(1);
}

try {
  console.log(`Base: ${process.env.DB_NAME}`);
  console.log(`SP: dbo.${getLinksRedesProcedureName()}`);
  if (process.env.SP_LINKS_REDES_PARAM_CODIGO && codigoFiltro) {
    console.log(`Parámetro: @${process.env.SP_LINKS_REDES_PARAM_CODIGO} = ${codigoFiltro}`);
  }

  const rows = await fetchLinksRedesRowsFromSql(
    codigoFiltro ? { codigo: codigoFiltro } : {},
  );
  console.log(`Filas: ${rows.length}`);

  if (rows[0]) {
    console.log('Columnas:', Object.keys(rows[0]).join(', '));
    console.log('\nPrimera fila (cruda):');
    console.log(JSON.stringify(rows[0], null, 2));
  }

  const catalog = buildCatalogFromSpRows(rows);
  const codigos = Object.keys(catalog.byCodigo);
  console.log(`\nCatálogo interpretado: ${codigos.length} códigos`);
  if (codigos.length) {
    const sample = catalog.byCodigo[codigos[0]];
    console.log('Ejemplo:', JSON.stringify(sample, null, 2));
  }

  if (codigoFiltro) {
    const hit = catalog.byCodigo[codigoFiltro.toUpperCase().replace(/[\s_\-]+/g, '')];
    console.log(
      hit
        ? `\nMatch para ${codigoFiltro}: OK`
        : `\nSin match para ${codigoFiltro} en el catálogo interpretado.`,
    );
  }
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await closeSqlPool();
}
