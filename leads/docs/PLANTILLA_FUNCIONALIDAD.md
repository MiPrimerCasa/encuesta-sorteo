# Plantilla — documentación por funcionalidad

Copiá este archivo como `docs/FUNCIONALIDAD_<NOMBRE_CORTO>.md` (o `docs/funcionalidades/<nombre>.md`) cada vez que se implemente un cambio lógico de negocio.

---

## Título de la funcionalidad

**Fecha / commit de referencia:** (opcional)  
**Roles afectados:** promotor | supervisor | ambos  
**Estado:** activo | pendiente deploy | deprecado

### Resumen (1–3 oraciones)

Qué problema resuelve y qué ve el usuario.

### Reglas de negocio

| Condición | Resultado |
|-----------|-----------|
| … | … |

### Flujo en pantalla

1. Paso usuario…
2. …

### Dónde está el cambio (mapa de código)

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Dominio | `src/domain/...` | Reglas puras, sin UI |
| Hooks / filtros | `src/hooks/...` | Listas, orden, alertas |
| UI | `src/components/...` | Pantallas, tarjetas, formularios |
| Tipos | `src/types/index.ts` | Contratos TypeScript |
| API cliente | `src/api/client.ts` | Llamadas HTTP |
| Backend | `server/...` | SP, validación, persistencia |
| Schema API | `server/schemas/...` | Validación Zod del body |
| Docs | `docs/...` | Este archivo |

### Persistencia

- ¿Se guarda en SQLite local (`lead_seguimiento_externo`)?
- ¿Viene solo del SP de encuestas?
- Variables de entorno relevantes (`.env`).

### Pruebas manuales sugeridas

- [ ] Caso feliz…
- [ ] Caso borde…

### Relacionado

- Enlaces a otros `docs/FUNCIONALIDAD_*.md` o `docs/INDICE_FUNCIONALIDADES.md`.
