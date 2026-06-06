# Código promotor desde planilla SQL (asignación estricta)

**Roles:** promotor (carga manual, links); supervisor (carga por promotor)  
**Estado:** activo (jun. 2026)  
**RF:** RF-50, RF-51 (§17 `DOCUMENTACION_SISTEMA.md`)

### Resumen

El `@usuario` de carga (`SORTEO01S21P01`, etc.) se resuelve desde **`dbo.rptLinkQRenRedesSociales`** (STRSYSTEM) con reglas **estrictas** para que un promotor no reciba el código de otro vendedor por coincidencia parcial de nombre (ej. «Leonel C» vs «STRAUSS LEONEL»).

### Problema que corrige

Antes, la resolución fuzzy podía asignar el código de un compañero si el nombre coincidía parcialmente o si había filas ajenas en el listado. Eso afectaba:

- Carga manual (`encuestaCargaSorteo01`) con `@usuario` incorrecto.
- Links de redes del operador equivocado.
- Notificaciones de links regenerados para otro código.

### Reglas de negocio

1. **Catálogo primero:** al arrancar la API, `warmOperadoresCatalog()` precarga el SP (respaldo `links-redes.json`).
2. **Promotor — orden de búsqueda** (`resolveCodigoCargaPromotorStrict`):
   - `byIdOperador` → `byLoginId` → `byNombre` exacto.
   - Coincidencia flexible de nombre solo si `entry.vendedor` del SP coincide (`nombresCoinciden`).
   - Código desde filas propias del listado (`idVendedor` + columna `usuario`).
   - `codigoCarga` de sesión solo si `codigoPerteneceAVendedor`.
3. **Supervisor:** `resolveCodigoCargaOperador` (elige promotor en formulario; no aplica strict al supervisor mismo).
4. **Login y cada request de leads/carga** enriquecen usuario con `enriquecerUsuarioConCodigoCarga(usuario, rows)`.

### Fallback en frontend (RF-51)

Si el promotor no tiene `codigoCarga` en sesión:

1. `LeadsPanel` llama `fetchLinksRedes()` y usa `links.codigo`.
2. Si falla, busca `codigoPromotorCarga` en un lead propio (`idVendedor` = operador logueado).

Ese valor alimenta `NuevoLeadSheet` como `codigoCargaFallback`.

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Catálogo + strict | `server/db/operadores-catalog.js` | `resolveCodigoCargaPromotorStrict`, `nombresCoinciden`, `codigoPerteneceAVendedor` |
| Precarga SP | `server/index.js` | `warmOperadoresCatalog()` |
| Login | `server/db/mssql.js`, `create-app.js` | `enriquecerUsuarioConCodigoCarga` post-login |
| Carga manual | `server/db/encuesta-carga.js` | Código antes de ejecutar SP carga |
| Links API | `server/db/links-redes.js` | `resolveCodigoCargaOperador` |
| UI fallback | `src/components/leads/LeadsPanel.tsx` | `codigoDesdeLinks` + `codigoCargaFallback` |

### Verificación (QA)

```bash
node scripts/verificar-asignacion-links.mjs
```

Comprueba casos conocidos (Jose G → `SORTEO01S21P02`, Leonel C → `SORTEO01S21P01`) y que códigos ajenos no se asignen a otro `idVendedor`.

### Pruebas manuales

- [ ] Promotor sin `codigoCarga` en login: carga manual usa código del SP/links.
- [ ] Dos promotores con nombres parecidos: cada uno conserva su `@usuario`.
- [ ] Links en Leads muestran URLs del código propio.

### Relacionado

- [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) — catálogo SP y notificaciones
- [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md) — SP carga con `@usuario`
- [DOCUMENTACION_SISTEMA.md](./DOCUMENTACION_SISTEMA.md) §17
