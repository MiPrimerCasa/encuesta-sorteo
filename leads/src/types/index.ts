export type RolUsuario = 'promotor' | 'supervisor' | 'superadmin';
export type VistaActiva = 'leads' | 'promotores' | 'metricas' | 'calendario' | 'admin' | 'grabacion';
export type ListaLead = 'entrevista' | 'contacto';
/** Dónde quiere la entrevista el cliente (encuesta / SP). */
export type LugarEntrevista = 'sucursal' | 'domicilio';
export type OrigenLead = 'encuesta' | 'sorteo' | 'manual' | 'redes';
export type FuenteLead = 'qr' | 'app' | 'facebook' | 'instagram' | 'whatsapp' | 'tiktok';
export type CanalContacto = 'llamada' | 'mensaje' | 'en_persona';
export type ResultadoEntrevista =
  | 'sin_interes'
  | 'reagenda'
  | 'no_compro'
  | 'compro'
  | 'derivar_terreno';
/** sena/cien = terreno; entrega_33/entrega_55 = plan inversión */
export type EstadoPago = 'sena' | 'cien' | 'entrega_33' | 'entrega_55';
/** Medio de cobro de la adhesión PIJ ($33.000). */
export type FormaPago = 'efectivo' | 'transferencia' | 'mixto';

/** Tipo de foto al cierre PIJ (códigos de administración: img1, img2, img5, img6, img7). */
export type TipoImagenCierrePij = 'img1' | 'img2' | 'img5' | 'img6' | 'img7';

export interface ImagenCierrePij {
  id: string;
  leadId: string;
  /** 'principal' o id de CompraAdicional */
  ventaKey: string;
  tipo: TipoImagenCierrePij;
  storagePath: string;
  mimeType: string;
  tamanoBytes: number;
  nombreOriginal?: string | null;
  subidoEn: string;
  operadorId?: string | null;
  /** false = el archivo no está en disco */
  archivoDisponible?: boolean;
}

/** Canal de ingreso en carga manual (alineado a métricas de origen + casos habituales). */
export type OrigenIngresoManual =
  | 'qr'
  | 'sorteo'
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'tiktok'
  | 'manual'
  | 'referido'
  | 'otro';

export interface NuevoLeadData {
  nombre: string;
  telefono: string;
  lista: ListaLead;
  quiereEntrevista: boolean;
  promotorId: string;
  /** Código SP @usuario (ej. SORTEO01S21P01). Supervisor: del promotor elegido. */
  promotorCodigo?: string;
  /** Nombre del promotor (supervisor elige en combo; promotor = sesión). */
  promotorNombre?: string;
  domicilio?: string;
  origen: OrigenIngresoManual;
  observaciones?: string;
  /** ¿Conocés la inmobiliaria Mi Primer Casa S.A.? → SP campo3 */
  conoceMpc: boolean;
  /** ¿Sabías que con $55.000…? (PIJ) → SP campo4 */
  sabiaPlanInversionJoven: boolean;
  /** Si el usuario activa agendar entrevista en el formulario. */
  agendarEntrevista: boolean;
  horarioEntrevista?: string;
  lugarEntrevista?: LugarEntrevista;
  domicilioEntrevista?: string;
}

export interface NuevoLeadSaveOptions {
  promotorNombre?: string;
  /** Tras crear el lead, registrar contacto y abrir WhatsApp (como el botón verde en la tarjeta). */
  contactar?: boolean;
  /**
   * Referidos opcionales: tras el alta se guardan vía seguimiento
   * (`brindoReferidos` + `referidos`), igual que en el tratamiento del lead.
   */
  referidos?: Referido[];
}

export interface VerificarTelefonoCargaResult {
  disponible: boolean;
  telefono?: string;
  mensaje?: string;
  invalido?: boolean;
  existente?: {
    leadId: string;
    nombreCliente: string;
    cargadoPor: string;
    supervisorNombre?: string;
    fechaAlta?: string | null;
    origen?: string;
  };
}

export interface Promotor {
  id: string;
  nombre: string;
  /** Código SP @usuario (ej. SORTEO01S21P01, mismo que ?codigo= en la landing). */
  codigoCarga?: string;
  idVendedor?: string | number;
  /** Dirección oficinas del supervisor de ese promotor (SP muestra). */
  direccionSucursal?: string;
  /** Opción «yo» en carga manual del supervisor (supervisor como promotor propio). */
  esPropioSupervisor?: boolean;
}

/** RF-26 — métricas de entrevistas por promotor (vista supervisor). */
export interface EfectividadEntrevistasPromotor {
  id: string;
  nombre: string;
  entrevistas: number;
  compro: number;
  noCompro: number;
  sinInteres: number;
  reagenda: number;
  derivarTerreno: number;
  pendiente: number;
  /** Compras / entrevistas realizadas (0–100). */
  tasaCierreEntrevistaPct: number | null;
}

export interface EfectividadEntrevistasEquipo {
  resumen: {
    entrevistas: number;
    compro: number;
    noCompro: number;
    sinInteres: number;
    reagenda: number;
    derivarTerreno: number;
    pendiente: number;
    tasaCierreEntrevistaPct: number | null;
  };
  porPromotor: EfectividadEntrevistasPromotor[];
}

export interface ApiError {
  message: string;
  code?: string;
  detail?: string;
  technicalDetail?: string;
}

export interface SyncPreviewItem {
  idUnico: string;
  leadId: string;
  isCompraAdicional: boolean;
  compraId: string | null;
  nombreCliente: string;
  /** Promotor/vendedor asignado en el CRM. */
  promotorNombre?: string;
  numeroRecibo: string;
  fechaActual: string;
  nuevaFecha: string;
  /** Si true, este registro se puede aplicar con la sincronización (solo fecha). */
  necesitaFecha: boolean;
  /** Si true, adhesión/anexo del CRM difieren de Caja (solo informativo). */
  necesitaRecibo: boolean;
  reciboPropuesto?: string;
  adhesionActual?: string;
  anexoActual?: string;
  adhesionExcel?: string;
  anexoExcel?: string;
  excelRow: {
    fecha: string;
    serie?: string;
    ordenAdh: string;
    ordenAnexo: string;
    nombreCliente: string;
    nombreVendedor?: string;
    concepto?: string;
  };
}

export interface SyncPreviewResponse {
  cambiosPropuestos: SyncPreviewItem[];
  /** Descripción de qué pestañas de Caja se usaron. */
  fuente?: string;
  /** true si el preview filtró ventas de julio mal cargadas contra la pestaña Junio. */
  corregirJulioConJunio?: boolean;
}

export interface SyncCommitResponse {
  actualizados: number;
  tipo?: 'fecha' | 'recibo';
}

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  rolesPermitidos: RolUsuario[];
}

export interface Barrio {
  id: string;
  nombre: string;
}

export interface Referido {
  nombre: string;
  telefono: string;
}

export type ReferidoProcesadoEstado = 'creado' | 'duplicado' | 'error';

export interface ReferidoProcesado {
  nombre: string;
  telefono: string;
  leadId?: string;
  estado: ReferidoProcesadoEstado;
  mensaje?: string;
}

export interface PijIntegralSyncResult {
  skipped?: boolean;
  reason?: string;
  estado?: 'pendiente' | 'bloqueado' | 'fotos_ok' | 'error' | null;
  idVentaIntegral?: number | null;
  error?: string | null;
}

export interface GuardarSeguimientoResult {
  lead: Lead;
  referidosCreados?: ReferidoProcesado[];
  nuevosLeads?: Lead[];
  message?: string;
  pijIntegral?: PijIntegralSyncResult | null;
}

/** Entrada del historial append-only al guardar seguimiento. */
export interface SeguimientoHistorialEntry {
  id: number;
  leadId: string;
  operadorId?: string;
  operadorRol?: RolUsuario;
  operadorNombre: string;
  /** Resumen legible del estado (resultado + pestaña). */
  estadoEtiqueta: string;
  resultadoEntrevista?: ResultadoEntrevista | null;
  pestana?: 'entrevista' | 'contacto' | 'seguimiento' | 'compro';
  seguimientoSnapshot: SeguimientoLead;
  creadoEn: string;
}

export interface CompraAdicional {
  id: string;                    // UUID generado en el frontend o backend
  idProducto: string;
  estadoPago: EstadoPago;
  idBarrio?: string | null;
  numeroRecibo: string;
  fechaCierre: string;           // ISO timestamp
  /** Fallback de fecha si falta fechaCierre (algunos registros legados). */
  creadoEn?: string | null;
  /** Serie PIJ (columna plana en compras_adicionales_json). */
  serie?: string | null;
  nroAdhesion?: string | null;
  nroAnexo?: string | null;
  formaPago?: FormaPago | null;
  montoCierre?: number | null;
  montoEfectivo?: number | null;
  montoTransferencia?: number | null;
}

export interface SeguimientoLead {
  operadorId?: string | number | null;
  fuente?: FuenteLead | null;
  confirmoEntrevista?: boolean | null;
  canal?: CanalContacto | null;
  huboEntrevista?: boolean | null;
  resultadoEntrevista?: ResultadoEntrevista | null;
  /** Si resultado = derivar_terreno y el cliente propuso fecha (supervisor / calendario). */
  horarioEntrevistaPropuesto?: string | null;
  /**
   * Derivación terreno del promotor en curso por el supervisor.
   * Persiste tras reagenda/contacto hasta cierre o cierre negativo.
   */
  derivacionTerrenoActiva?: boolean | null;
  fechaReagenda?: string | null;
  /** Fecha y hora en la que se realizó el cierre (resultadoEntrevista = compro). */
  fechaCierre?: string | null;
  /** Promotor reagendó tras «No compró» para volver a ofrecer PIJ (supervisor solo lectura). */
  seguimientoPijPromotor?: boolean | null;
  /** Quién agendó la entrevista en seguimiento (sin cita previa); el otro rol queda solo lectura. */
  seguimientoAgendaOperadorRol?: RolUsuario | null;
  idProducto?: string | null;
  estadoPago?: EstadoPago | null;
  idBarrio?: string | null;
  numeroRecibo?: string | null;
  /** Serie PIJ (columna plana SQL: serie_pij). */
  seriePij?: string | null;
  /** Número de adhesión PIJ (columna plana SQL: nro_adhesion). */
  nroAdhesion?: string | null;
  /** Número de anexo PIJ (columna plana SQL: nro_anexo). */
  nroAnexo?: string | null;
  /** Medio de cobro PIJ (efectivo / transferencia / mixto). */
  formaPago?: FormaPago | null;
  montoCierre?: number | null;
  montoEfectivo?: number | null;
  montoTransferencia?: number | null;
  brindoReferidos?: boolean | null;
  referidos?: Referido[];
  /** Referidos ya procesados en carga automática (teléfono → lead creado o duplicado). */
  referidosGenerados?: ReferidoProcesado[];
  observaciones?: string;
  /** Rol del operador que registró este estado (última fila SQL). */
  operadorRol?: RolUsuario | null;
  operadorNombre?: string | null;
  /** Timestamp de creación del seguimiento en la base de datos. */
  creadoEn?: string | null;
  /** DNI del cliente al cierre PIJ (columna plana SQL: dni_cliente). */
  dniCliente?: string | null;
  comprasAdicionales?: CompraAdicional[] | null;
  /** Fotos de recibo/comprobante al cierre PIJ (columna plana: imagenes_cierre_json). */
  imagenesCierre?: ImagenCierrePij[] | null;
  /** Id de venta del sistema integral (SOAP altaModificaPlanJoven). */
  idVentaIntegral?: number | null;
  pijIntegralEstado?: 'pendiente' | 'bloqueado' | 'fotos_ok' | 'error' | null;
  pijIntegralError?: string | null;
  pijIntegralEnviadoEn?: string | null;
  /** Verificación del cierre en el sistema de caja de sucursal (columna plana: caja_estado). */
  cajaEstado?: 'pendiente' | 'verificado' | 'rechazado' | null;
  /** Timestamp ISO en que caja confirmó/rechazó (columna plana: caja_verificado_en). */
  cajaVerificadoEn?: string | null;
  /** ID/nro interno de comprobante que devuelve la caja (columna plana: caja_comprobante_id). */
  cajaComprobanteId?: string | null;
  /** Motivo del rechazo si caja no valida el cierre (columna plana: caja_motivo_rechazo). */
  cajaMotivoRechazo?: string | null;
  /** Sucursal que confirmó el cierre, derivada del token de sync (columna plana: caja_sucursal). */
  cajaSucursal?: string | null;
  /** Usuario de caja que confirmó/rechazó la venta (columna plana: caja_confirmado_por). */
  cajaConfirmadoPor?: string | null;
}

export interface Lead {
  id: string;
  /** Valor columna `usuario` del SP (= código promotor en QR, no PK). */
  encuestaUsuario?: string;
  idVendedor?: string | number;
  /** idSupervisor del listado (JOIN en encuestasMuestraOperador, no columna encuesta). */
  idSupervisor?: string | number;
  nombre: string;
  telefono: string;
  promotorId: string;
  promotorNombre?: string;
  supervisorNombre?: string;
  domicilio?: string;
  quiereEntrevista: boolean;
  /** Fecha y hora acordadas en la encuesta (ISO local). */
  horarioEntrevista?: string;
  lugarEntrevista?: LugarEntrevista;
  domicilioEntrevista?: string;
  lista: ListaLead;
  origen?: OrigenLead;
  fechaObtencion: string;
  fechaAlta?: string;
  /** Campaña / sorteo (`encuesta` en SQL: sorteo01, sorteo02, …). */
  codigoCampania?: string;
  /** Valor columna `origen` de encuesta (ej. `2`, Manual, App). */
  origenEncuesta?: string;
  /** Lead referido (tabla lead_referido o columna del SP listado). */
  esReferido?: boolean;
  /** id encuesta del lead que brindó este referido. */
  leadReferidoDeId?: string;
  /** Raíz del árbol de referidos (cliente original). */
  leadReferidoRaizId?: string;
  /** Profundidad en cadena de referidos (1 = directo). */
  nivelReferido?: number;
  /** Rol de quien cargó el referido (visibilidad promotor/supervisor). */
  referidoCargadoPorRol?: RolUsuario;
  cargadoPorRol?: 'supervisor' | 'promotor';
  /** Código @usuario del promotor en el SP (SORTEO01S21P01). */
  codigoPromotorCarga?: string;
  /** Respuesta encuesta «Conoce MPC» (S/N). */
  conoceMpc?: boolean | null;
  /** Respuesta encuesta sobre Plan Inversión Joven / vivienda propia (S/N). */
  sabiaPlanInversionJoven?: boolean | null;
  bloqueadoSupervisor48h?: boolean;
  seguimiento: SeguimientoLead;
}

export interface LinksRedes {
  codigo: string | null;
  vendedor: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
  tiktok: string | null;
  /** Link corto legacy (solo si LINKS_ACORTADOR_ENABLED=true). */
  instagramAcortado?: string | null;
  mensaje?: string | null;
}

export type TipoNotificacionLinkRed = 'link_actualizado' | 'link_requiere_accion';

export interface NotificacionLinkRed {
  id: string;
  codigo: string;
  vendedor: string;
  red: 'instagram';
  redLabel: string;
  tipo: TipoNotificacionLinkRed;
  rolCatalogo?: string | null;
  mensaje: string;
  urlLargo: string;
  urlCorto: string | null;
  urlCortoAnterior?: string | null;
  ultimoError?: string | null;
  verificadoEn?: string | null;
  esActualizado: boolean;
  esAtencionRequerida: boolean;
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: RolUsuario;
  categoria?: string;
  loginId?: string;
  codigoCarga?: string;
  /** Desde operadorAccesoCategoria (SP Pablo): SORTEO01S01P01, etc. */
  codigoPromotor?: string;
  /** Desde operadorAccesoCategoria: SORTEO01S0100, etc. */
  codigoSupervisor?: string;
  idOperador?: string;
  idSupervisor?: string;
  idVendedor?: string;
  rolOrigen?: 'encuestas' | 'categoria' | 'env_superadmin';
  sucursal?: string;
  /** Supervisor con acceso al panel global de superadmin (PANEL_GLOBAL_LOGIN_IDS). */
  panelGlobal?: boolean;
}


export interface PromotorMetricasAdmin {
  promotorId: string;
  promotorNombre: string;
  codigoCarga?: string;
  leadsTotal: number;
  leadsSemana: number;
  entrevistasSemana: number;
  entrevistasHoy: number;
  cierresSemana: number;
  cierresHoy: number;
  /** Terrenos 100% (cien) — cuentan como cierre. */
  ventasTerrenoSemana: number;
  ventasTerrenoHoy: number;
  /** Terrenos en seña — NO cuentan como cierre. */
  ventasTerrenoSenaSemana: number;
  ventasTerrenoSenaHoy: number;
  ventasPijSemana: number;
  ventasPijHoy: number;
  tratadosHoy: number;
  tratadosSemana: number;
  tratadosMes: number;
  /** Ventas PIJ del período (para detalle en informe de operaciones). */
  detallePij?: PijCierreDetalle[];
  /** Terrenos 100% del período. */
  detalleTerreno100?: TerrenoCierreDetalle[];
  /** Terrenos en seña del período. */
  detalleTerrenoSena?: TerrenoCierreDetalle[];
}

export interface SupervisorMetricasAdmin {
  supervisorId: string;
  supervisorNombre: string;
  promotores: PromotorMetricasAdmin[];
  totales: Omit<PromotorMetricasAdmin, 'promotorId' | 'promotorNombre' | 'codigoCarga'>;
}

export interface RankingAdminEntry {
  promotorId: string;
  promotorNombre: string;
  supervisorNombre?: string;
  valor: number;
}

export type AdminChartEventTipo = 'lead' | 'entrevista' | 'cierre' | 'terreno' | 'terreno_sena' | 'pij';

export interface AdminChartEvent {
  fecha: string;
  tipo: AdminChartEventTipo;
  supervisorNombre?: string;
}

export interface AdminConocimientoConteo {
  si: number;
  no: number;
  sinResponder: number;
}

export interface AdminConocimientoLeads {
  total: number;
  conoceMpc: AdminConocimientoConteo;
  sabiaPlanInversionJoven: AdminConocimientoConteo;
}

export interface AdminEmbudoGlobal {
  leads: number;
  conEntrevista: number;
  conCierre: number;
  tasaEntrevistaPct: number | null;
  tasaCierreEntrevistaPct: number | null;
  tasaCierreLeadPct: number | null;
}

export interface AdminEmbudoPromotor {
  promotorId: string;
  promotorNombre: string;
  supervisorNombre: string;
  leads: number;
  entrevistas: number;
  cierres: number;
  tasaEntrevistaPct: number | null;
  tasaCierrePct: number | null;
  tasaCierreEntrevistaPct: number | null;
}

export interface AdminResultadosEntrevista {
  compro: number;
  no_compro: number;
  reagenda: number;
  sin_interes: number;
  derivar_terreno: number;
  pendiente: number;
  sin_tratar: number;
}

export interface AdminCanalMetrica {
  fuente: FuenteLead | 'otros';
  label: string;
  leads: number;
  cierres: number;
  tasaCierrePct: number | null;
}

export interface AdminBacklog {
  sinGestion7: number;
  sinGestion14: number;
  sinGestion30: number;
}

export interface AdminTiempoRespuesta {
  promedioDias: number | null;
  medianaDias: number | null;
  muestras: number;
}

export interface AdminConocimientoCierre {
  segmento: string;
  leads: number;
  cierres: number;
  tasaCierrePct: number | null;
}

export interface AdminPijRecuperacion {
  totalSeguimiento: number;
  conCierre: number;
  tasaRecuperacionPct: number | null;
}

export interface AdminReferidosMetrica {
  cierresConReferidos: number;
  totalReferidos: number;
}

export interface AdminProductividad {
  /** Período del embudo cuando está alineado al informe (hoy | semana | mes | YYYY-MM-DD). */
  periodoEmbudo?: string | null;
  embudoGlobal: AdminEmbudoGlobal;
  embudoPromotores: AdminEmbudoPromotor[];
  resultadosEntrevista: AdminResultadosEntrevista;
  canales: AdminCanalMetrica[];
  backlog: AdminBacklog;
  tiempoPrimeraEntrevista: AdminTiempoRespuesta;
  conocimientoVsCierre: AdminConocimientoCierre[];
  pijRecuperacion: AdminPijRecuperacion;
  referidos: AdminReferidosMetrica;
}

export interface AdminDashboardData {
  generadoEn: string;
  /** Período activo del informe (hoy, semana, mes, YYYY-MM, YYYY-MM-DD). */
  periodo?: string;
  semanaDesde: string;
  semanaHasta: string;
  hoy: string;
  supervisores: SupervisorMetricasAdmin[];
  resumenHoy: {
    entrevistas: number;
    cierres: number;
    ventasTerreno: number;
    ventasPij: number;
  };
  rankings: {
    entrevistasSemana: RankingAdminEntry[];
    cierresSemana: RankingAdminEntry[];
    leadsSemana: RankingAdminEntry[];
    ventasTerrenoSemana: RankingAdminEntry[];
    ventasPijSemana: RankingAdminEntry[];
  };
  eventos?: AdminChartEvent[];
  conocimientoLeads?: AdminConocimientoLeads;
  productividad?: AdminProductividad;
  aviso?: string;
  totalLeads?: number;
  totalSupervisores?: number;
  /** true si los datos crudos vinieron de caché en servidor (cambio de período rápido). */
  cacheHit?: boolean;
  datosCacheadosEn?: string;
  pijCierresPorPersona?: PersonaPijCierres[];
  leadsSinTratar?: LeadSinTratarDetalle[];
  /** Tratados en el período activo sin cierre en ese mismo rango (para recontacto). */
  leadsTratadosSinCierre?: LeadTratadoSinCierreDetalle[];
}

export interface LeadTratadoSinCierreDetalle {
  id: string;
  nombre: string;
  telefono: string;
  promotorId: string;
  promotorNombre: string;
  supervisorNombre: string;
  origen: string;
  fechaAlta: string;
  ultimoContacto: string;
  resultadoEntrevista: string;
  canal: string;
  observaciones: string;
}

export interface LeadSinTratarDetalle {
  id: string;
  nombre: string;
  telefono: string;
  origen: string;
  fechaAlta: string;
  promotorNombre: string;
  supervisorNombre: string;
}


export interface PijCierreDetalle {
  leadId: string;
  leadNombre: string;
  leadTelefono: string;
  numeroAnexo: string;
  fechaCierre: string;
  estadoPago: string | null;
}

export interface TerrenoCierreDetalle {
  leadId: string;
  leadNombre: string;
  leadTelefono: string;
  numeroRecibo: string;
  idBarrio: string | null;
  fechaCierre: string;
  estadoPago: string | null;
}

export interface PersonaPijCierres {
  operadorNombre: string;
  cantidad: number;
  cierres: PijCierreDetalle[];
  /** Total terrenos (100% + seña) */
  cantidadRecibos?: number;
  recibos?: TerrenoCierreDetalle[];
  cantidadRecibos100?: number;
  recibos100?: TerrenoCierreDetalle[];
  cantidadRecibosSena?: number;
  recibosSena?: TerrenoCierreDetalle[];
}

export type TipoGrabacion = 'promocion' | 'entrevista';
export type FranjaGrabacion = 'manana' | 'tarde';
export type SemaforoGrabacion = 'verde' | 'amarillo' | 'rojo';
export type EstadoGrabacion = 'pendiente' | 'activo' | 'rechazado';

export interface GrabacionPromotor {
  id: number;
  promotorId: string;
  promotorNombre: string;
  leadId: string | null;
  leadNombre: string | null;
  tipo: TipoGrabacion;
  franja: FranjaGrabacion;
  fechaGrabacion: string;
  diaKey: string;
  duracionSeg: number;
  mimeType: string;
  tamanoBytes: number;
  estado: EstadoGrabacion;
  rechazadoPor: string | null;
  rechazadoEn: string | null;
  motivoRechazo: string | null;
  creadoEn: string;
  /** false = el archivo no está en disco (registro huérfano en SQLite). */
  archivoDisponible?: boolean;
}

export interface ResumenGrabacionesDia {
  manana: number;
  tarde: number;
  total: number;
  metaManana: number;
  metaTarde: number;
  metaTotal: number;
  semaforoManana: SemaforoGrabacion;
  semaforoTarde: SemaforoGrabacion;
  semaforoTotal: SemaforoGrabacion;
  cumple: boolean;
}

export interface ResumenTopeGrabacionesMes {
  mesKey: string;
  usados: number;
  maximo: number;
  restantes: number;
}

export interface GrabacionesConfigResponse {
  moduloActivo: boolean;
  habilitado: boolean;
  puedeAuditar: boolean;
  cuotaDiaria: number;
  cuotaFranja: number;
  maxAudiosMes: number;
  minDuracionSeg: number;
  formatos: string[];
  maxMb: number;
  resumenHoy: ResumenGrabacionesDia | null;
  resumenTopeMes: ResumenTopeGrabacionesMes | null;
}

export interface GrabacionesMiasResponse {
  diaKey: string;
  resumen: ResumenGrabacionesDia;
  resumenTopeMes: ResumenTopeGrabacionesMes;
  grabaciones: GrabacionPromotor[];
}

export interface FilaCumplimientoGrabaciones extends ResumenGrabacionesDia {
  promotorId: string;
  promotorNombre: string;
  grabaciones: GrabacionPromotor[];
}

export interface GrabacionesCumplimientoResponse {
  diaKey: string;
  filas: FilaCumplimientoGrabaciones[];
  promotoresConfig: Array<{ id: string; nombre: string }>;
}
