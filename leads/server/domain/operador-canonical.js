import { normalizeNombre } from '../db/encuestas.js';
import { nombresCoinciden } from '../db/operadores-catalog.js';

/** IDs reservados para acciones técnicas — no representan un vendedor real. */
export const IDS_OPERADOR_TECNICO = new Set(['1', '999']);

/**
 * Mapa estático planilla CRM / Excel → operador canónico en SQL Server.
 * Claves normalizadas con normalizeNombre().
 */
export const OPERADORES_CANONICOS = {
  'belen a': { id: '39', nombre: 'ALLENDRE BELÉN ELIZABETH', rol: 'supervisor' },
  'allendre belen elizabeth': { id: '39', nombre: 'ALLENDRE BELÉN ELIZABETH', rol: 'supervisor' },
  'carolina a': { id: '139', nombre: 'AGUIRRE CAROLINA', rol: 'promotor' },
  'aguirre cl': { id: '139', nombre: 'AGUIRRE CAROLINA', rol: 'promotor' },
  'aguirre carolina': { id: '139', nombre: 'AGUIRRE CAROLINA', rol: 'promotor' },
  'christian r': { id: '37', nombre: 'ROCDAN CRISTIAN GABRIEL', rol: 'supervisor' },
  'rocdan cristian': { id: '37', nombre: 'ROCDAN CRISTIAN GABRIEL', rol: 'supervisor' },
  'rocdan cristian gabriel': { id: '37', nombre: 'ROCDAN CRISTIAN GABRIEL', rol: 'supervisor' },
  'marina l': { id: '72', nombre: 'LEIVA MARINA SOLEDAD', rol: 'supervisor' },
  'leiva marina soledad': { id: '72', nombre: 'LEIVA MARINA SOLEDAD', rol: 'supervisor' },
  'lucia n': { id: '78', nombre: 'NOGUERA LUCIA ESTHER', rol: 'supervisor' },
  'noguera lucia esther': { id: '78', nombre: 'NOGUERA LUCIA ESTHER', rol: 'supervisor' },
  'samaniego l': { id: '141', nombre: 'SAMANIEGO LUCAS', rol: 'promotor' },
  'samaniego lucas': { id: '141', nombre: 'SAMANIEGO LUCAS', rol: 'promotor' },
  'dahiana c': { id: '47', nombre: 'CERRIZUELA DAHIANA  AYLEN', rol: 'supervisor' },
  'cerrizuela dahiana aylen': { id: '47', nombre: 'CERRIZUELA DAHIANA  AYLEN', rol: 'supervisor' },
  'gamarra e': { id: '142', nombre: 'GAMARRA EZEQUIEL', rol: 'promotor' },
  'gamarra ezequiel': { id: '142', nombre: 'GAMARRA EZEQUIEL', rol: 'promotor' },
  'ezequiel gamarra': { id: '142', nombre: 'GAMARRA EZEQUIEL', rol: 'promotor' },
  'estefania g': { id: '42', nombre: 'GAMARRA ESTEFANIA LIA', rol: 'supervisor' },
  'gamarra estefania lia': { id: '42', nombre: 'GAMARRA ESTEFANIA LIA', rol: 'supervisor' },
  'estefania': { id: '42', nombre: 'GAMARRA ESTEFANIA LIA', rol: 'supervisor' },
  'velazco g': { id: '110', nombre: 'VELAZCO GERALDINE', rol: 'promotor' },
  'velazco geraldine': { id: '110', nombre: 'VELAZCO GERALDINE', rol: 'promotor' },
  'adela alcaraz': { id: '45', nombre: 'ALCARAZ RUIZ ADELA', rol: 'supervisor' },
  'alcaraz ruiz adela': { id: '45', nombre: 'ALCARAZ RUIZ ADELA', rol: 'supervisor' },
  'catherine contreras': { id: '130', nombre: 'CONTRERAS CATHERINE  GERALDINE', rol: 'supervisor' },
  'contreras catherine geraldine': { id: '130', nombre: 'CONTRERAS CATHERINE  GERALDINE', rol: 'supervisor' },
  'fatima farias': { id: '123', nombre: 'FÁTIMA FARÍAS', rol: 'supervisor' },
  'fatima farias': { id: '123', nombre: 'FÁTIMA FARÍAS', rol: 'supervisor' },
  'cecilia fernandez': { id: '101', nombre: 'FERNANDEZ CECILIA IZABEL', rol: 'supervisor' },
  'fernandez cecilia izabel': { id: '101', nombre: 'FERNANDEZ CECILIA IZABEL', rol: 'supervisor' },
  'norma m': { id: '23', nombre: 'MORZAN NORMA', rol: 'supervisor' },
  'morzan norma': { id: '23', nombre: 'MORZAN NORMA', rol: 'supervisor' },
  'giselle roa': { id: '126', nombre: 'ROA ANGELES GISELLE', rol: 'supervisor' },
  'roa angeles giselle': { id: '126', nombre: 'ROA ANGELES GISELLE', rol: 'supervisor' },
  'naara pona': { id: null, nombre: 'PONA NAARA', rol: 'supervisor' },
  'pona naara': { id: null, nombre: 'PONA NAARA', rol: 'supervisor' },
  'leonel c': { id: '132', nombre: 'CAJAL JESUS LEONEL', rol: 'promotor' },
  'cajal jesus leonel': { id: '132', nombre: 'CAJAL JESUS LEONEL', rol: 'promotor' },
  'nildo c': { id: '1134', nombre: 'CAJAL NILDO NORMANDO', rol: 'promotor' },
  'cajal nildo normando': { id: '1134', nombre: 'CAJAL NILDO NORMANDO', rol: 'promotor' },
  'santiago m': { id: '87', nombre: 'MERELES SANTIAGO', rol: 'supervisor' },
  'mereles santiago': { id: '87', nombre: 'MERELES SANTIAGO', rol: 'supervisor' },
  'martin q': { id: '96', nombre: 'QUINTANA MARTIN', rol: 'supervisor' },
  'quintana martin': { id: '96', nombre: 'QUINTANA MARTIN', rol: 'supervisor' },
  'martiniano s': { id: '2', nombre: 'SOSA  MARTINIANO', rol: 'supervisor' },
  'sosa martiniano': { id: '2', nombre: 'SOSA  MARTINIANO', rol: 'supervisor' },
  'federico c': { id: '121', nombre: 'CEBALLOS BERTERO FEDERICO', rol: 'supervisor' },
  'ceballos bertero federico': { id: '121', nombre: 'CEBALLOS BERTERO FEDERICO', rol: 'supervisor' },
  'tania garcia': { id: '122', nombre: 'GARCÍA TANIA', rol: 'supervisor' },
  'garcia tania': { id: '122', nombre: 'GARCÍA TANIA', rol: 'supervisor' },
  'lucila': { id: '78', nombre: 'NOGUERA LUCIA ESTHER', rol: 'supervisor' },
  'marina': { id: '72', nombre: 'LEIVA MARINA SOLEDAD', rol: 'supervisor' },
};

/** Construye id → nombre canónico desde filas del historial SQL. */
export function buildOperadorHistoryMap(historialRows = []) {
  const map = new Map();
  for (const row of historialRows) {
    const id = String(row.operador_id ?? row.operadorId ?? '').trim();
    const nombre = String(row.operador_nombre ?? row.operadorNombre ?? '').trim();
    if (!id || !nombre || IDS_OPERADOR_TECNICO.has(id)) continue;
    if (/soporte t[eé]cnico/i.test(nombre)) continue;
    const prev = map.get(id);
    if (!prev || nombre.length > prev.nombre.length) {
      map.set(id, { id, nombre, rol: row.operador_rol ?? row.operadorRol ?? 'promotor' });
    }
  }
  return map;
}

function buscarEnMapaEstatico(nombre) {
  const norm = normalizeNombre(nombre);
  if (!norm) return null;
  if (OPERADORES_CANONICOS[norm]) return { ...OPERADORES_CANONICOS[norm] };
  for (const [key, op] of Object.entries(OPERADORES_CANONICOS)) {
    if (nombresCoinciden(norm, key)) return { ...op };
  }
  return null;
}

function buscarEnHistorialPorNombre(nombre, historyMap) {
  if (!historyMap?.size) return null;
  for (const op of historyMap.values()) {
    if (nombresCoinciden(nombre, op.nombre)) return { ...op };
  }
  return null;
}

function idEsTecnico(id) {
  const s = String(id ?? '').trim();
  return !s || IDS_OPERADOR_TECNICO.has(s);
}

/**
 * Resuelve el operador canónico para agrupar métricas o persistir seguimiento.
 * Prioridad: promotorNombre CRM → mapa estático → historial SQL por id → historial por nombre.
 */
export function resolveOperadorCanonico({
  operadorId = null,
  operadorNombre = null,
  promotorNombre = null,
  historyMap = null,
} = {}) {
  const candidatos = [promotorNombre, operadorNombre].filter(Boolean);

  for (const nombre of candidatos) {
    const estatico = buscarEnMapaEstatico(nombre);
    if (estatico) return estatico;
  }

  for (const nombre of candidatos) {
    const desdeHist = buscarEnHistorialPorNombre(nombre, historyMap);
    if (desdeHist) return desdeHist;
  }

  const id = String(operadorId ?? '').trim();
  if (!idEsTecnico(id) && historyMap?.has(id)) {
    return { ...historyMap.get(id) };
  }

  if (!idEsTecnico(id) && operadorNombre) {
    return {
      id,
      nombre: String(operadorNombre).trim(),
      rol: 'promotor',
    };
  }

  for (const nombre of candidatos) {
    return {
      id: idEsTecnico(id) ? null : id,
      nombre: String(nombre).trim(),
      rol: 'promotor',
    };
  }

  return {
    id: idEsTecnico(id) ? null : id,
    nombre: String(operadorNombre || promotorNombre || 'Sin asignar').trim(),
    rol: 'promotor',
  };
}

/** Clave estable para agrupar cierres en el dashboard (evita filas duplicadas). */
export function claveAgrupacionOperador(canonico) {
  // Agrupar siempre por nombre canónico: algunos ids SQL están mal asignados (ej. 110 compartido).
  return `nom:${normalizeNombre(canonico?.nombre ?? '')}`;
}
