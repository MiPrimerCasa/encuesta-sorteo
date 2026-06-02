# Derivar con supervisor — interés terreno (promotor en calle)

**Roles:** promotor (registra), supervisor (gestiona en Prioridad)  
**Estado:** activo

### Resumen

En visita con entrevista, el promotor puede derivar al supervisor por **interés en terreno**, con o sin fecha propuesta. El lead sube al **grupo 0** de la pestaña **Prioridad** y deja de mostrarse como «Contactado».

### Reglas de negocio

| Opción | `resultadoEntrevista` | Efecto en lead |
|--------|----------------------|----------------|
| Derivar sin fecha | `derivar_terreno` | `lista: contacto`, sin `horarioEntrevista` obligatorio |
| Derivar con fecha | `derivar_terreno` + `horarioEntrevistaPropuesto` | `horarioEntrevista` y `lista: entrevista` (grupo 1 en Prioridad) |

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Dominio | `src/domain/leads.ts` | `leadDerivaSupervisorTerreno`, `applySeguimientoAlLead` |
| Prioridad grupo 0 | `src/domain/prioridad-leads.ts` | `prioridadTabInicial === 0` |
| Formulario promotor | `src/components/leads/LeadModalForm.tsx` | Radio derivar + fecha opcional |
| Etiquetas | `src/domain/venta.ts` → `etiquetasResultadoEntrevista` | Texto «Derivar con supervisor…» |
| Tipos | `src/types/index.ts` | `derivar_terreno`, `horarioEntrevistaPropuesto` |
| Schema API | `server/schemas/seguimiento.js` | Enum incluye `derivar_terreno` |
| Tarjeta | `src/components/leads/LeadCard.tsx` | Pill «Interés terreno» en Contactado (si aplica) |

### Relacionado

- [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md)
- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
