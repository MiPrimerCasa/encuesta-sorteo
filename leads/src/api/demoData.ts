import { origenIngresoToFuente, origenIngresoToOrigenLead } from '../domain/fuenteLabels';
import { applySeguimientoAlLead } from '../domain/leads';
import type {
  Barrio,
  Lead,
  LinksRedes,
  NuevoLeadData,
  Producto,
  Promotor,
  SeguimientoHistorialEntry,
  SeguimientoLead,
  UsuarioSesion,
} from '../types';
import { etiquetaEstadoHistorial } from '../domain/seguimiento-historial';
import { tabIdListaLead } from '../domain/leads';
import linksCatalog from '../data/links-redes.json';

// ─── Usuario demo ────────────────────────────────────────────────────────────

export const DEMO_USUARIO: UsuarioSesion = {
  id: 'demo-sup',
  nombre: 'Demo Supervisor',
  rol: 'supervisor',
  idOperador: 'demo-sup',
  codigoCarga: 'SORTEO01S21P01',
};

export const DEMO_USUARIO_PROMOTOR: UsuarioSesion = {
  id: 'prom-1',
  nombre: 'Martín González',
  rol: 'promotor',
  idVendedor: 'prom-1',
  idOperador: 'prom-1',
  codigoCarga: 'SORTEO01S21P01',
};

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export const DEMO_PROMOTORES: Promotor[] = [
  { id: 'prom-1', nombre: 'Martín González', codigoCarga: 'SORTEO01S21P01' },
  { id: 'prom-2', nombre: 'Ana Rodríguez', codigoCarga: 'SORTEO01S21P02' },
  { id: 'prom-3', nombre: 'Carlos López', codigoCarga: 'SORTEO01S21P03' },
  { id: 'prom-4', nombre: 'Laura Fernández', codigoCarga: 'SORTEO01S21P04' },
];

/** Combo carga manual: supervisor primero (como promotor propio), luego el equipo. */
type LinksCatalogJson = {
  byCodigo: Record<
    string,
    { vendedor: string; codigo: string; instagram: string; facebook: string }
  >;
};

/** Links de redes del promotor/supervisor demo (mismo catálogo que producción). */
export function getDemoLinksRedes(usuario: UsuarioSesion): LinksRedes {
  const catalog = linksCatalog as LinksCatalogJson & {
    byNombre?: Record<string, { codigo: string; vendedor?: string }>;
  };

  let codigo = String(usuario.codigoCarga ?? '').trim().toUpperCase();
  if (!codigo && usuario.nombre && catalog.byNombre) {
    const norm = usuario.nombre.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    codigo = catalog.byNombre[norm]?.codigo ?? '';
  }
  if (!codigo) codigo = 'SORTEO01S21P01';

  const entry = catalog.byCodigo[codigo];
  if (!entry) {
    return {
      codigo,
      vendedor: usuario.nombre,
      instagram: null,
      facebook: null,
      mensaje: `No hay links de demo para el código ${codigo}.`,
    };
  }
  return {
    codigo: entry.codigo,
    vendedor: entry.vendedor ?? usuario.nombre,
    instagram: entry.instagram,
    facebook: entry.facebook,
    mensaje: null,
  };
}

export function getDemoPromotoresParaSupervisor(supervisor: UsuarioSesion): Promotor[] {
  const id = String(supervisor.idOperador ?? supervisor.id ?? 'demo-sup');
  return [
    {
      id,
      nombre: supervisor.nombre,
      codigoCarga: supervisor.codigoCarga ?? 'SORTEO01S21P01',
      esPropioSupervisor: true,
    },
    ...DEMO_PROMOTORES,
  ];
}

export const DEMO_PRODUCTOS: Producto[] = [
  {
    id: 'prod-pij',
    codigo: 'PLAN_INVERSION_JOVEN',
    nombre: 'Plan Inversión Joven',
    rolesPermitidos: ['promotor', 'supervisor'],
  },
  {
    id: 'prod-terreno',
    codigo: 'TERRENO',
    nombre: 'Terreno',
    rolesPermitidos: ['supervisor'],
  },
];

export const DEMO_BARRIOS: Barrio[] = [
  { id: 'b1', nombre: 'Barrio Los Tilos' },
  { id: 'b2', nombre: 'Barrio El Mirador' },
  { id: 'b3', nombre: 'Barrio San Martín' },
  { id: 'b4', nombre: 'Barrio La Esperanza' },
  { id: 'b5', nombre: 'Barrio Norte' },
];

// ─── Leads ────────────────────────────────────────────────────────────────────

const BASE_LEADS: Lead[] = [
  // ── Mayo 2026 — entrevista ─────────────────────────────────────────────────

  {
    id: 'lead-01',
    nombre: 'Sofía Álvarez',
    telefono: '3512 345678',
    promotorId: 'prom-1',
    promotorNombre: 'Martín González',
    supervisorNombre: 'Demo Supervisor',
    domicilio: 'Av. Colón 1234, Córdoba',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'redes',
    fechaObtencion: '2026-05-20',
    fechaAlta: '2026-05-28T15:30:00',
    horarioEntrevista: '2026-05-28T15:30:00',
    lugarEntrevista: 'sucursal',
    seguimiento: { fuente: 'instagram' },
  },
  {
    id: 'lead-02',
    nombre: 'Diego Herrera',
    telefono: '3516 789012',
    promotorId: 'prom-1',
    promotorNombre: 'Martín González',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'redes',
    fechaObtencion: '2026-05-21',
    seguimiento: { fuente: 'facebook', canal: 'llamada', huboEntrevista: false },
  },
  {
    id: 'lead-03',
    nombre: 'Valentina Torres',
    telefono: '3513 456789',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    supervisorNombre: 'Demo Supervisor',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'sorteo',
    fechaObtencion: '2026-05-19',
    seguimiento: { fuente: 'qr', canal: 'mensaje', huboEntrevista: false },
  },
  {
    id: 'lead-04',
    nombre: 'Facundo Morales',
    telefono: '3515 321654',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'redes',
    fechaObtencion: '2026-05-18',
    seguimiento: {
      fuente: 'instagram',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'reagenda',
      fechaReagenda: '2026-05-30T10:00',
      seguimientoPijPromotor: true,
    },
  },
  {
    id: 'lead-05',
    nombre: 'Luciana Ramírez',
    telefono: '3511 654321',
    promotorId: 'prom-3',
    promotorNombre: 'Carlos López',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'manual',
    fechaObtencion: '2026-05-17',
    seguimiento: {
      fuente: 'app',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'sin_interes',
      observaciones: 'No tiene interés por el momento.',
    },
  },
  {
    id: 'lead-06',
    nombre: 'Matías Sosa',
    telefono: '3514 987654',
    promotorId: 'prom-3',
    promotorNombre: 'Carlos López',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'redes',
    fechaObtencion: '2026-05-16',
    seguimiento: {
      fuente: 'facebook',
      canal: 'mensaje',
      huboEntrevista: true,
      resultadoEntrevista: 'no_compro',
      observaciones: 'Necesita consultar con la familia.',
    },
  },
  {
    id: 'lead-07',
    nombre: 'Camila Vega',
    telefono: '3518 112233',
    promotorId: 'prom-1',
    promotorNombre: 'Martín González',
    supervisorNombre: 'Demo Supervisor',
    domicilio: 'Bv. San Juan 456',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'redes',
    fechaObtencion: '2026-05-15',
    seguimiento: {
      fuente: 'instagram',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-pij',
      estadoPago: 'sena',
      brindoReferidos: false,
    },
  },
  {
    id: 'lead-08',
    nombre: 'Gonzalo Benítez',
    telefono: '3519 445566',
    promotorId: 'prom-4',
    promotorNombre: 'Laura Fernández',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'sorteo',
    fechaObtencion: '2026-05-14',
    seguimiento: {
      fuente: 'qr',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-pij',
      estadoPago: 'entrega_33',
      numeroRecibo: '001234',
      brindoReferidos: true,
      referidos: [
        { nombre: 'Jorge Benítez', telefono: '3512 778899' },
        { nombre: 'Silvina Paz', telefono: '3516 334455' },
      ],
    },
  },
  {
    id: 'lead-09',
    nombre: 'Romina Castillo',
    telefono: '3517 223344',
    promotorId: 'prom-4',
    promotorNombre: 'Laura Fernández',
    supervisorNombre: 'Demo Supervisor',
    domicilio: 'Calle Chacabuco 789',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'redes',
    fechaObtencion: '2026-05-13',
    seguimiento: {
      fuente: 'facebook',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-terreno',
      estadoPago: 'sena',
      idBarrio: 'b2',
      numeroRecibo: '005678',
      brindoReferidos: false,
    },
  },
  {
    id: 'lead-10',
    nombre: 'Agustín Pereyra',
    telefono: '3513 556677',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    quiereEntrevista: true,
    lista: 'entrevista',
    origen: 'sorteo',
    fechaObtencion: '2026-05-12',
    seguimiento: {
      fuente: 'app',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-terreno',
      estadoPago: 'cien',
      idBarrio: 'b1',
      numeroRecibo: '009012',
      brindoReferidos: true,
      referidos: [{ nombre: 'Daniela Suárez', telefono: '3511 001122' }],
      observaciones: 'Cliente muy satisfecho.',
    },
  },

  // ── Mayo 2026 — contacto ───────────────────────────────────────────────────

  {
    id: 'lead-11',
    nombre: 'Natalia Gutiérrez',
    telefono: '3511 667788',
    promotorId: 'prom-3',
    promotorNombre: 'Carlos López',
    quiereEntrevista: false,
    lista: 'contacto',
    origen: 'redes',
    fechaObtencion: '2026-05-22',
    seguimiento: { fuente: 'instagram' },
  },
  {
    id: 'lead-12',
    nombre: 'Nicolás Flores',
    telefono: '3514 889900',
    promotorId: 'prom-1',
    promotorNombre: 'Martín González',
    supervisorNombre: 'Demo Supervisor',
    domicilio: 'Av. Hipólito Yrigoyen 2200',
    quiereEntrevista: false,
    lista: 'contacto',
    origen: 'redes',
    fechaObtencion: '2026-05-21',
    seguimiento: { fuente: 'facebook', canal: 'mensaje', huboEntrevista: false },
  },
  {
    id: 'lead-13',
    nombre: 'Julieta Ríos',
    telefono: '3516 001122',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    quiereEntrevista: false,
    lista: 'contacto',
    origen: 'manual',
    fechaObtencion: '2026-05-20',
    seguimiento: {
      fuente: 'qr',
      canal: 'llamada',
      huboEntrevista: false,
      resultadoEntrevista: 'reagenda',
      fechaReagenda: '2026-06-02T15:30',
    },
  },
  {
    id: 'lead-14',
    nombre: 'Hernán Vargas',
    telefono: '3512 334455',
    promotorId: 'prom-4',
    promotorNombre: 'Laura Fernández',
    quiereEntrevista: false,
    lista: 'contacto',
    origen: 'sorteo',
    fechaObtencion: '2026-05-19',
    seguimiento: {
      fuente: 'app',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'sin_interes',
    },
  },
  {
    id: 'lead-15',
    nombre: 'Micaela Domínguez',
    telefono: '3519 556677',
    promotorId: 'prom-3',
    promotorNombre: 'Carlos López',
    quiereEntrevista: false,
    lista: 'contacto',
    origen: 'redes',
    fechaObtencion: '2026-05-18',
    seguimiento: {
      fuente: 'instagram',
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-pij',
      estadoPago: 'entrega_55',
      numeroRecibo: '007890',
      brindoReferidos: true,
      referidos: [
        { nombre: 'Pablo Domínguez', telefono: '3513 112244' },
        { nombre: 'Carla Medina', telefono: '3517 556688' },
      ],
    },
  },
  {
    id: 'lead-16',
    nombre: 'Federico Ruiz',
    telefono: '3515 778899',
    promotorId: 'prom-1',
    promotorNombre: 'Martín González',
    domicilio: 'Calle Corrientes 321',
    quiereEntrevista: false,
    lista: 'contacto',
    origen: 'redes',
    fechaObtencion: '2026-05-17',
    seguimiento: {
      fuente: 'facebook',
      canal: 'mensaje',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-terreno',
      estadoPago: 'sena',
      idBarrio: 'b4',
      numeroRecibo: '003456',
      brindoReferidos: false,
    },
  },
  {
    id: 'lead-17',
    nombre: 'Verónica Cabrera',
    telefono: '3518 990011',
    promotorId: 'prom-4',
    promotorNombre: 'Laura Fernández',
    supervisorNombre: 'Demo Supervisor',
    quiereEntrevista: false,
    lista: 'contacto',
    fechaObtencion: '2026-05-16',
    seguimiento: {
      canal: 'llamada',
      huboEntrevista: false,
      resultadoEntrevista: 'reagenda',
      fechaReagenda: '2026-05-28T11:00',
    },
  },
  {
    id: 'lead-18',
    nombre: 'Sebastián Molina',
    telefono: '3511 223344',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    quiereEntrevista: false,
    lista: 'contacto',
    fechaObtencion: '2026-05-15',
    seguimiento: {
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'no_compro',
      observaciones: 'Tiene dudas sobre la financiación.',
    },
  },

  // ── Abril 2026 ────────────────────────────────────────────────────────────

  { id: 'lead-19', nombre: 'Camilo Ríos',      telefono: '3512 100001', promotorId: 'prom-1', promotorNombre: 'Martín González', quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-04-28', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-pij', estadoPago: 'sena', brindoReferidos: false } },
  { id: 'lead-20', nombre: 'Pilar Estrada',    telefono: '3516 100002', promotorId: 'prom-2', promotorNombre: 'Ana Rodríguez',   quiereEntrevista: true,  lista: 'entrevista', origen: 'sorteo',  fechaObtencion: '2026-04-25', seguimiento: { fuente: 'qr',        canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'no_compro' } },
  { id: 'lead-21', nombre: 'Tomás Aguirre',    telefono: '3513 100003', promotorId: 'prom-3', promotorNombre: 'Carlos López',    quiereEntrevista: false, lista: 'contacto',   origen: 'redes',   fechaObtencion: '2026-04-22', seguimiento: { fuente: 'facebook',  canal: 'mensaje', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-pij', estadoPago: 'entrega_33', numeroRecibo: '010101', brindoReferidos: false } },
  { id: 'lead-22', nombre: 'Carla Medina',     telefono: '3515 100004', promotorId: 'prom-4', promotorNombre: 'Laura Fernández', quiereEntrevista: true,  lista: 'entrevista', origen: 'manual',  fechaObtencion: '2026-04-20', seguimiento: { fuente: 'app',       canal: 'llamada', huboEntrevista: false } },
  { id: 'lead-23', nombre: 'Rodrigo Peña',     telefono: '3511 100005', promotorId: 'prom-1', promotorNombre: 'Martín González', quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-04-18', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'reagenda', fechaReagenda: '2026-05-05T09:00' } },
  { id: 'lead-24', nombre: 'Florencia Mena',   telefono: '3514 100006', promotorId: 'prom-2', promotorNombre: 'Ana Rodríguez',   quiereEntrevista: false, lista: 'contacto',   origen: 'redes',   fechaObtencion: '2026-04-15', seguimiento: { fuente: 'facebook',  canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-terreno', estadoPago: 'sena', idBarrio: 'b3', numeroRecibo: '010202', brindoReferidos: false } },
  { id: 'lead-25', nombre: 'Emanuel Quiroga',  telefono: '3518 100007', promotorId: 'prom-3', promotorNombre: 'Carlos López',    quiereEntrevista: true,  lista: 'entrevista', origen: 'sorteo',  fechaObtencion: '2026-04-12', seguimiento: { fuente: 'qr',        canal: 'mensaje', huboEntrevista: false } },
  { id: 'lead-26', nombre: 'Lucía Ferreyra',   telefono: '3519 100008', promotorId: 'prom-4', promotorNombre: 'Laura Fernández', quiereEntrevista: false, lista: 'contacto',   origen: 'redes',   fechaObtencion: '2026-04-10', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'sin_interes' } },

  // ── Marzo 2026 ────────────────────────────────────────────────────────────

  { id: 'lead-27', nombre: 'Bruno Álvarez',    telefono: '3512 200001', promotorId: 'prom-1', promotorNombre: 'Martín González', quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-03-28', seguimiento: { fuente: 'facebook',  canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-pij', estadoPago: 'entrega_33', numeroRecibo: '020101', brindoReferidos: true, referidos: [{ nombre: 'Luz Álvarez', telefono: '3511 200099' }] } },
  { id: 'lead-28', nombre: 'Mariana Soto',     telefono: '3516 200002', promotorId: 'prom-2', promotorNombre: 'Ana Rodríguez',   quiereEntrevista: true,  lista: 'entrevista', origen: 'sorteo',  fechaObtencion: '2026-03-25', seguimiento: { fuente: 'qr',        canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'no_compro' } },
  { id: 'lead-29', nombre: 'Ignacio Bustos',   telefono: '3513 200003', promotorId: 'prom-3', promotorNombre: 'Carlos López',    quiereEntrevista: false, lista: 'contacto',   origen: 'redes',   fechaObtencion: '2026-03-22', seguimiento: { fuente: 'instagram', canal: 'mensaje', huboEntrevista: false } },
  { id: 'lead-30', nombre: 'Daniela Suárez',   telefono: '3515 200004', promotorId: 'prom-4', promotorNombre: 'Laura Fernández', quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-03-20', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-pij', estadoPago: 'sena', brindoReferidos: false } },
  { id: 'lead-31', nombre: 'Ramiro Cáceres',   telefono: '3511 200005', promotorId: 'prom-1', promotorNombre: 'Martín González', quiereEntrevista: false, lista: 'contacto',   origen: 'manual',  fechaObtencion: '2026-03-18', seguimiento: { fuente: 'app',       canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'sin_interes' } },
  { id: 'lead-32', nombre: 'Belén Romero',     telefono: '3514 200006', promotorId: 'prom-2', promotorNombre: 'Ana Rodríguez',   quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-03-15', seguimiento: { fuente: 'facebook',  canal: 'mensaje', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-terreno', estadoPago: 'cien', idBarrio: 'b4', numeroRecibo: '020303', brindoReferidos: false } },
  { id: 'lead-33', nombre: 'Julián Villalba',  telefono: '3518 200007', promotorId: 'prom-3', promotorNombre: 'Carlos López',    quiereEntrevista: false, lista: 'contacto',   origen: 'sorteo',  fechaObtencion: '2026-03-12', seguimiento: { fuente: 'qr',        canal: 'llamada', huboEntrevista: false } },
  { id: 'lead-34', nombre: 'Sabrina Ponce',    telefono: '3519 200008', promotorId: 'prom-4', promotorNombre: 'Laura Fernández', quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-03-08', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-pij', estadoPago: 'entrega_55', numeroRecibo: '020404', brindoReferidos: true, referidos: [{ nombre: 'Marcos Ponce', telefono: '3512 200077' }] } },

  // ── Febrero 2026 ──────────────────────────────────────────────────────────

  { id: 'lead-35', nombre: 'Martina Greco',    telefono: '3512 300001', promotorId: 'prom-1', promotorNombre: 'Martín González', quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-02-24', seguimiento: { fuente: 'facebook',  canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'no_compro' } },
  { id: 'lead-36', nombre: 'Nicolás Parra',    telefono: '3516 300002', promotorId: 'prom-2', promotorNombre: 'Ana Rodríguez',   quiereEntrevista: false, lista: 'contacto',   origen: 'sorteo',  fechaObtencion: '2026-02-20', seguimiento: { fuente: 'qr',        canal: 'mensaje', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-pij', estadoPago: 'sena', brindoReferidos: false } },
  { id: 'lead-37', nombre: 'Valeria Ojeda',    telefono: '3513 300003', promotorId: 'prom-3', promotorNombre: 'Carlos López',    quiereEntrevista: true,  lista: 'entrevista', origen: 'redes',   fechaObtencion: '2026-02-18', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: false } },
  { id: 'lead-38', nombre: 'Gabriel Flores',   telefono: '3515 300004', promotorId: 'prom-4', promotorNombre: 'Laura Fernández', quiereEntrevista: false, lista: 'contacto',   origen: 'redes',   fechaObtencion: '2026-02-15', seguimiento: { fuente: 'instagram', canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'compro', idProducto: 'prod-terreno', estadoPago: 'sena', idBarrio: 'b1', numeroRecibo: '030101', brindoReferidos: false } },
  { id: 'lead-39', nombre: 'Mónica Leiva',     telefono: '3511 300005', promotorId: 'prom-2', promotorNombre: 'Ana Rodríguez',   quiereEntrevista: true,  lista: 'entrevista', origen: 'manual',  fechaObtencion: '2026-02-12', seguimiento: { fuente: 'app',       canal: 'llamada', huboEntrevista: true, resultadoEntrevista: 'sin_interes' } },
  { id: 'lead-40', nombre: 'Esteban Noriega',  telefono: '3514 300006', promotorId: 'prom-1', promotorNombre: 'Martín González', quiereEntrevista: false, lista: 'contacto',   origen: 'redes',   fechaObtencion: '2026-02-08', seguimiento: { fuente: 'facebook',  canal: 'mensaje', huboEntrevista: false } },
];

// Copia mutable para que guardarSeguimiento actualice en memoria durante la sesión demo
let demoLeads: Lead[] = BASE_LEADS.map((l) => ({ ...l }));
const demoHistorialPorLead = new Map<string, SeguimientoHistorialEntry[]>();
let demoHistorialSeq = 1;

export function getDemoHistorialSeguimiento(leadId: string): SeguimientoHistorialEntry[] {
  return [...(demoHistorialPorLead.get(leadId) ?? [])].sort((a, b) =>
    b.creadoEn.localeCompare(a.creadoEn),
  );
}

export function appendDemoHistorialSeguimiento(
  lead: Lead,
  seguimiento: SeguimientoLead,
  usuario: UsuarioSesion,
) {
  const merged = { ...lead.seguimiento, ...seguimiento };
  const prev = lead.seguimiento;
  if (JSON.stringify(prev) === JSON.stringify(merged)) return;

  const entry: SeguimientoHistorialEntry = {
    id: demoHistorialSeq++,
    leadId: lead.id,
    operadorId: usuario.id,
    operadorRol: usuario.rol,
    operadorNombre: usuario.nombre,
    estadoEtiqueta: etiquetaEstadoHistorial(merged, lead),
    resultadoEntrevista: merged.resultadoEntrevista ?? undefined,
    pestana: tabIdListaLead({ ...lead, seguimiento: merged }),
    seguimientoSnapshot: merged,
    creadoEn: new Date().toISOString(),
  };

  const lista = demoHistorialPorLead.get(lead.id) ?? [];
  demoHistorialPorLead.set(lead.id, [entry, ...lista]);
}

export function getDemoLeads(): Lead[] {
  return demoLeads.map((l) => ({ ...l }));
}

export function updateDemoLead(
  leadId: string,
  seguimiento: SeguimientoLead,
  usuario?: UsuarioSesion,
): Lead {
  const lead = demoLeads.find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead no encontrado en demo');
  if (usuario) appendDemoHistorialSeguimiento(lead, seguimiento, usuario);
  const updated = applySeguimientoAlLead(lead, seguimiento);
  demoLeads = demoLeads.map((l) => (l.id === leadId ? updated : l));
  return { ...updated };
}

export function updateDemoLeadTelefono(leadId: string, telefono: string): Lead {
  const lead = demoLeads.find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead no encontrado en demo');
  if (lead.seguimiento?.fuente !== 'app') {
    throw new Error('Solo podés modificar el teléfono de leads cargados manualmente desde la app.');
  }
  const updated = { ...lead, telefono: telefono.trim() };
  demoLeads = demoLeads.map((l) => (l.id === leadId ? updated : l));
  return { ...updated };
}

export function createDemoLead(data: NuevoLeadData): Lead {
  const now = new Date();
  const promotorNombre =
    data.promotorNombre?.trim() ||
    getDemoPromotoresParaSupervisor(DEMO_USUARIO).find((p) => p.id === data.promotorId)?.nombre ||
    DEMO_PROMOTORES.find((p) => p.id === data.promotorId)?.nombre;
  const fuente = origenIngresoToFuente(data.origen);
  const newLead: Lead = {
    id: `lead-${Date.now()}`,
    nombre: data.nombre.trim(),
    telefono: data.telefono.trim(),
    promotorId: data.promotorId,
    promotorNombre,
    domicilio: data.domicilio?.trim() || undefined,
    quiereEntrevista: data.quiereEntrevista,
    lista: data.lista,
    origen: origenIngresoToOrigenLead(data.origen),
    horarioEntrevista: data.horarioEntrevista,
    lugarEntrevista: data.lugarEntrevista,
    domicilioEntrevista: data.domicilioEntrevista?.trim() || undefined,
    fechaObtencion: now.toISOString().slice(0, 10),
    fechaAlta: now.toISOString(),
    seguimiento: {
      fuente,
      observaciones: data.observaciones?.trim() || undefined,
    },
  };
  demoLeads = [...demoLeads, newLead];
  return { ...newLead };
}
