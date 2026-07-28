# Correcciones requeridas — SOAP PIJ (`altaModificaPlanJoven` + SP)

**Fecha:** 2026-07-20  
**Para:** DBA / responsable del sistema integral PIJ  
**Origen:** pruebas CRM Seguimiento Leads → `https://www.miprimercasa.ar/pij/pij.asmx`

El CRM ya envía la llamada SOAP correctamente. El `result=0` viene del **SP** y/o del **ASMX** al leer el resultado.

---

## 1. Resumen (qué corregir)

| # | Pieza | Problema | Efecto |
|---|--------|----------|--------|
| 1 | SP `loteVentaBloqueoVendedorPIJ` | En el `INSERT` (alta nueva) **no hay `SELECT`** que devuelva `idLoteVenta` | El ASMX ve 0 filas → retorna **0** |
| 2 | ASMX `altaModificaPlanJoven` | Lee `reader.Item(0)` = `gestionCodigo` (**1**), no `idLoteVenta` | Aunque haya filas, **no devuelve el id real** |
| 3 | ASMX | El `Catch` pone `retorno = 0` y **no propaga** el error | El CRM solo ve `0`, sin mensaje |
| 4 | Datos de prueba | `solicitud` debe ser parcela completa (`A200/300`), no solo `200` | Si no existe en `barrioLote`, falla el alta |

---

## 2. Formato que espera el sistema (confirmado)

Ejemplo de ejecución correcta del SP (lado SQL):

```text
0, 132, 'A200/300', 2000, 20000, 13000,
'27/07/2026 11:22:33', 'PRUEBA CAJAL STRAUSS ', '16367898', 'DPTO 3', '3246578-8787'
```

| Parámetro | Tipo | Ejemplo | Nota |
|-----------|------|---------|------|
| `@idVenta` | int | `0` | `0` = alta / bloqueo nuevo |
| `@idVendedor` | int | `132` | |
| `@solicitud` | nvarchar | **`A200/300`** | = `barrioLoteParcela` (serie + nro + `/300`) |
| `@anexo` | int | `2000` | = `recibo.reciboNumero` |
| `@montoEfectivo` | numeric | `20000` | |
| `@montoTransferencia` | numeric | `13000` | |
| `@fechaAnexo` | datetime | (fecha válida) | En SQL pueden usar `dd/MM/yyyy`; en **SOAP** debe ser **xsd:dateTime** ISO |
| `@nombreCliente` | nvarchar | texto | |
| `@numeroDocumentoCliente` | nvarchar | DNI | |
| `@domicilioCliente` | nvarchar | texto (puede ir vacío) | |
| `@numeroTelefonoCliente` | nvarchar | texto | |

### SOAP vs SQL en la fecha

- **Ejecutar SP en SSMS:** puede usarse `'27/07/2026 11:22:33'`.
- **Web Service ASMX:** el XML exige fecha ISO, p. ej. `2026-07-20T19:45:08`.  
  Si llega `20/07/2026 19:38:09` → fault: *"no es un valor AllXsd válido"*.

El CRM ya manda ISO. No cambiar el SP por eso; el ASMX parsea `Date` desde el XML.

---

## 3. Corrección del SP `loteVentaBloqueoVendedorPIJ`

### Problema actual

- Rama **INSERT** (`if not exists … loteVenta`): hace `INSERT`, asigna `@idVenta = SCOPE_IDENTITY()`, pero **no hace `SELECT`**.
- Rama **ELSE**: hace `UPDATE` + `UPDATE recibo` y **sí** hace:

```sql
select
  1 as gestionCodigo,
  'El bloqueo del lote ha sido registrado correctamente. ' as gestionDescripcion,
  @idVenta as idLoteVenta
```

### Fix pedido

Devolver **el mismo result set en ambas ramas** (después del `INSERT` y del `ELSE`), o un único `SELECT` al final del SP con `@idVenta` ya resuelto.

Ejemplo (después del `INSERT` y `set @idVenta = SCOPE_IDENTITY()`):

```sql
select
  1 as gestionCodigo,
  'El bloqueo del lote ha sido registrado correctamente. ' as gestionDescripcion,
  @idVenta as idLoteVenta
```

Ideal: sacar el `SELECT` **fuera** del `if/else` para no duplicar:

```sql
if not exists (select 1 from loteVenta where idBarrioLote = @idBarrioLote)
begin
  insert into loteVenta ( ... ) values ( ... )
  set @idVenta = SCOPE_IDENTITY()
  -- opcional: completar datos de cliente / montos también en el alta
end
else
begin
  select top 1 @idVenta = idLoteVenta from loteVenta where idBarrioLote = @idBarrioLote
  update loteVenta set ... where idLoteVenta = @idVenta
  update recibo set ... where reciboNumero = @anexo
end

-- SIEMPRE devolver el id
select
  1 as gestionCodigo,
  'El bloqueo del lote ha sido registrado correctamente. ' as gestionDescripcion,
  @idVenta as idLoteVenta
```

### Validaciones recomendadas (opcional pero útil)

1. Si `@solicitud` no existe en `barrioLote.barrioLoteParcela` → `@idBarrioLote` queda `NULL` y el alta falla o inserta mal. Conviene `RAISERROR` claro.
2. En el `UPDATE recibo … where reciboNumero = @anexo`: si el recibo no existe, no actualiza nada (el id puede devolverse igual).
3. En la rama **INSERT**, hoy casi no se graban nombre/DNI/domicilio/teléfono/montos (eso está solo en el `UPDATE` del `ELSE`). Conviene alinear el alta con los mismos campos.

---

## 4. Corrección del ASMX `altaModificaPlanJoven`

### Problema actual (código revisado)

```vb
reader = cmd.ExecuteReader

If reader.HasRows Then
    While reader.Read
        retorno = reader.Item(0)   ' ← BUG: columna 0 = gestionCodigo (1), no el id
    End While
End If
```

Y en error:

```vb
Catch ex As Exception
    retorno = 0                  ' ← el CRM solo ve 0
    cadena = ex.Message          ' ← no se devuelve al cliente
End Try
```

### Fix pedido

```vb
reader = cmd.ExecuteReader()

If reader.Read() Then
    ' Columna idLoteVenta (NO Item(0) = gestionCodigo)
    retorno = CInt(reader("idLoteVenta"))
Else
    retorno = 0
End If
```

Alternativa por índice (solo si el `SELECT` mantiene el orden `gestionCodigo, gestionDescripcion, idLoteVenta`):

```vb
retorno = CInt(reader.Item(2))
```

### Errores

No silenciar excepciones. Opciones:

- Relanzar / SOAP Fault con `ex.Message`, o
- Devolver un código negativo documentado y loguear el mensaje en el servidor.

### Imágenes

En el `WebMethod` revisado **no hay parámetros** `imgDocumentoAnverso`, etc. El bloqueo actual es solo datos → SP.  
El bloque comentado de “cargar imágenes si `idVenta <> 0`” está incompleto. Cuando implementen fotos, deben:

1. Declarar los `Byte()` en la firma del método (y republicar WSDL), o
2. Confirmar al CRM que las imágenes van por otro método.

Mientras tanto el CRM puede enviar los tags vacíos; el ASMX los ignora si no están en la firma.

### Tipos de parámetros SQL (recomendación)

Hoy se usan varios `SqlDbType.Char` sin tamaño explícito y `@anexo` como `Char` aunque el SP lo declara `int`. Preferible alinear:

| Parámetro | SqlDbType sugerido |
|-----------|--------------------|
| `@idVenta`, `@idVendedor`, `@anexo` | `Int` |
| `@solicitud`, nombres, DNI, domicilio, teléfono | `NVarChar` con Size (p. ej. 100 / 20) |
| `@montoEfectivo`, `@montoTransferencia` | `Decimal` o `Float` según el SP |
| `@fechaAnexo` | `DateTime` |

---

## 5. Qué debe devolver el Web Service al CRM

- Tipo: `Integer` (`altaModificaPlanJovenResult`).
- Valor esperado en éxito: **`idLoteVenta` > 0** (el id real de `loteVenta`).
- Valor en fallo: `0` (o fault SOAP con detalle).

El CRM guarda ese número como `idVentaIntegral` y lo reutiliza en llamadas posteriores (`idVenta > 0`).

**No** devolver `gestionCodigo` (1): el CRM lo tomaría como id de venta incorrecto.

---

## 6. Ejemplo de XML que envía el CRM (bloqueo)

Operación: `altaModificaPlanJoven`  
Namespace: `http://190.106.131.63/MPC/PIJ`  
URL: `https://www.miprimercasa.ar/pij/pij.asmx`

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <altaModificaPlanJoven xmlns="http://190.106.131.63/MPC/PIJ">
      <idVenta>0</idVenta>
      <idVendedor>132</idVendedor>
      <solicitud>A200/300</solicitud>
      <anexo>2000</anexo>
      <montoEfectivo>0</montoEfectivo>
      <montoTransferencia>33000</montoTransferencia>
      <fechaAnexo>2026-07-20T19:45:08</fechaAnexo>
      <nombreCliente>Pablo García</nombreCliente>
      <numeroDocumentoCliente>2203030</numeroDocumentoCliente>
      <domicilioCliente></domicilioCliente>
      <numeroTelefonoCliente>5493705390110</numeroTelefonoCliente>
      <!-- imgs opcionales / ignoradas si el WebMethod no las declara -->
      <imgDocumentoAnverso></imgDocumentoAnverso>
      <imgDocumentoReverso></imgDocumentoReverso>
      <imgSolicitud></imgSolicitud>
      <imgAnexo></imgAnexo>
      <imgcomprobanteMEP></imgcomprobanteMEP>
    </altaModificaPlanJoven>
  </soap:Body>
</soap:Envelope>
```

Respuesta esperada en éxito:

```xml
<altaModificaPlanJovenResult>12345</altaModificaPlanJovenResult>
```

(`12345` = ejemplo de `idLoteVenta` real, no `0` ni `1` salvo que el id sea realmente 1.)

---

## 7. Checklist de prueba (lado integral)

1. [ ] Ejecutar el SP a mano con `solicitud = 'A200/300'` (parcela existente) y ver que el result set trae `idLoteVenta > 0` **también en alta nueva**.
2. [ ] Publicar ASMX leyendo `reader("idLoteVenta")`.
3. [ ] Llamar el ASMX (página de prueba o SOAP) con el XML de arriba.
4. [ ] Confirmar que `altaModificaPlanJovenResult` = id de `loteVenta`, no `0` ni `gestionCodigo`.
5. [ ] Reintentar desde el CRM: log `[pij-soap] bloqueo OK lead=… idVenta=<n>`.

---

## 8. Fuera de alcance / seguridad

- El connection string del ASMX no debe versionarse ni compartirse en chats con usuario `sa` y contraseña en claro. Conviene cuenta de servicio con permisos mínimos y rotar la clave si quedó expuesta.
- El CRM (Seguimiento Leads) no modifica STRSYSTEM del integral; solo consume el SOAP.

---

## 9. Contacto / evidencia CRM

Logs locales de cada llamada:

`data/pij-soap-logs/*_bloqueo.json`

Últimas pruebas con formato corregido de `solicitud` (`A…/300`) y fecha ISO siguen devolviendo `result=0` hasta aplicar las correcciones de este documento.
