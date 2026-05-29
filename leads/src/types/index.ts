export type RolUsuario = 'promotor' | 'supervisor';
export type VistaActiva = 'leads' | 'promotores' | 'metricas' | 'calendario';
export type ListaLead = 'entrevista' | 'contacto';
/** Dónde quiere la entrevista el cliente (encuesta / SP). */
export type LugarEntrevista = 'sucursal' | 'domicilio';
export type OrigenLead = 'encuesta' | 'sorteo' | 'manual' | 'redes';
export type FuenteLead = 'qr' | 'app' | 'facebook' | 'instagram';
export type CanalContacto = 'llamada' | 'mensaje';
export type ResultadoEntrevista = 'sin_interes' | 'reagenda' | 'no_compro' | 'compro';
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

export interface SeguimientoLead {
  fuente?: FuenteLead | null;
  confirmoEntrevista?: boolean | null;
  canal?: CanalContacto | null;
  huboEntrevista?: boolean | null;
  resultadoEntrevista?: ResultadoEntrevista | null;
  fechaReagenda?: string | null;
  idProducto?: string | null;
  estadoPago?: EstadoPago | null;
  idBarrio?: string | null;
  numeroRecibo?: string | null;
  brindoReferidos?: boolean | null;
  referidos?: Referido[];
  observaciones?: string;
}

export interface Lead {
  id: string;
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
  seguimiento: SeguimientoLead;
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: RolUsuario;
  categoria?: string;
  loginId?: string;
  idOperador?: string;
  idSupervisor?: string;
  idVendedor?: string;
  rolOrigen?: 'encuestas' | 'categoria';
}
