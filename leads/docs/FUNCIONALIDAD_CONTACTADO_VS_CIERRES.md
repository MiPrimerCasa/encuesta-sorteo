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

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Tab al buscar/abrir | `src/domain/leads.ts` → `tabIdListaLead` | Negativos → `contacto`; solo `compro` → `compro` |
| Listas | `src/hooks/useLeadsFilter.ts` | `paraContactar` incluye `esCerradoNegativo`; `cerrados` solo compras |
| UI | `src/components/leads/LeadsPanel.tsx` | Eliminada subsección «No compró» en Cierres |
| Docs prioridad | `docs/PRIORIDAD_LEADS.md` | Tabla «Qué NO va en Prioridad» actualizada |

### Pruebas manuales

- [ ] Promotor: no compró sin reagendar → aparece en **Contactado**, no en Cierres.
- [ ] Venta registrada → solo en **Cierres**.
- [ ] No compró + reagenda PIJ → **En seguimiento**, no Contactado.

### Relacionado

- [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md)
- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
