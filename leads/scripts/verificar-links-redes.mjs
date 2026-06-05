#!/usr/bin/env node
/**
 * Verificación programada de links acortados (uno o varios por ejecución).
 * Cron sugerido (diario, 1 link): 0 4 * * * cd /opt/.../leads && node scripts/verificar-links-redes.mjs
 * Semanal batch: LINKS_VERIFY_MAX_PER_RUN=20 node scripts/verificar-links-redes.mjs
 */
import '../server/load-env.js';
import {
  ejecutarVerificacionProgramada,
  ejecutarVerificacionSemanalCompleta,
} from '../server/db/links-acortados-store.js';
import { pausaEntreAcortadosMs } from '../server/lib/url-shortener.js';

const modo = String(process.env.LINKS_VERIFY_MODE || '').trim().toLowerCase();
const limite = Number(process.env.LINKS_VERIFY_MAX_PER_RUN || 1);
const dias = Number(process.env.LINKS_VERIFY_INTERVAL_DAYS || 7);

const res =
  modo === 'full' || modo === 'all' || modo === 'semanal'
    ? await ejecutarVerificacionSemanalCompleta()
    : await ejecutarVerificacionProgramada({
        diasIntervalo: dias,
        limite,
      });

for (const r of res.resultados) {
  console.log(
    `[${r.codigo}/${r.red}] ${r.accion} ok=${r.ok}${r.urlCorto ? ` → ${r.urlCorto}` : ''}${r.error ? ` (${r.error})` : ''}`,
  );
  if (res.resultados.indexOf(r) < res.resultados.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, pausaEntreAcortadosMs()));
  }
}

console.log(`\nRevisados: ${res.revisados}.`);
