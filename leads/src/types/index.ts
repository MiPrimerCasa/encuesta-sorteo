export type RolUsuario = 'promotor' | 'supervisor';
export type VistaActiva = 'leads' | 'promotores' | 'metricas' | 'calendario';
export type ListaLead = 'entrevista' | 'contacto';
/** Dónde quiere la entrevista el cliente (encuesta / SP). */
export type LugarEntrevista = 'sucursal' | 'domicilio';
export type OrigenLead = 'encuesta' | 'sorteo' | 'manual' | 'redes';
export type FuenteLead = 'qr' | 'app' | 'facebook' | 'instagram';
export type CanalContacto = 'llamada' | 'mensaje';
export type ResultadoEntrevista =
  | 'sin_interes'
  | 'reagenda'
  | 'no_compro'
  | 'compro'
  | 'derivar_terreno';
/** sena/cien = terreno; entrega_33/entrega_55 = plan inversión */
export type EstadoPago = 'sena' | 'cien' | 'entrega_33' | 'entrega_55';

/** Canal de ingreso en carga manual (alineado a métricas de origen + casos habituales). */
export type OrigenIngresoManual =
  | 'qr'
  | 'sorteo'
  | 'facebook'
  | 'instagram'
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
  /** Si el usuario activa agendar entrevista en el formulario. */
  agendarEntrevista: boolean;
  horarioEntrevista?: string;
  lugarEntrevista?: LugarEntrevista;
  domicilioEntrevista?: string;
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

export interface SeguimientoLead {
  fuente?: FuenteLead | null;
  confirmoEntrevista?: boolean | null;
  canal?: CanalContacto | null;
  huboEntrevista?: boolean | null;
  resultadoEntrevista?: ResultadoEntrevista | null;
  /** Si resultado = derivar_terreno y el cliente propuso fecha (supervisor / calendario). */
  horarioEntrevistaPropuesto?: string | null;
  fechaReagenda?: string | null;
  /** Promotor reagendó tras «No compró» para volver a ofrecer PIJ (supervisor solo lectura). */
  seguimientoPijPromotor?: boolean | null;
  idProducto?: string | null;
  estadoPago?: EstadoPago | null;
  idBarrio?: string | null;
  numeroRecibo?: string | null;
  brindoReferidos?: boolean | null;
  referidos?: Referido[];
  observaciones?: string;
  /** Rol del operador que registró este estado (última fila SQL). */
  operadorRol?: RolUsuario | null;
  operadorNombre?: string | null;
}

export interface Lead {
  id: string;
  /** Valor columna `usuario` del SP (= código promotor en QR, no PK). */
  encuestaUsuario?: string;
  idVendedor?: string | number;
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
  /** Código @usuario del promotor en el SP (SORTEO01S21P01). */
  codigoPromotorCarga?: string;
  seguimiento: SeguimientoLead;
}

export interface LinksRedes {
  codigo: string | null;
  vendedor: string | null;
  instagram: string | null;
  facebook: string | null;
  mensaje?: string | null;
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: RolUsuario;
  categoria?: string;
  loginId?: string;
  codigoCarga?: string;
  idOperador?: string;
  idSupervisor?: string;
  idVendedor?: string;
  rolOrigen?: 'encuestas' | 'categoria';
}
