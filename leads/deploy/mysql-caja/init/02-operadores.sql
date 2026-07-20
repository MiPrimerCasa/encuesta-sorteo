-- Migración aditiva (MySQL ya desplegada): operadores + columnas en cierre_pendiente.
-- Ejecutar UNA vez en el VPS:
--   docker exec -i mysql-caja mysql -ucrm_caja -p caja_pij < deploy/mysql-caja/init/02-operadores.sql
-- (o con root si el usuario no tiene ALTER)

SET NAMES utf8mb4;

-- Catálogo de promotores / supervisores (espejo del CRM para la caja).
CREATE TABLE IF NOT EXISTS operador (
  codigo            VARCHAR(64)  NOT NULL PRIMARY KEY,  -- ej. SORTEO01S21P01
  nombre            VARCHAR(200) NULL,
  rol               VARCHAR(16)  NOT NULL,               -- promotor | supervisor
  equipo            VARCHAR(8)   NULL,                   -- S21
  id_sql            INT          NULL,                   -- idOperador en STRSYSTEM
  activo            TINYINT      NOT NULL DEFAULT 1,
  actualizado_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_operador_rol (rol),
  KEY ix_operador_equipo (equipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columnas en cierre_pendiente (idempotente vía information_schema).
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cierre_pendiente' AND COLUMN_NAME = 'promotor_id'
    ),
    'SELECT 1',
    'ALTER TABLE cierre_pendiente ADD COLUMN promotor_id INT NULL AFTER operador_nombre'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cierre_pendiente' AND COLUMN_NAME = 'promotor_nombre'
    ),
    'SELECT 1',
    'ALTER TABLE cierre_pendiente ADD COLUMN promotor_nombre VARCHAR(200) NULL AFTER promotor_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cierre_pendiente' AND COLUMN_NAME = 'promotor_codigo'
    ),
    'SELECT 1',
    'ALTER TABLE cierre_pendiente ADD COLUMN promotor_codigo VARCHAR(64) NULL AFTER promotor_nombre'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cierre_pendiente' AND COLUMN_NAME = 'supervisor_id'
    ),
    'SELECT 1',
    'ALTER TABLE cierre_pendiente ADD COLUMN supervisor_id INT NULL AFTER promotor_codigo'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cierre_pendiente' AND COLUMN_NAME = 'supervisor_nombre'
    ),
    'SELECT 1',
    'ALTER TABLE cierre_pendiente ADD COLUMN supervisor_nombre VARCHAR(200) NULL AFTER supervisor_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cierre_pendiente' AND COLUMN_NAME = 'supervisor_codigo'
    ),
    'SELECT 1',
    'ALTER TABLE cierre_pendiente ADD COLUMN supervisor_codigo VARCHAR(64) NULL AFTER supervisor_nombre'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
