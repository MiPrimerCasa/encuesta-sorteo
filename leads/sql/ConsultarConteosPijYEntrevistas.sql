/*
  Conteos post-migración: entrevistas + ventas PIJ (principal y adicionales).
  Usa el ÚLTIMO snapshot por lead_id (historial append-only).
  Las compras adicionales se toman solo del último seguimiento de cada lead.
*/
USE STRSYSTEM;
GO

;WITH ultimo AS (
    SELECT
        s.*,
        rn = ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC)
    FROM dbo.registrarSeguimientoLead s
),
u AS (
    SELECT *
    FROM ultimo
    WHERE rn = 1
),
adicionales_pij AS (
    SELECT
        c.lead_id,
        c.id_seguimiento,
        c.id_compra,
        c.serie_pij,
        c.nro_adhesion,
        c.nro_anexo,
        c.numero_recibo,
        c.forma_pago,
        c.monto_cierre,
        c.fecha_cierre
    FROM dbo.registrarSeguimientoLead_compra c
    INNER JOIN u ON u.id = c.id_seguimiento
    WHERE c.id_producto = N'prod-pij'
)
SELECT
    leads_con_seguimiento = COUNT(*),

    entrevistas = SUM(CASE WHEN u.hubo_entrevista = 1 THEN 1 ELSE 0 END),

    -- Venta principal PIJ (1 por lead en el último estado)
    ventas_pij_principal = SUM(CASE
        WHEN u.resultado_entrevista = N'compro'
         AND u.id_producto = N'prod-pij'
        THEN 1 ELSE 0 END),

    ventas_pij_principal_grupo_a = SUM(CASE
        WHEN u.resultado_entrevista = N'compro'
         AND u.id_producto = N'prod-pij'
         AND u.serie_pij = N'A'
        THEN 1 ELSE 0 END),

    ventas_pij_principal_grupo_b = SUM(CASE
        WHEN u.resultado_entrevista = N'compro'
         AND u.id_producto = N'prod-pij'
         AND u.serie_pij = N'B'
        THEN 1 ELSE 0 END),

    -- Adicionales PIJ (pueden ser >1 por lead)
    ventas_pij_adicionales = (
        SELECT COUNT(*) FROM adicionales_pij
    ),
    ventas_pij_adicionales_grupo_a = (
        SELECT COUNT(*) FROM adicionales_pij WHERE serie_pij = N'A'
    ),
    ventas_pij_adicionales_grupo_b = (
        SELECT COUNT(*) FROM adicionales_pij WHERE serie_pij = N'B'
    ),

    -- Total PIJ = principal + adicionales
    ventas_pij_total = SUM(CASE
        WHEN u.resultado_entrevista = N'compro'
         AND u.id_producto = N'prod-pij'
        THEN 1 ELSE 0 END)
        + (SELECT COUNT(*) FROM adicionales_pij),

    -- Otros resultados (último estado)
    sin_interes = SUM(CASE WHEN u.resultado_entrevista = N'sin_interes' THEN 1 ELSE 0 END),
    no_compro   = SUM(CASE WHEN u.resultado_entrevista = N'no_compro' THEN 1 ELSE 0 END),
    reagenda    = SUM(CASE WHEN u.resultado_entrevista = N'reagenda' THEN 1 ELSE 0 END),
    terreno     = SUM(CASE
        WHEN u.resultado_entrevista = N'compro' AND u.id_producto = N'prod-terreno'
        THEN 1 ELSE 0 END)
FROM u;
GO

/* Detalle: ventas PIJ principales */
;WITH ultimo AS (
    SELECT
        s.*,
        rn = ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC)
    FROM dbo.registrarSeguimientoLead s
)
SELECT
    tipo = N'principal',
    lead_id,
    serie_pij,
    nro_adhesion,
    nro_anexo,
    numero_recibo,
    forma_pago,
    monto_cierre,
    fecha_cierre,
    dni_cliente
FROM ultimo
WHERE rn = 1
  AND resultado_entrevista = N'compro'
  AND id_producto = N'prod-pij'
ORDER BY fecha_cierre DESC, lead_id;
GO

/* Detalle: ventas PIJ adicionales (último snapshot) */
;WITH ultimo AS (
    SELECT
        s.id,
        s.lead_id,
        rn = ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC)
    FROM dbo.registrarSeguimientoLead s
)
SELECT
    tipo = N'adicional',
    c.lead_id,
    c.serie_pij,
    c.nro_adhesion,
    c.nro_anexo,
    c.numero_recibo,
    c.forma_pago,
    c.monto_cierre,
    c.fecha_cierre,
    dni_cliente = CAST(NULL AS NVARCHAR(32))
FROM dbo.registrarSeguimientoLead_compra c
INNER JOIN ultimo u ON u.id = c.id_seguimiento AND u.rn = 1
WHERE c.id_producto = N'prod-pij'
ORDER BY c.fecha_cierre DESC, c.lead_id;
GO
