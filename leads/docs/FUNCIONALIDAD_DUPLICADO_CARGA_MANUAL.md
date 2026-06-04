# Duplicado en carga manual: teléfono + encuesta

**Roles:** promotor y supervisor (quien carga manual)  
**Estado:** activo

### Resumen

Al dar de alta un lead manualmente, un contacto se considera duplicado solo si ya existe el **mismo teléfono en la misma campaña** (`encuesta`), no si el teléfono aparece en otro sorteo (sorteo01 vs sorteo02).

### Reglas de negocio

| Situación | Resultado |
|-----------|-----------|
| Mismo teléfono + misma `encuesta`, **nueva** carga manual (`@origen = 2`) | HTTP **200** — el SP **actualiza** el lead (ver [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md)) |
| Mismo teléfono + misma `encuesta` sin origen 2 (otros canales) | HTTP 409 si el SP devuelve `gestionCodigo = 0` |
| Mismo teléfono + otra campaña | Permitido |
| Tras alta exitosa | Se busca el lead creado por **teléfono + encuesta** de la carga |

Campaña de carga = `ENCUESTA_CARGA_ID` o `ENCUESTA_ID` (default `sorteo01`).

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| ID campaña carga | `server/db/encuesta-carga.js` → `getEncuestaCampaniaId()` | Lee env y normaliza |
| Pre-chequeo | `server/db/encuesta-carga.js` → `telefonoYaEnCampania()` | Compara teléfono + `codigoCampania` del lead |
| Alta manual | `server/db/encuesta-carga.js` → `crearEncuestaManual()` | Upsert vía SP con `@origen = 2`; búsqueda post-alta por tel+encuesta |
| Mapeo campaña en leads | `server/db/encuestas.js` → `mapEncuestaRowToLead` | Expone `codigoCampania` |
| Parámetro SP | `buildCargaParamsFromPayload` | `encuesta: getEncuestaCampaniaId()` |
| API | `server/create-app.js` → `POST /api/leads` | Delega en `crearEncuestaManual` |
| UI carga | `src/components/leads/NuevoLeadSheet.tsx` | Formulario; el 409 lo muestra la API |

Función legacy (no usar en código nuevo):

- `telefonoYaEnListado()` → alias que llama a `telefonoYaEnCampania` con la campaña de carga actual.

### Variables de entorno

```env
ENCUESTA_CARGA_ID=sorteo01   # o sorteo02 para segunda campaña
ENCUESTA_CARGA_ID_EXACT=true # opcional: conservar mayúsculas SORTEO01
```

### Pruebas manuales

- [ ] Teléfono existente en sorteo01 → cargar otro en sorteo02 con `ENCUESTA_CARGA_ID=sorteo02` → OK.
- [ ] Mismo teléfono y misma campaña, segunda carga manual → **200** y datos actualizados.
- [ ] Tras alta, el lead listado tiene `codigoCampania` correcto.

### Relacionado

- [SORTEOS_Y_PARTICIPANTES.md](./SORTEOS_Y_PARTICIPANTES.md)
- [FUNCIONALIDAD_BADGE_CAMPANIA.md](./FUNCIONALIDAD_BADGE_CAMPANIA.md)
