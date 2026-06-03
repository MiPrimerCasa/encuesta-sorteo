import './load-env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, getAppBasePath } from './create-app.js';
import { getDb } from './db/sqlite.js';
import { isSqlServerConfigured } from './db/mssql.js';

const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist');

const app = createApp(distPath);

app.listen(PORT, () => {
  getDb();
  const base = getAppBasePath() || '/';
  console.log(`API Seguimiento Leads en http://localhost:${PORT}`);
  console.log(`  Base pública: ${base} (APP_BASE_PATH)`);
  if (isSqlServerConfigured()) {
    console.log('Modo: PRODUCCIÓN (sin datos de muestra)');
    console.log(
      `  Login → ${process.env.SP_LOGIN || 'operadorAccesoCategoria'} @ ${process.env.DB_NAME}`,
    );
    console.log(
      `  Leads → ${process.env.SP_ENCUESTAS || 'encuestasMuestraOperador'} @idVendedor @ ${process.env.ENCUESTAS_DB_NAME || process.env.DB_NAME}`,
    );
    console.log(
      `  Seguimiento → ${process.env.SP_SEGUIMIENTO || '(SQLite local)'} @ ${process.env.ENCUESTAS_DB_NAME || process.env.DB_NAME}`,
    );
    console.log(`  Health rápido → ${base}api/health/live`);
  } else {
    console.error('FALTA .env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME — no hay modo demo.');
  }
});
