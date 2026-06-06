# Contactado vs Cierres (no compró / sin interés)

**Roles:** promotor y supervisor  
**Estado:** activo

### Resumen

**Cierres** agrupa solo ventas (`compro`). Los resultados negativos **`no_compro`** y **`sin_interes`** (sin reagenda PIJ) van a la pestaña **Contactado**, no a un bloque «No compró» dentro de Cierres.

La reagenda tras «No compró» para PIJ sigue yendo a **En seguimiento** — ver [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md).

### Reglas de negocio

| `resultadoEntrevista` | Pestaña |
|----------------------|---------|
| `compro` | Cierres |
| `no_compro` o `sin_interes` (sin `reagenda`) | Contactado |
| `reagenda` (+ `seguimientoPijPromotor` opcional) | En seguimiento |

Solo `compro` cuenta como «cerrado» para excluir el lead de Prioridad / Contactado activo (`cerrados` en el filtro).

### Orden y estilo en Contactado (jun. 2026)

Los post-entrevista sin compra (`huboEntrevista = true` + `no_compro` / `sin_interes`) van **arriba** en Contactado, con tarjeta **naranja** y badge «No compró» / «Sin interés». Ver [FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md](./FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md).

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Tab al buscar/abrir | `src/domain/leads.ts` → `tabIdListaLead` | Negativos → `contacto`; solo `compro` → `compro` |
| Listas | `src/hooks/useLeadsFilter.ts` | `paraContactar` incluye negativos + `sortLeadsContactados`; `cerrados` solo compras |
| UI | `src/components/leads/LeadsPanel.tsx` | Sin subsección «No compró» en Cierres; Cierres por fecha venta |
| Tarjeta | `src/components/leads/LeadCard.tsx` | Estilo naranja post-entrevista |
| Docs prioridad | `docs/PRIORIDAD_LEADS.md` | Tabla «Qué NO va en Prioridad» actualizada |

### Pruebas manuales

- [ ] Promotor: no compró sin reagendar → **Contactado** (arriba, naranja), no en Cierres.
- [ ] Venta registrada → solo en **Cierres** (más reciente arriba).
- [ ] No compró + reagenda PIJ → **En seguimiento**, no Contactado.

### Relacionado

- [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md)
- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
