import '../server/load-env.js';
import sql from 'mssql';
import { getSqlPoolEncuestas, closeSqlPool } from '../server/db/mssql.js';

async function main() {
  try {
    const pool = await getSqlPoolEncuestas();
    console.log('Running SP for idVendedor=23...');
    const result = await pool.request()
      .input('idVendedor', sql.Int, 23)
      .execute('adhesionesPorVendedorGestion');
    
    console.log('Result set keys:', result.recordset && result.recordset[0] ? Object.keys(result.recordset[0]) : 'No recordset or empty');
    console.log('Result count:', result.recordset ? result.recordset.length : 0);
    console.log('First 5 rows:', result.recordset ? result.recordset.slice(0, 5) : []);
  } catch (err) {
    console.error('Error running SP:', err);
  } finally {
    await closeSqlPool();
  }
}

main();
