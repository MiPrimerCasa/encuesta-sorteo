/** Catálogo fijo de la app (productos y barrios). No son leads de prueba. */

export const productosCatalog = [
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

export const barriosCatalog = [
  { id: 'b1', nombre: 'Cecotto' },
  { id: 'b5', nombre: 'Doña Valentina I' },
  { id: 'b6', nombre: 'Doña Valentina II' },
  { id: 'b3', nombre: 'Los Bufalos' },
  { id: 'b2', nombre: 'Los Elfos' },
  { id: 'b4', nombre: 'Palmares' },
  { id: 'b7', nombre: 'Rigonatto' },
];
