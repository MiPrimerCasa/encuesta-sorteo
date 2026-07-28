/*
  =============================================================================
  SP_ExportarCierresParaBloqueo — Cierres CRM para bloqueos (Sistema Integral)
  =============================================================================
  Base: STRSYSTEM

  MODELO DE DATOS (igual que la app Node — server/db/seguimiento-sql.js):
  - Tabla: dbo.registrarSeguimientoLead (append por cada guardado)
  - Columnas planas: resultado_entrevista, id_producto, numero_recibo, operador_id, …
  - seguimiento_json: payload completo camelCase (fechaCierre, comprasAdicionales, …)
  - Columnas planas nuevas (sql/SP_RegistrarSeguimientoLead-medio-pago.sql):
    forma_pago, monto_cierre, monto_efectivo, monto_transferencia, fecha_cierre, fuente
  - La app lee con mapSqlRowToSeguimiento: JSON pisa / complementa columnas planas

  ENCUESTA (dbo.encuesta):
  - campo1Valor = apellidos y nombres
  - campo2Valor = domicilio / barrio texto
  - usuario     = código promotor (ej. SORTEO01S21P01)
  - OJO: idVendedor / idSupervisor NO son columnas de encuesta.

  id_vendedor se resuelve en este orden:
    1) mensajeria.dbo.vendedor.idVendedor (JOIN por encuesta.usuario = v.codigo)
    2) lead_referido.id_vendedor
    3) operador_id del cierre si operador_rol = promotor

  Uso:
    EXEC dbo.SP_ExportarCierresParaBloqueo;
    EXEC dbo.SP_ExportarCierresParaBloqueo @solo_pij = 1;
    EXEC dbo.SP_ExportarCierresParaBloqueo @mes_desde = 6, @mes_hasta = 6;

  REQUIERE: columnas de sql/SP_RegistrarSeguimientoLead-medio-pago.sql ya creadas.

  GRANT EXECUTE ON dbo.SP_ExportarCierresParaBloqueo TO [MPCSP];
  =============================================================================
*/

USE STRSYSTEM;
GO

CREATE OR ALTER FUNCTION dbo.fn_ParseReciboPij (@recibo NVARCHAR(200))
RETURNS TABLE
AS
RETURN
(
  SELECT
    serie = p.serie,
    nro_adhesion = CASE
      WHEN p.serie IS NOT NULL AND p.pos_slash > 2
        THEN NULLIF(REPLACE(SUBSTRING(p.clean, 2, p.pos_slash - 2), N'/', N''), N'')
      ELSE NULL
    END,
    nro_anexo = CASE
      WHEN p.pos_anexo > 0
        THEN NULLIF(
          REPLACE(REPLACE(SUBSTRING(p.clean, p.pos_anexo + 5, 20), N'/300', N''), N'/', N''),
          N''
        )
      ELSE NULL
    END,
    recibo_limpio = p.clean
  FROM (
    SELECT
      clean,
      serie = CASE WHEN LEFT(clean, 1) IN (N'A', N'B') THEN LEFT(clean, 1) ELSE NULL END,
      pos_slash = NULLIF(CHARINDEX(N'/', clean), 0),
      pos_anexo = NULLIF(PATINDEX(N'%ANEXO%', clean), 0)
    FROM (
      SELECT clean = UPPER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(@recibo, N''), CHAR(9), N' '), N'  ', N' '))))
    ) AS src
  ) AS p
);
GO

CREATE OR ALTER PROCEDURE dbo.SP_ExportarCierresParaBloqueo
  @anio            INT           = 2026,
  @mes_desde       TINYINT       = 6,
  @mes_hasta       TINYINT       = 7,
  @encuesta        NVARCHAR(64)  = NULL,
  @solo_pij        BIT           = 0,
  @incluir_terreno BIT           = 1
AS
BEGIN
  SET NOCOUNT ON;

  IF @mes_desde < 1 OR @mes_desde > 12 OR @mes_hasta < 1 OR @mes_hasta > 12
  BEGIN
    RAISERROR(N'mes_desde y mes_hasta deben estar entre 1 y 12.', 16, 1);
    RETURN;
  END;

  ;WITH ultimo_seguimiento AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC) AS rn
    FROM dbo.registrarSeguimientoLead s
    WHERE s.resultado_entrevista = N'compro'
  ),
  /* Último cierre por lead — campos como mapSqlRowToSeguimiento en Node */
  seg AS (
    SELECT
      s.id              AS seguimiento_id,
      s.lead_id,
      s.telefono        AS seguimiento_telefono,
      s.encuesta        AS seguimiento_encuesta,
      s.operador_id,
      s.operador_rol,
      s.operador_nombre,
      s.observaciones   AS seguimiento_observaciones,
      s.referidos_json,
      s.seguimiento_json,
      s.fechaAlta       AS seguimiento_registrado_en,

      id_producto = COALESCE(s.id_producto, JSON_VALUE(s.seguimiento_json, '$.idProducto')),
      estado_pago   = COALESCE(s.estado_pago, JSON_VALUE(s.seguimiento_json, '$.estadoPago')),
      id_barrio     = COALESCE(s.id_barrio, JSON_VALUE(s.seguimiento_json, '$.idBarrio')),
      numero_recibo = COALESCE(
        NULLIF(LTRIM(RTRIM(s.numero_recibo)), N''),
        NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.numeroRecibo'))), N'')
      ),
      fecha_cierre = COALESCE(
        s.fecha_cierre,
        TRY_CONVERT(DATETIME2(0), JSON_VALUE(s.seguimiento_json, '$.fechaCierre'), 126),
        TRY_CONVERT(DATETIME2(0), JSON_VALUE(s.seguimiento_json, '$.fechaCierre'), 127),
        TRY_CONVERT(DATETIME2(0), s.fechaAlta)
      ),
      forma_pago = COALESCE(
        NULLIF(LTRIM(RTRIM(s.forma_pago)), N''),
        NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.formaPago'))), N'')
      ),
      monto_cierre = COALESCE(
        s.monto_cierre,
        TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.montoCierre') AS DECIMAL(12, 2))
      ),
      monto_efectivo = COALESCE(
        s.monto_efectivo,
        TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.montoEfectivo') AS DECIMAL(12, 2))
      ),
      monto_transferencia = COALESCE(
        s.monto_transferencia,
        TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.montoTransferencia') AS DECIMAL(12, 2))
      ),
      fuente = COALESCE(
        NULLIF(LTRIM(RTRIM(s.fuente)), N''),
        NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.fuente'))), N'')
      ),
      operador_nombre_json = JSON_VALUE(s.seguimiento_json, '$.operadorNombre'),
      fuente_json          = JSON_VALUE(s.seguimiento_json, '$.fuente'),
      canal_json           = JSON_VALUE(s.seguimiento_json, '$.canal'),
      resultado_json       = JSON_VALUE(s.seguimiento_json, '$.resultadoEntrevista')
    FROM ultimo_seguimiento s
    WHERE s.rn = 1
  ),
  enc AS (
    SELECT
      e.id,
      e.telefono,
      e.encuesta,
      e.usuario           AS codigo_promotor,
      e.origen,
      e.fechaAlta,
      e.campo1Valor       AS apellido_nombres,
      e.campo2Valor       AS domicilio,
      e.campo3Valor       AS conoce_mpc,
      e.campo4Valor       AS conoce_plan_inversion_joven,
      e.campo5Valor       AS quiere_mas_informacion,
      e.campo6Valor       AS fecha_hora_entrevista,
      e.campo7Valor       AS modo_contacto,
      e.campo8Valor       AS domicilio_entrevista,

      /* idVendedor/idSupervisor NO son columnas de encuesta:
         se resuelven por JOIN mensajeria.dbo.vendedor (usuario = codigo) o lead_referido */
      id_vendedor = COALESCE(
        TRY_CAST(v.idVendedor AS INT),
        lr.id_vendedor
      ),
      id_supervisor = COALESCE(
        TRY_CAST(v.idSupervisor AS INT),
        lr.id_supervisor
      ),
      lr.codigo_promotor AS codigo_promotor_referido
    FROM dbo.encuesta e
    LEFT JOIN dbo.lead_referido lr
      ON lr.id_encuesta_referido = e.id
    LEFT JOIN mensajeria.dbo.vendedor v
      ON v.codigo = e.usuario
  ),
  cierres_principal AS (
    SELECT
      s.seguimiento_id,
      s.lead_id,
      es_principal        = CAST(1 AS BIT),
      compra_adicional_id = CAST(NULL AS NVARCHAR(64)),
      s.id_producto,
      s.estado_pago,
      s.id_barrio,
      s.numero_recibo,
      s.fecha_cierre,
      s.forma_pago,
      s.monto_cierre,
      s.monto_efectivo,
      s.monto_transferencia,
      s.fuente,
      s.seguimiento_telefono,
      s.seguimiento_registrado_en,
      s.operador_id,
      s.operador_rol,
      s.operador_nombre,
      s.operador_nombre_json,
      s.fuente_json,
      s.canal_json,
      s.seguimiento_observaciones,
      s.referidos_json,
      s.seguimiento_json,
      enc.*
    FROM seg s
    INNER JOIN enc ON enc.id = s.lead_id
    WHERE
      s.numero_recibo IS NOT NULL
      AND s.numero_recibo <> N'-'
      AND (
        (@solo_pij = 1 AND s.id_producto = N'prod-pij')
        OR (@solo_pij = 0 AND (
          s.id_producto = N'prod-pij'
          OR (@incluir_terreno = 1 AND s.id_producto = N'prod-terreno')
        ))
      )
      AND YEAR(s.fecha_cierre) = @anio
      AND MONTH(s.fecha_cierre) BETWEEN @mes_desde AND @mes_hasta
      AND (@encuesta IS NULL OR enc.encuesta = @encuesta OR s.seguimiento_encuesta = @encuesta)
  ),
  cierres_adicionales AS (
    SELECT
      s.seguimiento_id,
      s.lead_id,
      es_principal        = CAST(0 AS BIT),
      compra_adicional_id = j.id,
      id_producto         = j.idProducto,
      estado_pago         = j.estadoPago,
      id_barrio           = j.idBarrio,
      numero_recibo       = j.numeroRecibo,
      fecha_cierre = COALESCE(
        TRY_CONVERT(DATETIME2(0), j.fechaCierre, 126),
        TRY_CONVERT(DATETIME2(0), j.fechaCierre, 127),
        s.fecha_cierre
      ),
      forma_pago          = j.formaPago,
      monto_cierre        = j.montoCierre,
      monto_efectivo      = j.montoEfectivo,
      monto_transferencia = j.montoTransferencia,
      fuente              = s.fuente,
      s.seguimiento_telefono,
      s.seguimiento_registrado_en,
      s.operador_id,
      s.operador_rol,
      s.operador_nombre,
      s.operador_nombre_json,
      s.fuente_json,
      s.canal_json,
      s.seguimiento_observaciones,
      s.referidos_json,
      s.seguimiento_json,
      enc.*
    FROM seg s
    INNER JOIN enc ON enc.id = s.lead_id
    CROSS APPLY OPENJSON(s.seguimiento_json, '$.comprasAdicionales')
      WITH (
        id           NVARCHAR(64)  '$.id',
        idProducto   NVARCHAR(32)  '$.idProducto',
        estadoPago   NVARCHAR(16)  '$.estadoPago',
        idBarrio     NVARCHAR(32)  '$.idBarrio',
        numeroRecibo NVARCHAR(80)  '$.numeroRecibo',
        fechaCierre  NVARCHAR(32)  '$.fechaCierre',
        formaPago    NVARCHAR(16)  '$.formaPago',
        montoCierre  DECIMAL(12,2) '$.montoCierre',
        montoEfectivo DECIMAL(12,2) '$.montoEfectivo',
        montoTransferencia DECIMAL(12,2) '$.montoTransferencia'
      ) j
    WHERE
      ISJSON(s.seguimiento_json) = 1
      AND j.numeroRecibo IS NOT NULL
      AND LTRIM(RTRIM(j.numeroRecibo)) <> N''
      AND LTRIM(RTRIM(j.numeroRecibo)) <> N'-'
      AND (
        (@solo_pij = 1 AND j.idProducto = N'prod-pij')
        OR (@solo_pij = 0 AND (
          j.idProducto = N'prod-pij'
          OR (@incluir_terreno = 1 AND j.idProducto = N'prod-terreno')
        ))
      )
      AND YEAR(COALESCE(
        TRY_CONVERT(DATETIME2(0), j.fechaCierre, 126),
        TRY_CONVERT(DATETIME2(0), j.fechaCierre, 127),
        s.fecha_cierre
      )) = @anio
      AND MONTH(COALESCE(
        TRY_CONVERT(DATETIME2(0), j.fechaCierre, 126),
        TRY_CONVERT(DATETIME2(0), j.fechaCierre, 127),
        s.fecha_cierre
      )) BETWEEN @mes_desde AND @mes_hasta
      AND (@encuesta IS NULL OR enc.encuesta = @encuesta OR s.seguimiento_encuesta = @encuesta)
  ),
  unificado AS (
    SELECT * FROM cierres_principal
    UNION ALL
    SELECT * FROM cierres_adicionales
  )
  SELECT
    u.lead_id,
    u.es_principal,
    u.compra_adicional_id,

    /* Bloqueo sistema integral */
    id_vendedor = COALESCE(
      u.id_vendedor,
      CASE WHEN LOWER(LTRIM(RTRIM(u.operador_rol))) = N'promotor' THEN u.operador_id END
    ),
    u.id_supervisor,
    u.codigo_promotor,
    nombre_operador_cierre = COALESCE(u.operador_nombre, u.operador_nombre_json),

    p.serie,
    p.nro_adhesion,
    p.nro_anexo,
    u.numero_recibo AS numero_recibo_completo,
    serie_adhesion_app = CASE
      WHEN p.serie IS NOT NULL AND p.nro_adhesion IS NOT NULL
        THEN p.serie + p.nro_adhesion + N'/300'
      ELSE NULL
    END,
    serie_bloqueo_integral = CASE
      WHEN p.serie IS NOT NULL AND p.nro_adhesion IS NOT NULL
        THEN p.serie + RIGHT(REPLICATE(N'0', 4) + p.nro_adhesion, 4) + N'/3000'
      ELSE NULL
    END,

    fecha_recibo = CAST(u.fecha_cierre AS DATE),
    hora_recibo  = CAST(u.fecha_cierre AS TIME(0)),

    /* Cliente */
    u.apellido_nombres,
    telefono_cliente = COALESCE(u.telefono, u.seguimiento_telefono),
    u.domicilio,
    barrio_terreno   = u.id_barrio,
    u.domicilio_entrevista,

    /* Venta */
    u.id_producto,
    u.estado_pago,
    u.forma_pago,
    u.monto_cierre,
    u.monto_efectivo,
    u.monto_transferencia,
    u.fuente,
    u.fuente_json,
    u.canal_json,

    /* Encuesta */
    u.encuesta AS codigo_campania,
    u.origen,
    u.fechaAlta AS encuesta_fecha_alta,
    u.conoce_mpc,
    u.conoce_plan_inversion_joven,
    u.quiere_mas_informacion,
    u.fecha_hora_entrevista,
    u.modo_contacto,

    /* Auditoría */
    u.seguimiento_id,
    u.seguimiento_registrado_en,
    u.operador_id,
    u.operador_rol,
    u.seguimiento_observaciones,
    u.referidos_json,
    u.seguimiento_json,

    mes_cierre  = MONTH(u.fecha_cierre),
    anio_cierre = YEAR(u.fecha_cierre)

  FROM unificado u
  OUTER APPLY dbo.fn_ParseReciboPij(u.numero_recibo) p
  ORDER BY
    u.fecha_cierre,
    id_vendedor,
    u.apellido_nombres,
    u.es_principal DESC;
END;
GO

/*
  --- Pruebas DBA ---

  SELECT * FROM dbo.fn_ParseReciboPij(N'B135/300 ANEXO 75/300');
  EXEC dbo.SP_ExportarCierresParaBloqueo @solo_pij = 1;
  EXEC dbo.SP_ExportarCierresParaBloqueo @mes_desde = 6, @mes_hasta = 6;

  -- Verificar columnas nuevas en la exportación:
  -- forma_pago, monto_cierre, monto_efectivo, monto_transferencia, fuente
*/
