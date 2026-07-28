# Referidos → descuento de cuotas (impacto en Caja)

**Estado:** regla de negocio documentada; pendiente de implementar en payload CRM → caja.  
**Fecha:** 2026-07-28

---

## Texto de la regla (fuente)

### Plan Inversión Joven (PIJ)

Si un cliente brinda referidos y ese referido compra un **Plan Inversión Joven** o un **terreno**, se le descuentan **dos cuotas por única vez**: la **cuota 11** y la **cuota 12**.

### Terreno

El cliente puede brindar **hasta 6 referidos**.

- Si **uno** de esos referidos compra un **terreno**, se le descuentan **2 cuotas** (las **últimas** cuotas del terreno).
- Si los **6** compran terreno, se le descuentan **12 cuotas** (es decir, **2 cuotas por referido**).

---

## Impacto en Caja (requerimiento)

Al publicar / confirmar ventas, el CRM debe mandar a caja información suficiente para que caja **descuente automáticamente** esas 2 (o hasta 12) cuotas.

Datos mínimos a transmitir (borrador de contrato):

| Dato | Uso |
|------|-----|
| `leadId` del **referido** (quien compró) | Identifica la venta que dispara el beneficio |
| `leadId` (o id encuesta) del **cliente que brindó el referido** | Titular al que se le descuentan las cuotas |
| Producto comprado por el referido (`prod-pij` / `prod-terreno`) | Define qué regla aplica (PIJ vs terreno) |
| Producto del titular del beneficio | PIJ → cuotas 11 y 12; terreno → últimas 2 por referido (tope 6 referidos / 12 cuotas) |
| Cantidad de referidos que ya generaron compra válida | Para acumular 2×N cuotas en terreno (N ≤ 6) |
| Flag / tipo de beneficio | p.ej. `descuentoReferidoCuotas` para que caja aplique el descuento sin intervención manual |

**Importante:** el referido que compra corresponde a un cliente (titular del beneficio) **por el id del lead** del que lo brindó (vínculo `lead_referido` / encuesta padre).

---

## Resumen operativo para Caja

| Caso | Qué descontar automáticamente |
|------|-------------------------------|
| Referido compra PIJ o terreno → beneficio sobre titular con **PIJ** | 2 cuotas **una sola vez**: cuota **11** y **12** |
| Referido compra **terreno** → beneficio sobre titular con **terreno** | 2 **últimas** cuotas por cada referido que compre terreno (máx. 6 referidos → 12 cuotas) |

---

## Notas de implementación (pendiente)

- Hoy el CRM ya registra referidos y vínculo lead padre ↔ referido; falta **exponer este beneficio en el payload hacia caja**.
- Coordinar con SistemaCajaPIJ el nombre exacto de campos y si el descuento se aplica al confirmar pago en caja o al encolar el cierre.
- Relacionado: [FUNCIONALIDAD_REFERIDOS_ENCUESTA.md](./FUNCIONALIDAD_REFERIDOS_ENCUESTA.md), [INTEGRACION_CAJA_SUCURSAL_MYSQL.md](./INTEGRACION_CAJA_SUCURSAL_MYSQL.md).
