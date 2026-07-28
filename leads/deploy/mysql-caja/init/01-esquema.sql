-- =============================================================================
-- caja_pij — esquema de integración CRM ↔ Caja (VPS)
-- Alineado a SistemaCajaPIJ/deploy/mysql-caja/init/{01_schema,02_caja_cierre_imagen}.sql
-- + catálogo operador (CRM) y sync_cursor (pull incremental).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sucursal_sync (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo            VARCHAR(40)     NOT NULL,
  nombre            VARCHAR(120)    NOT NULL,
  sync_token_hash   CHAR(64)        NOT NULL COMMENT 'SHA-256 hex del CAJA_SYNC_TOKEN',
  activo            TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sucursal_sync_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CRM → caja: cola con payload JSON completo (contrato §5)
CREATE TABLE IF NOT EXISTS crm_venta_pendiente (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                    CHAR(36)        NOT NULL,
  crm_lead_external_id    VARCHAR(80)     NOT NULL,
  crm_venta_external_id   VARCHAR(80)     NULL COMMENT 'origen_registro_id del SP CRM',
  sucursal_codigo         VARCHAR(40)     NOT NULL,
  payload_json            JSON            NOT NULL,
  estado                  ENUM(
                            'PENDIENTE',
                            'DESCARGADA',
                            'CONFIRMADA',
                            'RECHAZADA',
                            'ANULADA'
                          ) NOT NULL DEFAULT 'PENDIENTE',
  created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  pulled_at               DATETIME(3)     NULL,
  closed_at               DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crm_venta_pendiente_uuid (uuid),
  UNIQUE KEY uk_crm_venta_external (crm_venta_external_id),
  KEY idx_crm_venta_pendiente_sucursal (sucursal_codigo, estado, created_at),
  KEY idx_crm_venta_pendiente_lead (crm_lead_external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Caja → CRM: confirmación / rechazo
CREATE TABLE IF NOT EXISTS caja_venta_cierre (
  id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                        CHAR(36)        NOT NULL,
  crm_venta_pendiente_uuid    CHAR(36)        NOT NULL,
  sucursal_codigo             VARCHAR(40)     NOT NULL,
  estado                      ENUM('CONFIRMADA', 'RECHAZADA') NOT NULL,
  contrato_uuid               CHAR(36)        NULL,
  movimiento_uuid             CHAR(36)        NULL,
  recibo_numero               VARCHAR(40)     NULL,
  verificado_por              VARCHAR(120)    NULL,
  motivo_rechazo              VARCHAR(500)    NULL,
  payload_json                JSON            NULL,
  created_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  consumido_por_crm_at        DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_caja_venta_cierre_uuid (uuid),
  KEY idx_caja_cierre_pendiente_crm (consumido_por_crm_at, created_at),
  KEY idx_caja_cierre_venta (crm_venta_pendiente_uuid),
  KEY idx_caja_cierre_sucursal (sucursal_codigo, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_event_log (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  direccion         ENUM('CRM_A_CAJA', 'CAJA_A_CRM') NOT NULL,
  entidad           VARCHAR(60)     NOT NULL,
  entidad_uuid      CHAR(36)        NULL,
  sucursal_codigo   VARCHAR(40)     NULL,
  detalle           VARCHAR(500)    NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sync_event_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cierre publicado + metadatos de imágenes (bytes en data/cierres-pij/)
CREATE TABLE IF NOT EXISTS caja_cierre (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                    CHAR(36)        NOT NULL,
  lead_id                 INT             NOT NULL,
  venta_key               VARCHAR(40)     NOT NULL DEFAULT 'principal',
  sucursal_codigo         VARCHAR(40)     NOT NULL,
  crm_venta_external_id   VARCHAR(80)     NULL,
  payload_json            JSON            NULL,
  estado                  ENUM(
                            'PENDIENTE',
                            'DESCARGADA',
                            'CONFIRMADA',
                            'RECHAZADA',
                            'ANULADA'
                          ) NOT NULL DEFAULT 'PENDIENTE',
  created_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at              DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  pulled_at               DATETIME(3)     NULL,
  closed_at               DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_caja_cierre_uuid (uuid),
  UNIQUE KEY uk_caja_cierre_lead_venta (lead_id, venta_key),
  KEY idx_caja_cierre_sucursal (sucursal_codigo, estado, created_at),
  KEY idx_caja_cierre_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS caja_cierre_imagen (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cierre_id         BIGINT UNSIGNED NOT NULL,
  lead_id           INT             NOT NULL,
  venta_key         VARCHAR(40)     NOT NULL DEFAULT 'principal',
  id_imagen         CHAR(36)        NOT NULL,
  tipo_imagen       VARCHAR(16)     NOT NULL COMMENT 'img1|img2|img5|img6|img7',
  mime_type         VARCHAR(32)     NULL,
  nombre_original   VARCHAR(260)    NULL,
  tamano_bytes      INT             NULL,
  storage_path      VARCHAR(500)    NULL,
  download_url      VARCHAR(500)    NULL,
  sha256            CHAR(64)        NULL,
  contenido         LONGBLOB        NULL,
  operador_id       INT             NULL,
  subido_en         DATETIME        NULL,
  estado_descarga   VARCHAR(16)     NOT NULL DEFAULT 'pendiente',
  descargada_en     DATETIME        NULL,
  creado_en         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_img_slot (cierre_id, venta_key, tipo_imagen),
  UNIQUE KEY uq_img_id_imagen (id_imagen),
  KEY ix_img_lead (lead_id),
  KEY ix_img_cierre (cierre_id),
  KEY ix_img_estado (estado_descarga),
  CONSTRAINT fk_img_cierre
    FOREIGN KEY (cierre_id) REFERENCES caja_cierre (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo promotores/supervisores (espejo CRM para la caja)
CREATE TABLE IF NOT EXISTS operador (
  codigo            VARCHAR(64)  NOT NULL PRIMARY KEY,
  nombre            VARCHAR(200) NULL,
  rol               VARCHAR(16)  NOT NULL,
  equipo            VARCHAR(8)   NULL,
  id_sql            INT          NULL,
  observacion       VARCHAR(200) NULL,
  telefono          VARCHAR(40)  NULL,
  correo            VARCHAR(120) NULL,
  activo            TINYINT      NOT NULL DEFAULT 1,
  actualizado_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_operador_rol (rol),
  KEY ix_operador_equipo (equipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PDF recibos enviados por la caja (POST /api/caja/recibos)
CREATE TABLE IF NOT EXISTS caja_recibo (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid              CHAR(36)        NOT NULL,
  pendiente_uuid    CHAR(36)        NULL,
  cliente_documento VARCHAR(20)     NOT NULL,
  nro_recibo        VARCHAR(40)     NOT NULL,
  mime_type         VARCHAR(64)     NOT NULL,
  nombre_archivo    VARCHAR(260)    NULL,
  monto_total       DECIMAL(14,2)   NULL,
  sucursal_codigo   VARCHAR(40)     NOT NULL,
  storage_path      VARCHAR(500)    NOT NULL,
  lead_id           INT             NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_caja_recibo_uuid (uuid),
  KEY idx_caja_recibo_pendiente (pendiente_uuid),
  KEY idx_caja_recibo_dni (cliente_documento),
  KEY idx_caja_recibo_nro (sucursal_codigo, nro_recibo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_cursor (
  cliente     VARCHAR(64) NOT NULL PRIMARY KEY,
  ultimo_id   BIGINT NOT NULL DEFAULT 0,
  ultimo_pull DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
