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
  { id: 'b1', nombre: 'Barrio Los Tilos' },
  { id: 'b2', nombre: 'Barrio El Mirador' },
  { id: 'b3', nombre: 'Barrio San Martín' },
  { id: 'b4', nombre: 'Barrio La Esperanza' },
  { id: 'b5', nombre: 'Barrio Norte' },
];
