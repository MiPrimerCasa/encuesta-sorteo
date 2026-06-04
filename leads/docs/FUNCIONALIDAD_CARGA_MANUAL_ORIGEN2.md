# Carga manual con origen = 2 (upsert en encuesta)

**SP:** `[dbo].[encuestaCargaSorteo01]` en **STRSYSTEM**  
**Roles:** promotor y supervisor

## Comportamiento del SP (DBA)

| Situación                          | `@origen`          | Resultado                                                                   |
| ---------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| Teléfono + encuesta **no existen** | cualquiera         | `INSERT` → `gestionCodigo = 1`                                              |
| Ya existen                         | distinto de `'2'`  | `gestionCodigo = 0` — mensaje «ya registrado»                               |
| Ya existen                         | `'2'` (app manual) | `UPDATE` campos 1–8 → `gestionCodigo = 1` — «Se ha modificado el lead id …» |

La app **siempre** envía `@origen = '2'` en carga manual (`buildCargaParamsFromPayload`).

## Comportamiento de la app

| Capa                        | Qué hace                                                                         |
| --------------------------- | -------------------------------------------------------------------------------- |
| `execEncuestaCargaSorteo01` | `@origen` como `Char(1)`; error solo si `gestionCodigo` / `codigo` = 0           |
| `crearEncuestaManual`       | **No** bloquea por teléfono duplicado en listado local; deja que el SP actualice |
| `POST /api/leads`           | `201` alta nueva · `200` si el teléfono ya estaba en la misma campaña            |

Campos enviados al SP — la tabla `encuesta` guarda **`campo1Valor`, `campo2Valor`, …** (no columnas con nombre de negocio):

| Código | Parámetro SP                     | Valor que envía la app (carga / modificar teléfono) |
| ------ | -------------------------------- | --------------------------------------------------- |
| 1      | `@campo1Codigo` / `@campo1Valor` | Nombre del lead                                     |
| 2      | `@campo2Codigo` / `@campo2Valor` | Domicilio                                           |
| 3      | `@campo3Codigo` / `@campo3Valor` | `NULL` en manual                                    |
| 4      | `@campo4Codigo` / `@campo4Valor` | `NULL` en manual                                    |
| 5      | `@campo5Codigo` / `@campo5Valor` | `'NO'`                                              |
| 6      | `@campo6Codigo` / `@campo6Valor` | Entrevista `AAAA/MM/DD hh:mm` o vacío               |
| 7      | `@campo7Codigo` / `@campo7Valor` | `2` sucursal / `3` domicilio o vacío                |
| 8      | `@campo8Codigo` / `@campo8Valor` | Dirección sucursal o domicilio entrevista           |

También: `@telefono`, `@encuesta`, `@origen` = `'2'`, `@usuario` = código promotor (ej. `SORTEO01S21P01`).

## Modificar número (SP exclusivo)

**SP:** `[dbo].[encuestaModificarSorteo01]` — script DBA: `sql/encuestaModificarSorteo01.sql`

| Capa | Qué hace |
|------|----------|
| `execEncuestaModificarSorteo01` | `PATCH /api/leads/:id/telefono` — `@idEncuesta` + teléfono nuevo + campos 1–8 |
| Validación app | Solo leads manuales; teléfono nuevo no puede pertenecer a otro lead |

`encuestaCargaSorteo01` **no** se usa para cambiar teléfono A → B.

## Variables

```env
SP_CARGA_ENCUESTA=encuestaCargaSorteo01
SP_MODIFICAR_ENCUESTA=encuestaModificarSorteo01
SP_CARGA_INCLUDE_ORIGEN=true
ENCUESTA_CARGA_ID=sorteo01
```

## Pruebas

- [ ] Mismo teléfono + misma encuesta, carga manual segunda vez → HTTP **200**, datos actualizados en listado.
- [ ] Teléfono nuevo → HTTP **201**.
- [ ] Modificar número en lead manual → HTTP **200**, mismo `id`, teléfono actualizado.
- [ ] Origen distinto de manual en DB (QR/IG) sin origen 2 → la app no reemplaza ese flujo (solo POST manual con origen 2).

## Relacionado

- [FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md](./FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md) — reglas teléfono + campaña (actualizar doc si el 409 ya no aplica con origen 2).
