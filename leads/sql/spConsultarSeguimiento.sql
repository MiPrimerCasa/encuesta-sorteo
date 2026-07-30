-- =============================================================================
-- SP DE DIAGNÓSTICO / INSPECCIÓN — spConsultarSeguimiento
-- Base: STRSYSTEM | Tabla: dbo.registrarSeguimientoLead
-- =============================================================================
-- Objetivo: mostrarle al DBA QUÉ datos se están cargando y CÓMO.
--
-- Este SP devuelve VARIOS result sets:
--   1) Diccionario de columnas físicas de la tabla        (si @incluir_diccionario=1)
--   2) Diccionario de campos que viajan dentro del JSON    (si @incluir_diccionario=1)
--   3) Claves realmente presentes en seguimiento_json + frecuencia (data real)
--   4) Muestra de filas: columnas planas vs. valores extraídos del JSON
--   5) Referidos desglosados (array $.referidos)
--   6) Compras adicionales (tabla hija o JSON legacy)
--   7) Imágenes de cierre PIJ (tabla hija o JSON legacy)
--
-- ORDEN DBA: después de tablas-hijas + columnas-planas-completas (con dni_cliente + caja_*).
-- Requiere SQL Server 2016+ (OPENJSON / JSON_VALUE / JSON_QUERY / ISJSON).
-- =============================================================================

USE [STRSYSTEM];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.spConsultarSeguimiento
    @lead_id             INT = NULL,   -- filtrar por un lead puntual (NULL = todos)
    @id_registro         INT = NULL,   -- ver una fila puntual del historial por su id
    @solo_ultimo         BIT = 0,      -- 1 = solo la fila más reciente por lead
    @top                 INT = 100,    -- límite de filas de muestra (1..1000)
    @incluir_diccionario BIT = 1       -- 1 = incluye los 2 result sets de documentación
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;

    SET @top = CASE WHEN @top < 1 THEN 100 WHEN @top > 1000 THEN 1000 ELSE @top END;

    DECLARE @tiene_dni BIT = CASE
        WHEN COL_LENGTH('dbo.registrarSeguimientoLead', 'dni_cliente') IS NULL THEN 0
        ELSE 1
    END;

    DECLARE @tiene_caja BIT = CASE
        WHEN COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_estado') IS NULL THEN 0
        ELSE 1
    END;

    /* ------------------------------------------------------------------
       Filas de trabajo → #muestra
    ------------------------------------------------------------------ */
    IF OBJECT_ID('tempdb..#muestra') IS NOT NULL DROP TABLE #muestra;

    ;WITH filtrado AS (
        SELECT
            s.*,
            rn = ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC)
        FROM dbo.registrarSeguimientoLead s
        WHERE (@lead_id IS NULL OR s.lead_id = @lead_id)
          AND (@id_registro IS NULL OR s.id = @id_registro)
    )
    SELECT TOP (@top) *
    INTO #muestra
    FROM filtrado
    WHERE (@solo_ultimo = 0 OR rn = 1)
    ORDER BY id DESC;

    /* Si columnas nuevas aún no existen en la tabla física, agregarlas en #muestra */
    IF @tiene_dni = 0
       AND NOT EXISTS (
           SELECT 1
           FROM tempdb.sys.columns
           WHERE object_id = OBJECT_ID(N'tempdb..#muestra')
             AND name = N'dni_cliente'
       )
        ALTER TABLE #muestra ADD dni_cliente NVARCHAR(16) NULL;

    IF @tiene_caja = 0
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM tempdb.sys.columns
            WHERE object_id = OBJECT_ID(N'tempdb..#muestra') AND name = N'caja_estado'
        )
            ALTER TABLE #muestra ADD caja_estado NVARCHAR(16) NULL;
        IF NOT EXISTS (
            SELECT 1 FROM tempdb.sys.columns
            WHERE object_id = OBJECT_ID(N'tempdb..#muestra') AND name = N'caja_verificado_en'
        )
            ALTER TABLE #muestra ADD caja_verificado_en DATETIME2(0) NULL;
        IF NOT EXISTS (
            SELECT 1 FROM tempdb.sys.columns
            WHERE object_id = OBJECT_ID(N'tempdb..#muestra') AND name = N'caja_comprobante_id'
        )
            ALTER TABLE #muestra ADD caja_comprobante_id NVARCHAR(64) NULL;
        IF NOT EXISTS (
            SELECT 1 FROM tempdb.sys.columns
            WHERE object_id = OBJECT_ID(N'tempdb..#muestra') AND name = N'caja_motivo_rechazo'
        )
            ALTER TABLE #muestra ADD caja_motivo_rechazo NVARCHAR(300) NULL;
        IF NOT EXISTS (
            SELECT 1 FROM tempdb.sys.columns
            WHERE object_id = OBJECT_ID(N'tempdb..#muestra') AND name = N'caja_sucursal'
        )
            ALTER TABLE #muestra ADD caja_sucursal NVARCHAR(32) NULL;
        IF NOT EXISTS (
            SELECT 1 FROM tempdb.sys.columns
            WHERE object_id = OBJECT_ID(N'tempdb..#muestra') AND name = N'caja_confirmado_por'
        )
            ALTER TABLE #muestra ADD caja_confirmado_por NVARCHAR(200) NULL;
    END;

    /* ==================================================================
       RESULT SET 1 — Diccionario de columnas físicas + estado esperado
    ================================================================== */
    IF @incluir_diccionario = 1
    BEGIN
        SELECT
            v.orden,
            v.columna,
            v.grupo,
            v.descripcion,
            estado = CASE
                WHEN COL_LENGTH('dbo.registrarSeguimientoLead', v.columna) IS NULL THEN N'*** FALTA ***'
                ELSE N'OK'
            END,
            tipo_sql = CASE
                WHEN COL_LENGTH('dbo.registrarSeguimientoLead', v.columna) IS NULL THEN v.tipo_esperado
                ELSE (
                    SELECT
                        c.DATA_TYPE
                        + CASE
                            WHEN c.CHARACTER_MAXIMUM_LENGTH IS NULL THEN N''
                            WHEN c.CHARACTER_MAXIMUM_LENGTH = -1 THEN N'(MAX)'
                            ELSE N'(' + CAST(c.CHARACTER_MAXIMUM_LENGTH AS NVARCHAR(10)) + N')'
                          END
                    FROM INFORMATION_SCHEMA.COLUMNS c
                    WHERE c.TABLE_SCHEMA = N'dbo'
                      AND c.TABLE_NAME = N'registrarSeguimientoLead'
                      AND c.COLUMN_NAME = v.columna
                )
            END
        FROM (VALUES
            ( 10, 'lead_id',                    N'base',        N'ID encuesta / lead', NULL),
            ( 11, 'telefono',                   N'base',        N'Teléfono', NULL),
            ( 12, 'encuesta',                   N'base',        N'Código campaña', NULL),
            ( 13, 'fechaAlta',                  N'base',        N'Fecha registro fila historial', NULL),
            ( 14, 'confirmo_entrevista',        N'base',        N'Confirmó entrevista', NULL),
            ( 15, 'canal',                      N'base',        N'Medio contacto', NULL),
            ( 16, 'hubo_entrevista',            N'base',        N'Hubo entrevista', NULL),
            ( 17, 'resultado_entrevista',       N'base',        N'Resultado entrevista', NULL),
            ( 18, 'horario_entrevista_propuesto',N'base',       N'Horario propuesto', NULL),
            ( 19, 'fecha_reagenda',             N'base',        N'Fecha reagenda', NULL),
            ( 20, 'seguimiento_pij_promotor',   N'base',        N'Seguimiento PIJ promotor', NULL),
            ( 21, 'id_producto',                N'base',        N'Producto venta', NULL),
            ( 22, 'estado_pago',                N'base',        N'Estado pago', NULL),
            ( 23, 'id_barrio',                  N'base',        N'Barrio terreno', NULL),
            ( 24, 'numero_recibo',              N'base',        N'Recibo/anexo texto completo', NULL),
            ( 25, 'brindo_referidos',           N'base',        N'Brindó referidos', NULL),
            ( 26, 'referidos_json',             N'base',        N'Array referidos', NULL),
            ( 27, 'observaciones',              N'base',        N'Notas operador', NULL),
            ( 28, 'operador_id',                N'base',        N'ID operador', NULL),
            ( 29, 'operador_rol',               N'base',        N'Rol operador', NULL),
            ( 30, 'operador_nombre',            N'base',        N'Nombre operador', NULL),
            ( 31, 'seguimiento_json',           N'base',        N'Snapshot JSON completo', NULL),
            ( 40, 'forma_pago',                 N'medio_pago',  N'efectivo | transferencia | mixto', N'NVARCHAR(16)'),
            ( 41, 'monto_cierre',               N'medio_pago',  N'Monto total PIJ', N'DECIMAL(12,2)'),
            ( 42, 'monto_efectivo',             N'medio_pago',  N'Parte efectivo', N'DECIMAL(12,2)'),
            ( 43, 'monto_transferencia',        N'medio_pago',  N'Parte transferencia', N'DECIMAL(12,2)'),
            ( 44, 'fecha_cierre',               N'medio_pago',  N'Fecha/hora cierre', N'DATETIME2'),
            ( 45, 'fuente',                     N'medio_pago',  N'Origen lead', N'NVARCHAR(16)'),
            ( 46, 'titular_transferencia',      N'medio_pago',  N'Titular de la transferencia', N'NVARCHAR(200)'),
            ( 461, 'titular_coincide_cliente',  N'medio_pago',  N'Si el titular coincide con el cliente', N'BIT'),
            ( 47, 'banco_transferencia',        N'medio_pago',  N'Banco de la transferencia (legado)', N'NVARCHAR(120)'),
            ( 48, 'referencia_transferencia',   N'medio_pago',  N'Referencia / Nro. operación TRF (legado)', N'NVARCHAR(120)'),
            ( 32, 'seguimiento_agenda_operador_rol', N'base',   N'Rol que agendó (supervisor/promotor)', N'NVARCHAR(16)'),
            ( 33, 'derivacion_terreno_activa',  N'base',        N'Derivación a terreno aún activa', N'BIT'),
            ( 50, 'serie_pij',                  N'pij_recibo',  N'Serie A o B', N'NVARCHAR(1)'),
            ( 51, 'nro_adhesion',               N'pij_recibo',  N'Número adhesión', N'NVARCHAR(10)'),
            ( 52, 'nro_anexo',                  N'pij_recibo',  N'Número anexo', N'NVARCHAR(10)'),
            ( 53, 'compras_adicionales_json',   N'pij_recibo',  N'LEGACY — tabla registrarSeguimientoLead_compra', N'NVARCHAR(MAX)'),
            ( 54, 'imagenes_cierre_json',       N'pij_imagen',  N'LEGACY — tabla registrarSeguimientoLead_imagen', N'NVARCHAR(MAX)'),
            ( 55, 'dni_cliente',                N'pij_cliente', N'DNI del cliente al cierre PIJ', N'NVARCHAR(16)'),
            ( 60, 'caja_estado',                N'caja',        N'pendiente | verificado | rechazado', N'NVARCHAR(16)'),
            ( 61, 'caja_verificado_en',         N'caja',        N'Fecha/hora confirmación de caja', N'DATETIME2'),
            ( 62, 'caja_comprobante_id',        N'caja',        N'ID/nro interno de comprobante de caja', N'NVARCHAR(64)'),
            ( 63, 'caja_motivo_rechazo',        N'caja',        N'Motivo si caja rechaza el cierre', N'NVARCHAR(300)'),
            ( 64, 'caja_sucursal',              N'caja',        N'Sucursal que confirmó (token sync)', N'NVARCHAR(32)'),
            ( 65, 'caja_confirmado_por',        N'caja',        N'Usuario de caja que confirmó la venta', N'NVARCHAR(200)')
        ) v(orden, columna, grupo, descripcion, tipo_esperado)
        ORDER BY v.orden;

        /* ==============================================================
           RESULT SET 2 — Diccionario de campos DENTRO de seguimiento_json
        ============================================================== */
        SELECT campo_json, columna_plana, tipo, valores_validos, descripcion
        FROM (VALUES
            ('confirmoEntrevista',          'confirmo_entrevista',          'bool',   'true / false',                                             N'Si el lead confirmó la entrevista'),
            ('fuente',                      'fuente',                       'string', 'qr, app, facebook, instagram, whatsapp, tiktok',           N'Canal de origen del lead'),
            ('canal',                       'canal',                        'string', 'llamada, mensaje, en_persona',                             N'Medio del contacto'),
            ('huboEntrevista',              'hubo_entrevista',              'bool',   'true / false',                                             N'Si se concretó la entrevista'),
            ('resultadoEntrevista',         'resultado_entrevista',         'string', 'sin_interes, reagenda, no_compro, compro, derivar_terreno', N'Resultado de la entrevista'),
            ('horarioEntrevistaPropuesto',  'horario_entrevista_propuesto', 'string', 'texto libre',                                              N'Horario propuesto'),
            ('fechaReagenda',               'fecha_reagenda',               'string', 'fecha ISO / texto',                                        N'Fecha para reagendar'),
            ('fechaCierre',                 'fecha_cierre',                 'string', 'fecha ISO',                                                N'Fecha del cierre/venta principal'),
            ('formaPago',                   'forma_pago',                   'string', 'efectivo, transferencia, mixto',                           N'Medio de cobro adhesión PIJ'),
            ('montoCierre',                 'monto_cierre',                 'number', 'monto total (ej. 33000)',                                  N'Monto total del cierre PIJ'),
            ('montoEfectivo',               'monto_efectivo',               'number', 'parte en efectivo',                                        N'Monto en efectivo'),
            ('montoTransferencia',          'monto_transferencia',          'number', 'parte en transferencia',                                   N'Monto transferido'),
            ('titularTransferencia',        'titular_transferencia',        'string', 'texto libre',                                              N'Titular de la transferencia'),
            ('titularCoincideCliente',      'titular_coincide_cliente',     'bool',   'true / false',                                             N'Si el titular coincide con el cliente'),
            ('bancoTransferencia',          'banco_transferencia',          'string', 'texto libre (legado)',                                     N'Banco de la transferencia'),
            ('referenciaTransferencia',     'referencia_transferencia',     'string', 'texto libre (legado)',                                     N'Referencia / nro. operación TRF'),
            ('seguimientoPijPromotor',      'seguimiento_pij_promotor',     'bool',   'true / false',                                             N'Marca de seguimiento PIJ por promotor'),
            ('seguimientoAgendaOperadorRol','seguimiento_agenda_operador_rol','string', 'supervisor, promotor',                                   N'Rol que agendó'),
            ('idProducto',                  'id_producto',                  'string', 'prod-pij, prod-terreno, ...',                              N'Producto de la venta'),
            ('estadoPago',                  'estado_pago',                  'string', 'sena, cien, entrega_33, entrega_55',                       N'Estado del pago'),
            ('idBarrio',                    'id_barrio',                    'string', 'id de barrio',                                             N'Barrio (para terreno)'),
            ('numeroRecibo',                'numero_recibo',                'string', 'ej. A230/300 ANEXO 400',                                    N'Serie + anexo del recibo (texto completo)'),
            ('seriePij',                    'serie_pij',                    'string', 'A | B',                                                    N'Serie PIJ (columna plana)'),
            ('nroAdhesion',                 'nro_adhesion',                 'string', 'ej. 135',                                                  N'Número de adhesión PIJ (columna plana)'),
            ('nroAnexo',                    'nro_anexo',                    'string', 'ej. 75',                                                   N'Número de anexo PIJ (columna plana)'),
            ('dniCliente',                  'dni_cliente',                  'string', '7-8 dígitos',                                              N'DNI del cliente al cierre PIJ'),
            ('comprasAdicionales',          'compras_adicionales_json / tabla _compra', 'array',  '[{ id, idProducto, ... }]',                   N'Ventas extra — preferir tabla hija'),
            ('imagenesCierre',              'imagenes_cierre_json / tabla _imagen', 'array', '[{ id, ventaKey, tipo, storagePath, ... }]',       N'Fotos PIJ — preferir tabla hija'),
            ('brindoReferidos',             'brindo_referidos',             'bool',   'true / false',                                             N'Si dejó referidos'),
            ('derivacionTerrenoActiva',     'derivacion_terreno_activa',    'bool',   'true / false',                                             N'Derivación a terreno aún activa'),
            ('referidos',                   'referidos_json',               'array',  '[{ nombre, telefono }]',                                   N'Lista de referidos brindados'),
            ('referidosGenerados',          '(solo en JSON)',               'array',  '[{ nombre, telefono, leadId, estado, mensaje }]',          N'Referidos ya cargados como leads'),
            ('observaciones',               'observaciones',                'string', 'texto libre (máx 500)',                                    N'Notas del operador'),
            ('operadorId',                  'operador_id',                  'string', 'id numérico',                                              N'Operador que registró'),
            ('operadorRol',                 'operador_rol',                 'string', 'supervisor, promotor',                                     N'Rol del operador'),
            ('operadorNombre',              'operador_nombre',              'string', 'texto',                                                    N'Nombre del operador'),
            ('creadoEn',                    'fechaAlta',                    'string', 'fecha ISO',                                                N'Fecha de alta del registro'),
            ('cajaEstado',                  'caja_estado',                  'string', 'pendiente, verificado, rechazado',                         N'Verificación del cierre en caja de sucursal'),
            ('cajaVerificadoEn',            'caja_verificado_en',           'string', 'fecha ISO',                                                N'Fecha/hora en que caja confirmó o rechazó'),
            ('cajaComprobanteId',           'caja_comprobante_id',          'string', 'id interno caja',                                          N'Nro/id de comprobante que devolvió la caja'),
            ('cajaMotivoRechazo',           'caja_motivo_rechazo',          'string', 'texto (máx 300)',                                          N'Motivo si caja rechaza el cierre'),
            ('cajaSucursal',                'caja_sucursal',                'string', 'ej. S21',                                                  N'Sucursal que confirmó (derivada del token)'),
            ('cajaConfirmadoPor',           'caja_confirmado_por',          'string', 'nombre usuario caja',                                      N'Usuario de caja que confirmó/rechazó la venta')
        ) d(campo_json, columna_plana, tipo, valores_validos, descripcion);
    END

    /* ==================================================================
       RESULT SET 3 — Claves REALES presentes en seguimiento_json
    ================================================================== */
    SELECT
        propiedad_json = j.[key],
        tipo_json      = MAX(CASE j.type
                                WHEN 0 THEN 'null'
                                WHEN 1 THEN 'string'
                                WHEN 2 THEN 'number'
                                WHEN 3 THEN 'bool'
                                WHEN 4 THEN 'array'
                                WHEN 5 THEN 'object'
                             END),
        veces          = COUNT(*),
        ejemplo_valor  = MAX(CASE WHEN j.type IN (1, 2, 3) THEN CONVERT(NVARCHAR(200), j.value) END)
    FROM #muestra m
    CROSS APPLY OPENJSON(m.seguimiento_json) j
    WHERE ISJSON(m.seguimiento_json) = 1
    GROUP BY j.[key]
    ORDER BY veces DESC, propiedad_json;

    /* ==================================================================
       RESULT SET 4 — Muestra: columnas planas vs. valores del JSON
    ================================================================== */
    SELECT
        m.id,
        m.lead_id,
        m.telefono,
        m.encuesta,
        creado_en             = m.fechaAlta,
        m.operador_id,
        m.operador_rol,
        m.operador_nombre,
        col_confirmo          = m.confirmo_entrevista,
        col_canal             = m.canal,
        col_hubo_entrevista   = m.hubo_entrevista,
        col_resultado         = m.resultado_entrevista,
        col_horario           = m.horario_entrevista_propuesto,
        col_fecha_reagenda    = m.fecha_reagenda,
        col_pij_promotor      = m.seguimiento_pij_promotor,
        col_id_producto       = m.id_producto,
        col_estado_pago       = m.estado_pago,
        col_id_barrio         = m.id_barrio,
        col_numero_recibo     = m.numero_recibo,
        col_forma_pago        = m.forma_pago,
        col_monto_cierre      = m.monto_cierre,
        col_fecha_cierre      = m.fecha_cierre,
        col_fuente            = m.fuente,
        col_titular_trf       = m.titular_transferencia,
        col_banco_trf         = m.banco_transferencia,
        col_referencia_trf    = m.referencia_transferencia,
        col_agenda_rol        = m.seguimiento_agenda_operador_rol,
        col_derivacion_activa = m.derivacion_terreno_activa,
        col_serie_pij         = m.serie_pij,
        col_nro_adhesion      = m.nro_adhesion,
        col_nro_anexo         = m.nro_anexo,
        col_dni_cliente       = m.dni_cliente,
        col_caja_estado       = m.caja_estado,
        col_caja_verificado_en = m.caja_verificado_en,
        col_caja_comprobante_id = m.caja_comprobante_id,
        col_caja_motivo_rechazo = m.caja_motivo_rechazo,
        col_caja_sucursal     = m.caja_sucursal,
        col_caja_confirmado_por = m.caja_confirmado_por,
        col_compras_adic_json = m.compras_adicionales_json,
        col_imagenes_json     = m.imagenes_cierre_json,
        col_brindo_referidos  = m.brindo_referidos,
        col_observaciones     = m.observaciones,
        json_resultado        = JSON_VALUE(m.seguimiento_json, '$.resultadoEntrevista'),
        json_canal            = JSON_VALUE(m.seguimiento_json, '$.canal'),
        json_fuente           = JSON_VALUE(m.seguimiento_json, '$.fuente'),
        json_forma_pago       = JSON_VALUE(m.seguimiento_json, '$.formaPago'),
        json_monto_cierre     = JSON_VALUE(m.seguimiento_json, '$.montoCierre'),
        json_fecha_cierre     = JSON_VALUE(m.seguimiento_json, '$.fechaCierre'),
        json_titular_trf      = JSON_VALUE(m.seguimiento_json, '$.titularTransferencia'),
        json_banco_trf        = JSON_VALUE(m.seguimiento_json, '$.bancoTransferencia'),
        json_referencia_trf   = JSON_VALUE(m.seguimiento_json, '$.referenciaTransferencia'),
        json_agenda_rol       = JSON_VALUE(m.seguimiento_json, '$.seguimientoAgendaOperadorRol'),
        json_derivacion_activa = JSON_VALUE(m.seguimiento_json, '$.derivacionTerrenoActiva'),
        json_id_producto      = JSON_VALUE(m.seguimiento_json, '$.idProducto'),
        json_serie_pij        = COALESCE(
                                    JSON_VALUE(m.seguimiento_json, '$.seriePij'),
                                    JSON_VALUE(m.seguimiento_json, '$.serie')
                                ),
        json_nro_adhesion     = JSON_VALUE(m.seguimiento_json, '$.nroAdhesion'),
        json_nro_anexo        = JSON_VALUE(m.seguimiento_json, '$.nroAnexo'),
        json_estado_pago      = JSON_VALUE(m.seguimiento_json, '$.estadoPago'),
        json_id_barrio        = JSON_VALUE(m.seguimiento_json, '$.idBarrio'),
        json_numero_recibo    = JSON_VALUE(m.seguimiento_json, '$.numeroRecibo'),
        json_dni_cliente      = JSON_VALUE(m.seguimiento_json, '$.dniCliente'),
        json_caja_estado      = JSON_VALUE(m.seguimiento_json, '$.cajaEstado'),
        json_caja_verificado_en = JSON_VALUE(m.seguimiento_json, '$.cajaVerificadoEn'),
        json_caja_comprobante_id = JSON_VALUE(m.seguimiento_json, '$.cajaComprobanteId'),
        json_caja_motivo_rechazo = JSON_VALUE(m.seguimiento_json, '$.cajaMotivoRechazo'),
        json_caja_sucursal    = JSON_VALUE(m.seguimiento_json, '$.cajaSucursal'),
        json_caja_confirmado_por = JSON_VALUE(m.seguimiento_json, '$.cajaConfirmadoPor'),
        json_pij_promotor     = JSON_VALUE(m.seguimiento_json, '$.seguimientoPijPromotor'),
        json_brindo_referidos = JSON_VALUE(m.seguimiento_json, '$.brindoReferidos'),
        json_operador_nombre  = JSON_VALUE(m.seguimiento_json, '$.operadorNombre'),
        cant_referidos        = (SELECT COUNT(*) FROM OPENJSON(ISNULL(JSON_QUERY(m.seguimiento_json, '$.referidos'), '[]'))),
        cant_compras_adic     = (SELECT COUNT(*) FROM OPENJSON(ISNULL(JSON_QUERY(m.seguimiento_json, '$.comprasAdicionales'), '[]'))),
        cant_imagenes_json    = (SELECT COUNT(*) FROM OPENJSON(ISNULL(JSON_QUERY(m.seguimiento_json, '$.imagenesCierre'), '[]'))),
        cant_compras_tabla    = (SELECT COUNT(*) FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id),
        cant_imagenes_tabla   = (SELECT COUNT(*) FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id),
        es_json_valido        = ISJSON(m.seguimiento_json),
        m.referidos_json,
        m.seguimiento_json
    FROM #muestra m
    ORDER BY m.id DESC;

    /* ==================================================================
       RESULT SET 5 — Referidos desglosados
    ================================================================== */
    SELECT
        seguimiento_id = m.id,
        m.lead_id,
        nombre         = r.nombre,
        telefono       = r.telefono
    FROM #muestra m
    CROSS APPLY OPENJSON(ISNULL(JSON_QUERY(m.seguimiento_json, '$.referidos'), '[]'))
        WITH (
            nombre   NVARCHAR(150) '$.nombre',
            telefono NVARCHAR(50)  '$.telefono'
        ) r
    ORDER BY m.id DESC;

    /* ==================================================================
       RESULT SET 6 — Compras adicionales (tabla hija o JSON legacy)
    ================================================================== */
    SELECT
        seguimiento_id = m.id,
        m.lead_id,
        compra_id      = c.id_compra,
        id_producto    = c.id_producto,
        estado_pago    = c.estado_pago,
        id_barrio      = c.id_barrio,
        numero_recibo  = c.numero_recibo,
        serie          = c.serie_pij,
        nro_adhesion   = c.nro_adhesion,
        nro_anexo      = c.nro_anexo,
        fecha_cierre   = c.fecha_cierre,
        forma_pago     = c.forma_pago,
        monto_cierre   = c.monto_cierre,
        origen         = N'tabla'
    FROM #muestra m
    INNER JOIN dbo.registrarSeguimientoLead_compra c ON c.id_seguimiento = m.id
    UNION ALL
    SELECT
        seguimiento_id = m.id,
        m.lead_id,
        compra_id      = j.compra_id,
        id_producto    = j.idProducto,
        estado_pago    = j.estadoPago,
        id_barrio      = j.idBarrio,
        numero_recibo  = j.numeroRecibo,
        serie          = j.serie,
        nro_adhesion   = j.nroAdhesion,
        nro_anexo      = j.nroAnexo,
        fecha_cierre   = TRY_CONVERT(DATETIME2(0), j.fechaCierre, 126),
        forma_pago     = j.formaPago,
        monto_cierre   = j.montoCierre,
        origen         = N'json'
    FROM #muestra m
    CROSS APPLY OPENJSON(ISNULL(JSON_QUERY(m.seguimiento_json, '$.comprasAdicionales'), '[]'))
        WITH (
            compra_id    NVARCHAR(64) '$.id',
            idProducto   NVARCHAR(64) '$.idProducto',
            estadoPago   NVARCHAR(32) '$.estadoPago',
            idBarrio     NVARCHAR(64) '$.idBarrio',
            numeroRecibo NVARCHAR(80) '$.numeroRecibo',
            serie        NVARCHAR(1)  '$.serie',
            nroAdhesion  NVARCHAR(10) '$.nroAdhesion',
            nroAnexo     NVARCHAR(10) '$.nroAnexo',
            fechaCierre  NVARCHAR(40) '$.fechaCierre',
            formaPago    NVARCHAR(16) '$.formaPago',
            montoCierre  DECIMAL(12,2) '$.montoCierre'
        ) j
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id
    )
    ORDER BY seguimiento_id DESC;

    /* ==================================================================
       RESULT SET 7 — Imágenes de cierre PIJ (tabla hija o JSON legacy)
    ================================================================== */
    SELECT
        seguimiento_id  = m.id,
        m.lead_id,
        id_imagen       = i.id_imagen,
        venta_key       = i.venta_key,
        tipo_imagen     = i.tipo_imagen,
        mime_type       = i.mime_type,
        nombre_original = i.nombre_original,
        tamano_bytes    = i.tamano_bytes,
        storage_path    = i.storage_path,
        tiene_contenido = CASE WHEN i.contenido IS NOT NULL THEN 1 ELSE 0 END,
        operador_id     = i.operador_id,
        subido_en       = i.subido_en,
        origen          = N'tabla'
    FROM #muestra m
    INNER JOIN dbo.registrarSeguimientoLead_imagen i ON i.id_seguimiento = m.id
    UNION ALL
    SELECT
        seguimiento_id  = m.id,
        m.lead_id,
        id_imagen       = j.id_imagen,
        venta_key       = j.venta_key,
        tipo_imagen     = CASE LOWER(ISNULL(j.tipo_imagen, N''))
                            WHEN N'recibo' THEN N'img6'
                            WHEN N'comprobante_transferencia' THEN N'img7'
                            ELSE j.tipo_imagen
                          END,
        mime_type       = j.mime_type,
        nombre_original = j.nombre_original,
        tamano_bytes    = j.tamano_bytes,
        storage_path    = j.storage_path,
        tiene_contenido = 0,
        operador_id     = j.operador_id,
        subido_en       = TRY_CONVERT(DATETIME2(0), j.subido_en, 126),
        origen          = N'json'
    FROM #muestra m
    CROSS APPLY OPENJSON(
        ISNULL(
            JSON_QUERY(m.seguimiento_json, '$.imagenesCierre'),
            CASE WHEN ISJSON(m.imagenes_cierre_json) = 1 THEN m.imagenes_cierre_json ELSE N'[]' END
        )
    )
        WITH (
            id_imagen       NVARCHAR(36)  '$.id',
            venta_key       NVARCHAR(36)  '$.ventaKey',
            tipo_imagen     NVARCHAR(16)  '$.tipo',
            mime_type       NVARCHAR(32)  '$.mimeType',
            nombre_original NVARCHAR(260) '$.nombreOriginal',
            tamano_bytes    INT           '$.tamanoBytes',
            storage_path    NVARCHAR(500) '$.storagePath',
            operador_id     INT           '$.operadorId',
            subido_en       NVARCHAR(40)  '$.subidoEn'
        ) j
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id
    )
    ORDER BY seguimiento_id DESC, venta_key, tipo_imagen;

    /* ==================================================================
       RESULT SET 8 — Estado tablas hijas / faltantes rápidos
    ================================================================== */
    SELECT
        tabla_compra_ok = CASE WHEN OBJECT_ID(N'dbo.registrarSeguimientoLead_compra', N'U') IS NULL THEN 0 ELSE 1 END,
        tabla_imagen_ok = CASE WHEN OBJECT_ID(N'dbo.registrarSeguimientoLead_imagen', N'U') IS NULL THEN 0 ELSE 1 END,
        columna_dni_ok  = @tiene_dni,
        columnas_caja_ok = @tiene_caja,
        filas_muestra   = (SELECT COUNT(*) FROM #muestra),
        con_compras_tabla = (
            SELECT COUNT(DISTINCT m.id)
            FROM #muestra m
            INNER JOIN dbo.registrarSeguimientoLead_compra c ON c.id_seguimiento = m.id
        ),
        con_imagenes_tabla = (
            SELECT COUNT(DISTINCT m.id)
            FROM #muestra m
            INNER JOIN dbo.registrarSeguimientoLead_imagen i ON i.id_seguimiento = m.id
        );

    IF OBJECT_ID('tempdb..#muestra') IS NOT NULL DROP TABLE #muestra;
END;
GO

GRANT EXECUTE ON dbo.spConsultarSeguimiento TO [MPCSP];
GO

/*
EXEC dbo.spConsultarSeguimiento @solo_ultimo = 1, @top = 5;
EXEC dbo.spConsultarSeguimiento @lead_id = 6035, @solo_ultimo = 1;
*/
