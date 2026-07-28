Imports System.Web
Imports System.Web.Services
Imports System.Web.Services.Protocols
Imports System.Data
Imports System.Data.SqlClient
Imports System.IO

' =============================================================================
' PIJ.asmx — versión CORREGIDA de altaModificaPlanJoven
' Fecha: 2026-07-20
'
' ERROR QUE TENÍAN DESPUÉS DEL PRIMER INTENTO DE FIX:
'   retorno = reader.Item("idVenta")
' El SP NO tiene columna "idVenta". Devuelve:
'   gestionCodigo | gestionDescripcion | idLoteVenta
' Al pedir "idVenta" tira excepción → Catch pone retorno = 0 → el CRM ve 0.
'
' CORRECTO:
'   retorno = CInt(reader("idLoteVenta"))
'
' NOTA: dejar el connection string como lo tienen ustedes (no pegar claves en chats).
' Ideal: leerlo de Web.config ConnectionStrings.
' =============================================================================

<WebService(Namespace:="http://190.106.131.63/MPC/PIJ")> _
<WebServiceBinding(ConformsTo:=WsiProfiles.BasicProfile1_1)> _
<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Public Class PIJ
    Inherits System.Web.Services.WebService

    ' TODO: mover a Web.config (ConnectionStrings)
    Private ReadOnly connectionString As String =
        "Data Source=190.106.131.63;Initial Catalog=STRSYSTEM;Persist Security Info=True;User ID=***;Password=***"

    <WebMethod(Description:="Registración de venta de Plan Inversion Joven en sistema integral. Mediante el envio de todos los parametros el sistema realiza el bloqueo y carga del anexo de manera automatica en el sistema integral , permitiendo su actualizacion y agregado de imagenes en lo sucesivo a partir del id de la venta registrada", EnableSession:=False)> _
    Public Function altaModificaPlanJoven(
                                          ByVal idVenta As Integer,
                                          ByVal idVendedor As Integer,
                                          ByVal solicitud As String,
                                          ByVal anexo As Integer,
                                          ByVal montoEfectivo As Double,
                                          ByVal montoTransferencia As Double,
                                          ByVal fechaAnexo As Date,
                                          ByVal nombreCliente As String,
                                          ByVal numeroDocumentoCliente As String,
                                          ByVal domicilioCliente As String,
                                          ByVal numeroTelefonoCliente As String
                                          ) As Integer

        Dim retorno As Integer = 0

        Using connection As New SqlConnection(connectionString)
            Using cmd As New SqlCommand("loteVentaBloqueoVendedorPIJ", connection)
                cmd.CommandType = CommandType.StoredProcedure

                cmd.Parameters.Add("@idVenta", SqlDbType.Int).Value = idVenta
                cmd.Parameters.Add("@idVendedor", SqlDbType.Int).Value = idVendedor
                ' NVarChar con tamaño: Char sin Size puede truncar "A200/300"
                cmd.Parameters.Add("@solicitud", SqlDbType.NVarChar, 100).Value =
                    If(solicitud, CType(DBNull.Value, Object))
                cmd.Parameters.Add("@anexo", SqlDbType.Int).Value = anexo
                cmd.Parameters.Add("@montoEfectivo", SqlDbType.Float).Value = montoEfectivo
                cmd.Parameters.Add("@montoTransferencia", SqlDbType.Float).Value = montoTransferencia
                cmd.Parameters.Add("@fechaAnexo", SqlDbType.DateTime).Value = fechaAnexo
                cmd.Parameters.Add("@nombreCliente", SqlDbType.NVarChar, 100).Value =
                    If(nombreCliente, CType(DBNull.Value, Object))
                cmd.Parameters.Add("@numeroDocumentoCliente", SqlDbType.NVarChar, 20).Value =
                    If(numeroDocumentoCliente, CType(DBNull.Value, Object))
                cmd.Parameters.Add("@domicilioCliente", SqlDbType.NVarChar, 100).Value =
                    If(domicilioCliente, CType(DBNull.Value, Object))
                cmd.Parameters.Add("@numeroTelefonoCliente", SqlDbType.NVarChar, 100).Value =
                    If(numeroTelefonoCliente, CType(DBNull.Value, Object))

                Try
                    connection.Open()
                    Using reader As SqlDataReader = cmd.ExecuteReader()
                        If reader.Read() Then
                            ' ===== FIX PRINCIPAL =====
                            ' El SP devuelve la columna como idLoteVenta (NO idVenta)
                            If Not IsDBNull(reader("idLoteVenta")) Then
                                retorno = CInt(reader("idLoteVenta"))
                            End If
                        End If
                    End Using
                Catch ex As Exception
                    ' IMPORTANTE: no tragar el error en silencio.
                    ' Opción A (recomendada): SOAP Fault para que el CRM vea el mensaje
                    Throw New SoapException(
                        "loteVentaBloqueoVendedorPIJ: " & ex.Message,
                        SoapException.ServerFaultCode,
                        Context.Request.Url.AbsoluteUri,
                        ex)
                    ' Opción B (si no quieren Fault): Return 0 y loguear ex.Message en archivo/EventLog
                End Try
            End Using
        End Using

        ' TODO (futuro): si idVenta/retorno > 0, cargar imágenes
        Return retorno
    End Function

End Class


' =============================================================================
' RECORDATORIO SP (debe devolver SIEMPRE este SELECT, también tras INSERT):
'
'   SELECT
'     1 AS gestionCodigo,
'     'El bloqueo del lote ha sido registrado correctamente. ' AS gestionDescripcion,
'     @idVenta AS idLoteVenta
'
' Si el SELECT usa otro alias, cambiar reader("...") acá para que coincida.
' =============================================================================
