import type { Barrio, Lead, NuevoLeadData, Producto, Promotor, SeguimientoLead, UsuarioSesion } from '../types';

// ─── Usuario demo ────────────────────────────────────────────────────────────

export const DEMO_USUARIO: UsuarioSesion = {
  id: 'demo-sup',
  nombre: 'Demo Supervisor',
  rol: 'supervisor',
};

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export const DEMO_PROMOTORES: Promotor[] = [
  { id: 'prom-1', nombre: 'Martín González' },
  { id: 'prom-2', nombre: 'Ana Rodríguez' },
  { id: 'prom-3', nombre: 'Carlos López' },
  { id: 'prom-4', nombre: 'Laura Fernández' },
];

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
  // ── Lista: entrevista ──────────────────────────────────────────────────────

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
    fechaObtencion: '2026-05-20',
    fechaAlta: '2026-05-28T15:30:00',
    horarioEntrevista: '2026-05-28T15:30:00',
    lugarEntrevista: 'sucursal',
    seguimiento: {},
  },
  {
    id: 'lead-02',
    nombre: 'Diego Herrera',
    telefono: '3516 789012',
    promotorId: 'prom-1',
    promotorNombre: 'Martín González',
    quiereEntrevista: true,
    lista: 'entrevista',
    fechaObtencion: '2026-05-21',
    seguimiento: {
      canal: 'llamada',
      huboEntrevista: false,
    },
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
    fechaObtencion: '2026-05-19',
    seguimiento: {
      canal: 'mensaje',
      huboEntrevista: false,
    },
  },
  {
    id: 'lead-04',
    nombre: 'Facundo Morales',
    telefono: '3515 321654',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    quiereEntrevista: true,
    lista: 'entrevista',
    fechaObtencion: '2026-05-18',
    seguimiento: {
      canal: 'llamada',
      huboEntrevista: false,
      resultadoEntrevista: 'reagenda',
      fechaReagenda: '2026-05-30T10:00',
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
    fechaObtencion: '2026-05-17',
    seguimiento: {
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'sin_interes',
      observaciones: 'No tiene interés por el momento, puede cambiar de opinión en unos meses.',
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
    fechaObtencion: '2026-05-16',
    seguimiento: {
      canal: 'mensaje',
      huboEntrevista: true,
      resultadoEntrevista: 'no_compro',
      observaciones: 'Interesado pero necesita consultar con la familia.',
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
    fechaObtencion: '2026-05-15',
    seguimiento: {
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
    fechaObtencion: '2026-05-14',
    seguimiento: {
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
    fechaObtencion: '2026-05-13',
    seguimiento: {
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
    fechaObtencion: '2026-05-12',
    seguimiento: {
      canal: 'llamada',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-terreno',
      estadoPago: 'cien',
      idBarrio: 'b1',
      numeroRecibo: '009012',
      brindoReferidos: true,
      referidos: [{ nombre: 'Daniela Suárez', telefono: '3511 001122' }],
      observaciones: 'Cliente muy satisfecho. Muy buena predisposición.',
    },
  },

  // ── Lista: contacto ───────────────────────────────────────────────────────

  {
    id: 'lead-11',
    nombre: 'Natalia Gutiérrez',
    telefono: '3511 667788',
    promotorId: 'prom-3',
    promotorNombre: 'Carlos López',
    quiereEntrevista: false,
    lista: 'contacto',
    fechaObtencion: '2026-05-22',
    seguimiento: {},
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
    fechaObtencion: '2026-05-21',
    seguimiento: {
      canal: 'mensaje',
      huboEntrevista: false,
    },
  },
  {
    id: 'lead-13',
    nombre: 'Julieta Ríos',
    telefono: '3516 001122',
    promotorId: 'prom-2',
    promotorNombre: 'Ana Rodríguez',
    quiereEntrevista: false,
    lista: 'contacto',
    fechaObtencion: '2026-05-20',
    seguimiento: {
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
    fechaObtencion: '2026-05-19',
    seguimiento: {
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
    fechaObtencion: '2026-05-18',
    seguimiento: {
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
        { nombre: 'Tomás Aguirre', telefono: '3515 223355' },
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
    fechaObtencion: '2026-05-17',
    seguimiento: {
      canal: 'mensaje',
      huboEntrevista: true,
      resultadoEntrevista: 'compro',
      idProducto: 'prod-terreno',
      estadoPago: 'sena',
      idBarrio: 'b4',
      numeroRecibo: '003456',
      brindoReferidos: false,
      observaciones: 'Interesado en lotes cercanos al centro.',
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
      observaciones: 'Tiene dudas sobre la financiación. Llamar en 15 días.',
    },
  },
];

// Copia mutable para que guardarSeguimiento actualice en memoria durante la sesión demo
let demoLeads: Lead[] = BASE_LEADS.map((l) => ({ ...l }));

export function getDemoLeads(): Lead[] {
  return demoLeads.map((l) => ({ ...l }));
}

export function updateDemoLead(leadId: string, seguimiento: SeguimientoLead): Lead {
  const lead = demoLeads.find((l) => l.id === leadId);
  if (!lead) throw new Error('Lead no encontrado en demo');
  const updated: Lead = {
    ...lead,
    seguimiento: { ...lead.seguimiento, ...seguimiento },
  };
  demoLeads = demoLeads.map((l) => (l.id === leadId ? updated : l));
  return { ...updated };
}

export function createDemoLead(data: NuevoLeadData): Lead {
  const now = new Date();
  const promotorNombre = DEMO_PROMOTORES.find((p) => p.id === data.promotorId)?.nombre;
  const newLead: Lead = {
    id: `lead-${Date.now()}`,
    nombre: data.nombre.trim(),
    telefono: data.telefono.trim(),
    promotorId: data.promotorId,
    promotorNombre,
    domicilio: data.domicilio?.trim() || undefined,
    quiereEntrevista: data.quiereEntrevista,
    lista: data.lista,
    fechaObtencion: now.toISOString().slice(0, 10),
    fechaAlta: now.toISOString(),
    seguimiento: {},
  };
  demoLeads = [...demoLeads, newLead];
  return { ...newLead };
}
