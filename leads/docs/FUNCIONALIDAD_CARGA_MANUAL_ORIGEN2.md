# Carga manual con origen = 2 (upsert en encuesta)

**SP:** `[dbo].[encuestaCargaSorteo01]` en **STRSYSTEM**  
**Roles:** promotor y supervisor

## Comportamiento del SP (DBA)

| Situación | `@origen` | Resultado |
|-----------|-----------|-----------|
| Teléfono + encuesta **no existen** | cualquiera | `INSERT` → `gestionCodigo = 1` |
| Ya existen | distinto de `'2'` | `gestionCodigo = 0` — mensaje «ya registrado» |
| Ya existen | `'2'` (app manual) | `UPDATE` campos 1–8 → `gestionCodigo = 1` — «Se ha modificado el lead id …» |

La app **siempre** envía `@origen = '2'` en carga manual (`buildCargaParamsFromPayload`).

## Comportamiento de la app

| Capa | Qué hace |
|------|----------|
| `execEncuestaCargaSorteo01` | `@origen` como `Char(1)`; error solo si `gestionCodigo` / `codigo` = 0 |
| `crearEncuestaManual` | **No** bloquea por teléfono duplicado en listado local; deja que el SP actualice |
| `POST /api/leads` | `201` alta nueva · `200` si el teléfono ya estaba en la misma campaña |

Campos enviados al SP (resumen):

- `campo1` — apellido y nombres  
- `campo2` — domicilio  
- `campo5` — fijo `NO` en primer alta  
- `campo6` — fecha/hora entrevista (`AAAA/MM/DD hh:mm`)  
- `campo7` — modo contacto (`2` sucursal, `3` domicilio)  
- `campo8` — dirección sucursal o domicilio cliente  

## Variables

```env
SP_CARGA_ENCUESTA=encuestaCargaSorteo01
SP_CARGA_INCLUDE_ORIGEN=true
ENCUESTA_CARGA_ID=sorteo01
```

## Pruebas

- [ ] Mismo teléfono + misma encuesta, carga manual segunda vez → HTTP **200**, datos actualizados en listado.
- [ ] Teléfono nuevo → HTTP **201**.
- [ ] Origen distinto de manual en DB (QR/IG) sin origen 2 → la app no reemplaza ese flujo (solo POST manual con origen 2).

## Relacionado

- [FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md](./FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md) — reglas teléfono + campaña (actualizar doc si el 409 ya no aplica con origen 2).
