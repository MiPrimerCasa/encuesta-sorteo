export type RolUsuario = 'promotor' | 'supervisor';
export type ListaLead = 'entrevista' | 'contacto';
export type CanalContacto = 'llamada' | 'mensaje';
export type ResultadoEntrevista = 'sin_interes' | 'reagenda' | 'no_compro' | 'compro';
/** sena/cien = terreno; entrega_33/entrega_55 = plan inversión (33k equivale al cierre del plan) */
export type EstadoPago = 'sena' | 'cien' | 'entrega_33' | 'entrega_55';

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
  /** Nombre del promotor (encuestas) */
  promotorNombre?: string;
  /** Supervisor asignado en encuesta */
  supervisorNombre?: string;
  domicilio?: string;
  quiereEntrevista: boolean;
  lista: ListaLead;
  fechaObtencion: string;
  fechaAlta?: string;
  seguimiento: SeguimientoLead;
}

export interface UsuarioSesion {
  /** idVendedor del SP → parámetro @idVendedor de encuestasMuestraOperador */
  id: string;
  nombre: string;
  rol: RolUsuario;
  categoria?: string;
  loginId?: string;
  idOperador?: string;
  idSupervisor?: string;
  idVendedor?: string;
  /** Cómo se calculó el rol: encuestas (idOperador vs idVendedor) o categoria (respaldo) */
  rolOrigen?: 'encuestas' | 'categoria';
}
