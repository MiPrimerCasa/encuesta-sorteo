/** Mensajes claros para errores SQL Server en la API. */
export function formatSqlError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Error desconocido');
  const sqlUser = process.env.DB_USER || 'API';
  const dbConexion = process.env.ENCUESTAS_DB_NAME || process.env.DB_NAME || 'STRSYSTEM';

  const necesitaMensajeria =
    /mensajeria/i.test(raw) &&
    /not able to access|no puede acceder|cannot open database|security context/i.test(raw);

  if (necesitaMensajeria) {
    return {
      message:
        `El procedimiento de leads necesita la base «mensajeria», pero el login SQL «${sqlUser}» no tiene acceso ahí. ` +
        `La app se conecta a «${dbConexion}» (login OK), pero SQL Server bloquea el acceso a mensajeria. ` +
        'No se arregla cambiando ENCUESTAS_DB_NAME: el administrador debe crear el usuario en mensajeria y dar permisos (ver README, sección mensajeria).',
      code: 'PERMISO_MENSAJERIA',
      detail: raw,
      adminSql: [
        'USE mensajeria;',
        `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${sqlUser}')`,
        `  CREATE USER [${sqlUser}] FOR LOGIN [${sqlUser}];`,
        `GRANT CONNECT TO [${sqlUser}];`,
        'GRANT EXECUTE ON dbo.encuestasMuestraOperador TO [' + sqlUser + '];',
        '-- Si el SP solo lee tablas, puede hacer falta db_datareader o SELECT sobre tablas concretas.',
      ].join('\n'),
    };
  }

  const executeDenied =
    /EXECUTE permission was denied/i.test(raw) &&
    /encuestasMuestraOperador/i.test(raw);

  if (executeDenied) {
    return {
      message:
        `El usuario SQL «${sqlUser}» puede iniciar sesión en la app, pero no tiene permiso para ejecutar ` +
        `«encuestasMuestraOperador» en la base «${dbConexion}». Pedí al administrador SQL que ejecute el script de permisos (README o sql/grants-mpcsp-leads.sql).`,
      code: 'PERMISO_EXECUTE_ENCUESTAS',
      detail: raw,
      adminSql: [
        `USE [${dbConexion}];`,
        `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${sqlUser}')`,
        `  CREATE USER [${sqlUser}] FOR LOGIN [${sqlUser}];`,
        `GRANT CONNECT TO [${sqlUser}];`,
        'GRANT EXECUTE ON dbo.encuestasMuestraOperador TO [' + sqlUser + '];',
        'GRANT EXECUTE ON dbo.operadorAccesoCategoria TO [' + sqlUser + '];',
        '-- Si el SP lee tablas directamente:',
        `-- ALTER ROLE db_datareader ADD MEMBER [${sqlUser}];`,
        '',
        '-- El SP suele leer también la base mensajeria (ver README):',
        'USE mensajeria;',
        `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${sqlUser}')`,
        `  CREATE USER [${sqlUser}] FOR LOGIN [${sqlUser}];`,
        `GRANT CONNECT TO [${sqlUser}];`,
        `-- ALTER ROLE db_datareader ADD MEMBER [${sqlUser}];`,
      ].join('\n'),
    };
  }

  if (
    /not able to access|no puede acceder|permission|permiso|cannot open database/i.test(raw)
  ) {
    return {
      message:
        `El usuario SQL «${sqlUser}» no puede usar la base configurada en ENCUESTAS_DB_NAME («${dbConexion}»). ` +
        'Revisá el detalle técnico o pedí permisos al administrador de SQL Server.',
      code: 'PERMISO_BASE_ENCUESTAS',
      detail: raw,
    };
  }

  return {
    message: 'Error al consultar la base de producción.',
    code: 'SQL_ERROR',
    detail: raw,
  };
}
